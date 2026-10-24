// Shared code of the PreToolUse guardrail hooks: payload I/O, path helpers and shell parsing.
// The hooks fail closed:
// - exit 0 allows, exit 2 blocks with the reason on stderr; an unreadable payload blocks.
// - readPayload() makes a crash after parsing block. A crash before it (a syntax error) is
//   covered by `onFailure: "block"` in .claude/settings.json.
import path from 'node:path'
import process from 'node:process'

export const ALLOW = 0
export const BLOCK = 2

export function block(message) {
  console.error(`[guardrail] ${message}`)
  process.exit(BLOCK)
}

export function allow() {
  process.exit(ALLOW)
}

export async function readPayload() {
  process.on('uncaughtException', error => {
    block(`hook crashed, blocking by default: ${error?.message ?? error}`)
  })
  process.on('unhandledRejection', reason => {
    block(`hook crashed, blocking by default: ${reason?.message ?? reason}`)
  })

  let input = ''
  for await (const chunk of process.stdin) input += chunk

  if (input.trim() === '') block('empty hook payload, blocking by default')

  let payload
  try {
    payload = JSON.parse(input)
  } catch {
    block('unreadable hook payload (invalid JSON), blocking by default')
  }

  if (!isPlainObject(payload)) block('hook payload is not an object, blocking by default')
  if (!isPlainObject(payload.tool_input)) block('hook payload has no tool_input, blocking by default')

  return payload
}

// The sub-agent role, or null in the interactive session. Claude Code sends the agent's
// frontmatter `name` as `agent_type`; AGENT_ROLE in the environment is an override for a
// headless driver. `agent_type` wins when both are present.
export function resolveRole(payload) {
  for (const candidate of [payload.agent_type, process.env.AGENT_ROLE]) {
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return null
}

// The project root the hook should measure paths against. CLAUDE_PROJECT_DIR is set by
// Claude Code for every hook and does not move when the session runs `cd`; payload.cwd
// does, so it is only a fallback for runtimes that do not export the variable.
export function projectRoot(payload) {
  return path.resolve(process.env.CLAUDE_PROJECT_DIR ?? payload.cwd ?? process.cwd())
}

// The directory Claude Code's file tools resolve a relative path against: the session's
// current directory (payload.cwd), which a Bash `cd` moves. Null when the payload does not
// carry a usable value.
export function sessionCwd(payload) {
  const cwd = payload.cwd
  return typeof cwd === 'string' && path.isAbsolute(cwd) ? cwd : null
}

// Claude Code rewrites some spellings before opening a file (surrounding whitespace, a leading
// `~`, `/c/...` on Windows). The hooks refuse them rather than copy that unversioned logic, so
// a plain path means the same thing to both sides.
export function isCanonicalPath(rawPath) {
  if (rawPath !== rawPath.trim()) return false
  if (rawPath.startsWith('~')) return false
  if (process.platform === 'win32' && /^\/[a-zA-Z](\/|$)/.test(rawPath)) return false
  return true
}

// rawPath relative to root with forward slashes, a relative one resolved against `base` (the
// session cwd), so `frontend/../backend/x.ts` collapses first. `escapes` is true for the root
// itself or anything outside it, which no role may write.
export function toProjectRelative(rawPath, root, base = root) {
  const absolute = path.resolve(base, rawPath)
  const rel = path.relative(root, absolute).split(path.sep).join('/')
  const escapes = rel === '' || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)
  return { rel, escapes }
}

// Shell command helpers shared by the Bash|PowerShell hooks.

// The shell command of a payload ('' for a tool that has none). A Bash or PowerShell call
// whose command is not a string cannot be inspected, so it blocks.
export function commandOf(payload) {
  const command = payload.tool_input.command
  if (typeof command === 'string') return command
  if (payload.tool_name === 'Bash' || payload.tool_name === 'PowerShell') {
    block('shell call whose command is not a string cannot be inspected, blocking by default')
  }
  return ''
}

// Operators that start a new command, matched only outside quotes.
const SEGMENT_OPERATORS = ['&&', '||', '|', ';', '&', '\n', '\r', '$(', '`', '(', ')']

// Programs that run another program: the real program is what follows their flags.
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'pwsh', 'powershell', 'cmd'])
const PREFIXES = new Set([
  'sudo', 'doas', 'env', 'nohup', 'time', 'command', 'exec', 'eval', 'xargs', 'nice', 'busybox',
  'timeout', 'stdbuf', 'caffeinate', 'npx', 'pnpx'
])

// Package runners (`bun run pkg`, `uv run prog`, …) run the program named after their flags.
// - The tables list value flags, which consume the next token; otherwise
//   `uv run --directory backend rm` reads `backend` as the program.
// - Best effort, from uv 0.12.23 and bun 1.4 `--help` (plus uv's hidden --python-preference,
//   --preview-features, --python-fetch), `npm exec --help`, and the poetry, pdm, hatch CLI docs.
// - Left out on purpose: bun's -e/-p/--inspect* (optional values), npm's -c (a command string,
//   re-tokenised) and -p (--parseable). pipx, pnpm and yarn have no table.
const flagSet = list => new Set(list.split(/\s+/).filter(Boolean))
const UV_COMMON =
  '-w --with --with-editable --with-requirements --python-platform --index --default-index ' +
  '-i --index-url --extra-index-url -f --find-links --index-strategy --keyring-provider ' +
  '-P --upgrade-package --upgrade-group --resolution --prerelease --prerelease-package ' +
  '--fork-strategy --exclude-newer --exclude-newer-package --no-sources-package ' +
  '--reinstall-package --link-mode -C --config-setting --config-settings-package ' +
  '--no-build-isolation-package --no-build-package --no-binary-package --cache-dir ' +
  '--refresh-package --color -p --python --allow-insecure-host --directory --project ' +
  '--config-file --env-file --python-preference --preview-features --python-fetch'
const UV_RUN_FLAGS = flagSet(
  `${UV_COMMON} --extra --no-extra --group --no-group --only-group --no-editable-package --package`
)
const UV_TOOL_FLAGS = flagSet(
  `${UV_COMMON} --from -c --constraints -b --build-constraints --overrides --torch-backend`
)
const UV_GLOBAL_FLAGS = flagSet(
  '--cache-dir --color --allow-insecure-host --directory --project --config-file ' +
    '--python-preference --preview-features --python-fetch'
)
const BUN_RUN_FLAGS = flagSet(
  '--elide-lines -F --filter --shell --watch-kill-signal -r --preload --require --import ' +
    '--cpu-prof-name --cpu-prof-dir --cpu-prof-interval --heap-prof-name --heap-prof-dir ' +
    '--heap-prof-interval --install --port --conditions --fetch-preconnect ' +
    '--max-http-header-size --dns-result-order --redirect-warnings --disable-warning --title ' +
    '--unhandled-rejections --console-depth --user-agent --cron-title --cron-period ' +
    '--main-fields --extension-order --tsconfig-override -d --define --drop --feature -l ' +
    '--loader --jsx-factory --jsx-fragment --jsx-import-source --jsx-runtime --env-file ' +
    '--cwd -c --config'
)
const BUNX_FLAGS = flagSet('-p --package')
const NPM_FLAGS = flagSet('--package -w --workspace --script-shell')
const NO_FLAGS = new Set()

// A runner entry:
// - `global` and `flags`: value flags before and after the subcommand words (`path`).
// - `envPrefix`: the program may carry a `name:` prefix (hatch).
// - `module`: -m/--module runs `python -m <module>`. `stdin`: what reads a script after `-`.
const sub = (path, flags, options = {}) => ({ path, flags, ...options })
const RUNNERS = {
  bun: {
    global: BUN_RUN_FLAGS,
    subs: [sub(['x'], BUNX_FLAGS), sub(['run'], BUN_RUN_FLAGS, { stdin: 'bun' })]
  },
  bunx: { global: BUNX_FLAGS, subs: [sub([], BUNX_FLAGS)] },
  npm: {
    global: NPM_FLAGS,
    subs: [sub(['exec'], NPM_FLAGS), sub(['run'], NPM_FLAGS), sub(['x'], NPM_FLAGS)]
  },
  pnpm: {
    global: NO_FLAGS,
    subs: [sub(['dlx'], NO_FLAGS), sub(['exec'], NO_FLAGS), sub(['run'], NO_FLAGS)]
  },
  yarn: { global: NO_FLAGS, subs: [sub(['dlx'], NO_FLAGS), sub(['run'], NO_FLAGS)] },
  uv: {
    global: UV_GLOBAL_FLAGS,
    subs: [
      sub(['run'], UV_RUN_FLAGS, { module: true, stdin: 'python' }),
      sub(['tool', 'run'], UV_TOOL_FLAGS)
    ]
  },
  uvx: { global: UV_TOOL_FLAGS, subs: [sub([], UV_TOOL_FLAGS)] },
  poetry: { global: flagSet('-C --directory -P --project'), subs: [sub(['run'], NO_FLAGS)] },
  pipx: { global: NO_FLAGS, subs: [sub(['run'], NO_FLAGS)] },
  pdm: {
    global: NO_FLAGS,
    subs: [sub(['run'], flagSet('-p --project -k --skip --venv --env --env-file --working-dir'))]
  },
  hatch: {
    global: flagSet('-e --env -p --project --data-dir --cache-dir --config'),
    subs: [sub(['run'], NO_FLAGS)],
    envPrefix: true
  }
}

// `python`, `python3`, `python314`, `python3.14t`, `py`, `pyw`, `pypy3`, `ipython`, … (a `.exe`
// suffix is gone by now).
const PYTHON_PROGRAM = /^(pyw?|pythonw?(\d+(\.\d+)?[a-z]*)?|pypy\d*(\.\d+)?|ipython\d*)$/
// Modules that run code handed to them as an argument or from stdin (`ipython` stands for
// IPython too: module names are compared in lower case).
const PYTHON_INLINE_MODULES = new Set([
  'timeit', 'cprofile', 'profile', 'trace', 'code', 'pdb', 'runpy', 'asyncio', 'ipython'
])
// The subset that is a REPL: with no argument it reads its program from stdin.
const PYTHON_REPL_MODULES = new Set(['code', 'pdb', 'asyncio', 'ipython'])
// Programs that run code handed to them inline or on stdin; the views of an unresolved runner
// tail look for these.
const SCRIPT_RUNTIMES = new Set(['node', 'bun', 'deno', 'tsx', 'ts-node', 'perl', 'ruby', 'php'])
// Flags that mean an interpreter is not reading a program from stdin: version and help, a code
// argument (handled elsewhere), node's test and run modes.
const NO_STDIN_FLAG =
  /^(-[vVhcep]|--(version|help|test.*|check|run.*|eval.*|print.*|inspect.*|v8-options|completion-bash))$/

// Flags that consume the next token.
const FLAG_WITH_VALUE = /^-(u|g|p|C|h|r|t|T|I|L|n|P|d|s|E|S)$/
const DURATION = /^\d+(\.\d+)?[smhd]?$/

// Splits a command at operators that start a new command (&&, ||, |, ;, &, subshells),
// leaving quoted strings intact so `node -e "f(process.env)"` stays one segment.
export function shellSegments(command) {
  const segments = []
  let current = ''
  let quote = null
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i]
    if (quote !== null) {
      current += char
      if (char === '\\' && quote === '"' && i + 1 < command.length) {
        current += command[i + 1]
        i += 1
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    // Outside quotes `\"` and `\'` are literal characters in bash, and so is a quote after
    // PowerShell's backtick: they must not open a string that swallows the operators after
    // them. `\\` is consumed as a pair so `\\"` still opens one.
    if (char === '\\' && /^[\\"']$/.test(command[i + 1] ?? '')) {
      current += char + command[i + 1]
      i += 1
      continue
    }
    if ((char === '"' || char === "'") && command[i - 1] === '`') {
      current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    const operator = SEGMENT_OPERATORS.find(candidate => command.startsWith(candidate, i))
    if (operator !== undefined) {
      segments.push(current)
      current = ''
      i += operator.length - 1
      continue
    }
    current += char
  }
  segments.push(current)
  return segments.map(segment => segment.trim()).filter(segment => segment !== '')
}

// Tokens of one segment with surrounding quotes removed; leading NAME=value assignments,
// wrappers (sudo, env, timeout, bash -lc, powershell -NoProfile -Command, …) and package
// runners (bunx, npx, bun x, bun run, …) are stripped so the real program is first. A
// quoted command string handed to a shell is re-tokenised.
export function segmentTokens(segment, unescape = false) {
  return analyzeSegment(segment, unescape).tokens
}

// What follows each package runner in the segment, flags included and unresolved. A runner
// whose flag table is wrong or incomplete shifts the program by a token, so a caller that
// must not miss a program can look at every later token (see block-destructive-bash).
export function runnerTails(segment, unescape = false) {
  return analyzeSegment(segment, unescape).tails
}

// How many wrappers and runners are peeled before the program. A deeper nest is refused: an
// analysis that stopped there would let `sudo` repeated past the limit hide any command.
const MAX_WRAPPER_DEPTH = 8

// Every later token after a package runner that names an interpreter, analysed as the start of
// a command (the token lists, program first). A runner's flag table is best effort, so
// `uv run --newflag x python -c "…"` makes `x` the apparent program; a caller that judges
// inline code, stdin and the environment looks at these views too, which fails closed.
export function interpreterViews(segment, unescape = false) {
  const views = []
  for (const tail of analyzeSegment(segment, unescape).tails) {
    for (let i = 0; i < tail.length; i += 1) {
      const program = programName(tail[i])
      if (PYTHON_PROGRAM.test(program) || SCRIPT_RUNTIMES.has(program)) {
        views.push(analyzeTokens(tail.slice(i), unescape).tokens)
      }
    }
  }
  return views
}

function analyzeSegment(segment, unescape = false) {
  return analyzeTokens(tokenize(segment, unescape), unescape)
}

// The `unescape` values a caller must judge: as written (Windows paths keep backslashes) and,
// when there is a backslash, the bash reading (`rm \-rf x` is `rm -rf x`). A command is refused
// when either reading is.
export function escapeForms(segment) {
  return segment.includes('\\') ? [false, true] : [false]
}

function analyzeTokens(words, unescape = false) {
  let tokens = words
  const tails = []
  // Set when the last thing stripped was `env`: with no program left it is a bare `env`, which
  // prints the environment, so the caller must still see it.
  let pendingEnv = null
  for (let guard = 0; guard <= MAX_WRAPPER_DEPTH; guard += 1) {
    while (tokens.length > 0 && /^[A-Za-z_]\w*=/.test(tokens[0])) tokens = tokens.slice(1)
    if (tokens.length === 0) {
      return { tokens: pendingEnv === null ? tokens : ['env', ...pendingEnv], tails }
    }
    pendingEnv = null
    const program = programName(tokens[0])
    const runner = Object.hasOwn(RUNNERS, program) ? RUNNERS[program] : undefined
    if (runner !== undefined) {
      const stripped = stripRunner(runner, tokens)
      if (stripped === null) return { tokens, tails }
      tails.push(stripped.tail)
      // No `rest`: the subcommand sits behind a flag the table does not know. The tail is
      // recorded for the callers that judge every later token, and the tokens stay as written.
      if (stripped.rest === null) return { tokens, tails }
      tokens = stripped.rest
    } else if (PYTHON_PROGRAM.test(program)) {
      // `python -m pytest` runs the module `pytest`; inline code and scripts stay as they are.
      const module = pythonModule(tokens.slice(1))
      if (module === null) return { tokens, tails }
      tokens = module
    } else if (SHELLS.has(program) || PREFIXES.has(program)) {
      tokens = tokens.slice(1)
      if (program === 'timeout' && tokens.length > 0 && DURATION.test(tokens[0])) {
        tokens = tokens.slice(1)
      }
    } else {
      return { tokens, tails }
    }
    // Drop the wrapper's own flags (`-lc`, `-NoProfile -Command`, `-u root`, `--`, cmd's `/c`).
    const takesValue = ['sudo', 'doas', 'env', 'nice', 'xargs'].includes(program)
    const dropped = []
    while (tokens.length > 0 && isWrapperFlag(program, tokens[0])) {
      const flag = tokens[0]
      tokens = tokens.slice(1)
      dropped.push(flag)
      if (FLAG_WITH_VALUE.test(flag) && takesValue) tokens = tokens.slice(1)
    }
    if (program === 'env') pendingEnv = dropped
    if (tokens.length > 0 && /\s/.test(tokens[0])) {
      tokens = [...tokenize(tokens[0], unescape), ...tokens.slice(1)]
    }
  }
  // Still wrapped after the last peel: refuse what cannot be inspected.
  return block(
    `more than ${MAX_WRAPPER_DEPTH} nested wrappers or runners (sudo, env, uv run, …) in one ` +
      'command; the program behind them cannot be judged, blocking by default'
  )
}

function isWrapperFlag(program, token) {
  return token.startsWith('-') || (program === 'cmd' && /^\/[a-z]$/i.test(token))
}

// Splits a runner call into `rest` (program first, flags stripped) and `tail` (raw tokens after
// the subcommand); null for a non-runner call (`bun install`, `uv sync`). When an unknown flag
// shifted the subcommand, `rest` is null and only `tail` is reported.
function stripRunner(runner, tokens) {
  let i = skipFlags(tokens, 1, runner.global)
  const subAt = at =>
    runner.subs.find(candidate =>
      candidate.path.every((word, offset) => tokens[at + offset]?.toLowerCase() === word)
    )
  const found = subAt(i)
  if (found === undefined) {
    for (let at = 1; at < tokens.length; at += 1) {
      const later = subAt(at)
      if (later !== undefined) return { rest: null, tail: tokens.slice(at + later.path.length) }
    }
    return null
  }
  i += found.path.length
  const tail = tokens.slice(i)
  const seen = new Set()
  const flagsStart = i
  i = skipFlags(tokens, i, found.flags, seen)
  let rest = tokens.slice(i)
  const moduleValue = tokens.slice(flagsStart, i).find(token => token.startsWith('--module='))
  // uv's own Python channels: `-m/--module <mod>` runs `python -m <mod>` and a leading `-`
  // hands a script on stdin to the interpreter. Rewriting them lets the Python analysis judge
  // them, inline modules and stdin included.
  if (found.module === true && moduleValue !== undefined) {
    rest = ['python', '-m', moduleValue.slice('--module='.length), ...rest]
  } else if (found.module === true && (seen.has('-m') || seen.has('--module'))) {
    rest = ['python', '-m', ...rest]
  } else if (found.stdin !== undefined && rest[0] === '-') {
    rest = [found.stdin, ...rest]
  }
  return { rest: runner.envPrefix === true ? stripHatchSelectors(rest) : rest, tail }
}

// Index of the first token after the flags from `start`; `--` ends them.
// - A flag in `valueFlags` consumes the next token, unless written `--flag=value`.
// - A short cluster is read by letter: `-qp 3.14` gives 3.14 to -p, `-pq` gives it `q`.
// - `seen`, when given, collects the flag names met.
function skipFlags(tokens, start, valueFlags, seen) {
  let i = start
  while (i < tokens.length && tokens[i].startsWith('-') && tokens[i] !== '-') {
    const flag = tokens[i]
    i += 1
    if (flag === '--') break
    if (flag.includes('=')) {
      seen?.add(flag.slice(0, flag.indexOf('=')))
      continue
    }
    if (valueFlags.has(flag)) {
      seen?.add(flag)
      i += 1
    } else if (/^-[A-Za-z]{2,}$/.test(flag)) {
      const letters = [...flag.slice(1)]
      const first = letters.findIndex(letter => valueFlags.has(`-${letter}`))
      for (const letter of letters.slice(0, first === -1 ? letters.length : first + 1)) {
        seen?.add(`-${letter}`)
      }
      if (first === letters.length - 1) i += 1
    } else {
      seen?.add(flag)
    }
  }
  return i
}

// `hatch run +py=3.10 -version=9000 test:pytest`: matrix selectors, then `env:program`.
function stripHatchSelectors(tokens) {
  let i = 0
  while (i < tokens.length && /^[+-]\w+=/.test(tokens[i])) i += 1
  const rest = tokens.slice(i)
  if (rest.length > 0) rest[0] = rest[0].replace(/^[\w.-]+:(?![\\/])/, '')
  return rest
}

export function isPythonProgram(program) {
  return PYTHON_PROGRAM.test(program)
}

// Redirections are not arguments: `python - <<EOF`, `python < in.py`, `python 2>err`.
function withoutRedirections(args) {
  const out = []
  for (let i = 0; i < args.length; i += 1) {
    const match = /^(?:\d+|&)?(?:<<<|<<|<|>>|>)(.*)$/.exec(args[i])
    if (match === null) out.push(args[i])
    else if (match[1] === '') i += 1
  }
  return out
}

// Reads how the interpreter was invoked, the way Python parses its own command line:
//   { kind: 'inline', code }        -c <code> (also attached, or in a cluster such as -Ic)
//   { kind: 'module', module, rest } -m <module>
//   { kind: 'script' }               a script path comes first
//   { kind: 'stdin' }                `-`, or nothing to run at all (stdin or a REPL)
//   { kind: 'none' }                 --version, -h, …
// Only options before the script count, so `python run.py -c conf` is a script run.
function parsePython(rawArgs) {
  const args = withoutRedirections(rawArgs)
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '-') return { kind: 'stdin' }
    if (arg === '--') continue
    if (/^--(version|help)$/.test(arg)) return { kind: 'none' }
    if (arg.startsWith('--')) {
      if (arg === '--check-hash-based-pycs') i += 1
      continue
    }
    if (!arg.startsWith('-')) return { kind: 'script' }
    for (let k = 1; k < arg.length; k += 1) {
      const letter = arg[k]
      const attached = arg.slice(k + 1)
      if (letter === 'c') {
        return { kind: 'inline', code: attached !== '' ? attached : (args[i + 1] ?? '') }
      }
      if (letter === 'm') {
        const module = attached !== '' ? attached : (args[i + 1] ?? '')
        return { kind: 'module', module, rest: args.slice(attached !== '' ? i + 1 : i + 2) }
      }
      if (letter === 'W' || letter === 'X') {
        if (attached === '') i += 1
        break
      }
      if (/^V+$|^h$/.test(arg.slice(k))) return { kind: 'none' }
    }
  }
  return { kind: 'stdin' }
}

// The module tokens of `python [flags] -m <module> …` (the module name first), or null when
// the invocation runs inline code, a script, or a module that executes its argument.
function pythonModule(args) {
  const parsed = parsePython(args)
  if (parsed.kind !== 'module' || parsed.module === '') return null
  if (PYTHON_INLINE_MODULES.has(parsed.module.toLowerCase())) return null
  return [parsed.module, ...parsed.rest]
}

// The code an interpreter call executes from its command line (`''` when it is inline but
// the code is missing), or null when there is none: `-c <code>`, or the arguments of a module
// such as `timeit` that runs them as code. Scripts and plain modules have no inline code.
export function pythonInlineCode(args) {
  const parsed = parsePython(args)
  if (parsed.kind === 'inline') return parsed.code
  if (parsed.kind === 'module' && PYTHON_INLINE_MODULES.has(parsed.module.toLowerCase())) {
    return parsed.rest.join(' ')
  }
  return null
}

// True when the interpreter reads its program from stdin (`python -`, `python <<EOF`,
// `… | python`, a REPL module such as `python -m asyncio`), so the code is in a heredoc or a
// pipe and not in the arguments.
export function pythonReadsStdin(args) {
  const parsed = parsePython(args)
  if (parsed.kind === 'stdin') return true
  return (
    parsed.kind === 'module' &&
    PYTHON_REPL_MODULES.has(parsed.module.toLowerCase()) &&
    parsed.rest.length === 0
  )
}

// The same for node, bun, deno and the other script runtimes: a `-` argument, or no program to
// run at all (a bare interpreter in a pipe, or flags only), means the code is on stdin.
export function scriptReadsStdin(rawArgs) {
  const args = withoutRedirections(rawArgs)
  if (args.includes('-')) return true
  return args.every(arg => arg.startsWith('-') && !NO_STDIN_FLAG.test(arg))
}

// The code of `node -e <code>`, `-p`, `--eval`, `--print`, including the attached spellings
// (`-e'code'`, `--eval=code`), or null when the call is not inline. `letters` names the
// short flags that count: `ep` for node and bun, `erp` for perl, ruby and php too.
export function scriptInlineCode(args, letters = 'ep') {
  const short = new RegExp(`^-[${letters}](.*)$`)
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (/^--(eval|print)$/.test(arg) || /^-(pe|ep)$/.test(arg)) return args.slice(i + 1).join(' ')
    const long = /^--(?:eval|print)=(.*)$/.exec(arg)
    if (long !== null) return [long[1], ...args.slice(i + 1)].join(' ')
    const attached = short.exec(arg)
    if (attached !== null) return [attached[1], ...args.slice(i + 1)].join(' ').trim()
  }
  return null
}

export function programName(token) {
  const base = token.replace(/^["']|["']$/g, '').split(/[\\/]/).pop() ?? ''
  return base.replace(/\.(exe|cmd|bat)$/i, '').toLowerCase()
}

// Shell word splitting for guard purposes: quotes are removed and quoted parts join their word
// (`--flag=".env"` is `--flag=.env`); an unterminated quote runs to the end.
// - Default: backslashes stay as written, so Windows paths survive.
// - `unescape`: the bash reading, where `\x` outside quotes is `x` (see escapeForms).
export function tokenize(text, unescape = false) {
  const tokens = []
  let word = null
  let quote = null
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quote !== null) {
      if (char === quote) {
        quote = null
      } else {
        word += char
        if (char === '\\' && quote === '"' && i + 1 < text.length) {
          word += text[i + 1]
          i += 1
        }
      }
    } else if (unescape && char === '\\') {
      if (i + 1 < text.length) {
        word = (word ?? '') + text[i + 1]
        i += 1
      }
    } else if (char === '\\' && /^[\\"';&|<>()$`]$/.test(text[i + 1] ?? '')) {
      // `\` makes a quote or operator literal (`\"` opens no string) and otherwise stays, so
      // `backend\.env` keeps its word. `\ ` still splits: over-splitting errs to blocking, and a
      // PowerShell path ending in `\` must not merge with the `-Recurse` after it.
      const next = text[i + 1]
      word = (word ?? '') + (next === '\\' ? '\\\\' : next)
      i += 1
    } else if ((char === '"' || char === "'") && text[i - 1] === '`') {
      word = (word ?? '') + char // PowerShell's escaped quote
    } else if (char === '"' || char === "'") {
      quote = char
      word ??= ''
    } else if (/\s/.test(char)) {
      if (word !== null) tokens.push(word)
      word = null
    } else {
      word = (word ?? '') + char
    }
  }
  if (word !== null) tokens.push(word)
  return tokens
}

// The command with quoted strings blanked, for scans that must not see string contents.
export function withoutQuotes(command) {
  // An escaped character outside quotes (`\"`) is skipped first so it cannot open a string.
  return command.replace(/\\[\s\S]|"(?:[^"\\]|\\.)*"|'[^']*'/g, match =>
    match.startsWith('\\') ? match : '""'
  )
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
