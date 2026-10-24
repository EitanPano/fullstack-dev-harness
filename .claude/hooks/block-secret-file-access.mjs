#!/usr/bin/env node
// PreToolUse guardrail on every tool (`*`): blocks any call that names a secret file or dumps
// the environment, which `permissions.deny` cannot see inside a command string.
// - Inspected: path fields, every shell token (raw and wrapper-stripped) and the quoted
//   strings of inline code (`python -c "open('.env')"`).
// - Not inspected: a Write's `content` or a Grep `pattern`, which legitimately mention env files.
// - Secrets match as file names, so a word `secret` passes; `.env.example|sample|template` pass.
import {
  allow,
  block,
  commandLines,
  commandOf,
  commandTails,
  escapeForms,
  inlineCode,
  programName,
  readPayload,
  readsStdin,
  runtimeOf,
  segmentTokens,
  shellSegments,
  tailViews,
  tokenize
} from './lib/guardrail.mjs'

// File names that hold credentials.
const SECRET_NAME = [
  /^\.env(\..+)?$/i, // .env, .env.local, .env.production, …
  /\.(pem|key|p12|pfx|jks|keystore|kdbx|tfstate)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^(\.npmrc|\.netrc|\.pgpass|\.git-credentials|\.htpasswd|kubeconfig)$/i,
  /^(\.pypirc|pip\.(conf|ini))$/i, // package-index credentials
  /^(credentials|secrets?)\.(json|ya?ml|toml|env|txt|properties|ini)$/i,
  /service[-_]?account.*\.json$/i
]
const SECRET_NAME_ALLOWED = /^\.env\.(example|sample|template)$/i
// Directories that only ever hold credentials.
const SECRET_DIR = /(^|[\/\\])(\.aws|\.ssh|\.gnupg|\.kube|\.docker)([\/\\]|$)/i

const PATH_FIELDS = ['file_path', 'path', 'notebook_path']
const PATH_LIST_FIELDS = ['paths', 'file_paths']
// A whole-object read of the environment, per language (see runtimeOf); reading one variable by
// name passes (`os.environ['X']`, `process.env.X`, `$ENV{X}`, `ENV.fetch('X')`, `getenv('X')`).
const ENV_DUMP = {
  python: { name: 'os.environ', pattern: /(?<!\w)environb?\b(?!\s*\[|\s*\.get\b)/ },
  node: {
    name: 'process.env',
    pattern: /\b(process|Bun|Deno)\.env\b(?!\s*[.[])|\bDeno\.env\.toObject\b/
  },
  perl: { name: '%ENV', pattern: /%ENV\b/ },
  ruby: { name: 'ENV', pattern: /\bENV\b(?!\s*(\[|\.(fetch\b|key\?|has_key\?|include\?)))/ },
  php: { name: '$_ENV', pattern: /\$_(ENV|SERVER)\b(?!\s*\[)|\bgetenv\s*\(\s*\)/ }
}

const payload = await readPayload()
const toolInput = payload.tool_input
const tool = payload.tool_name ?? 'tool'

const namedPaths = [
  ...PATH_FIELDS.map(field => toolInput[field]),
  ...PATH_LIST_FIELDS.flatMap(field => (Array.isArray(toolInput[field]) ? toolInput[field] : []))
].filter(value => typeof value === 'string')

const blockedPath = namedPaths.find(value => isSecretPath(value.trim()))
if (blockedPath !== undefined) {
  block(`blocked ${tool} call touching a secret file: ${blockedPath}. Use .env.example instead.`)
}

const command = commandOf(payload)
if (/\[(System\.)?Environment\]::GetEnvironmentVariables?\b/i.test(command)) {
  block(`blocked ${tool} call that dumps the environment (GetEnvironmentVariables). Read one variable by name instead.`)
}
// The segments of a command string handed to a shell (`bash -c "cd x; printenv"`) count too.
for (const segment of commandLines(command).flatMap(shellSegments)) {
  // `env` and `printenv` alone dump everything; checked before wrapper stripping, which
  // would otherwise remove a bare `env` as the wrapper form `env NAME=value cmd`.
  if (/^(printenv|env)(\s+-\w+)*$/i.test(segment)) {
    block(`blocked ${tool} call that dumps the environment (${segment.split(/\s/)[0]}). Read one variable by name instead.`)
  }
  // Read as written and, when there is a backslash, the way bash unescapes it
  // (`cat .\env` is `cat .env`); either reading may name a secret.
  for (const unescape of escapeForms(segment)) {
    const tokens = segmentTokens(segment, unescape)
    if (tokens.length === 0) continue
    // The wrapper-stripped tokens drop runner flags such as `--env-file`, so the raw tokens
    // are scanned too, however the command is wrapped.
    const candidates = [...tokens, ...rawTokens(segment, unescape)]
    if (candidates.some(token => isSecretPath(stripRedirect(token)))) {
      block(`blocked ${tool} call naming a secret file in the command. Use .env.example instead.`)
    }
    judgeProgram(tokens)
    // The wrapper and runner flag tables are best effort: an unlisted flag can make its value the
    // apparent program and hide the real one (`uv run --newflag x python -c "…"`, `timeout
    // --newflag x printenv`). So every later token is judged as a program start too.
    for (const tail of commandTails(segment, unescape)) {
      for (const view of tailViews(tail, unescape)) judgeProgram(view)
    }
  }
}

allow()

// Inline code, stdin code and environment dumps of one program and its arguments.
function judgeProgram(tokens) {
  const program = programName(tokens[0])
  const args = tokens.slice(1)
  const runtime = runtimeOf(program)
  const code = inlineCode(program, args)
  if (code !== null && inlineNamesSecret(code)) {
    block(`blocked ${tool} call whose inline code names a secret file. Use .env.example instead.`)
  }
  // An interpreter that reads its program from stdin (`python - <<EOF`, `echo "…" | node`,
  // `python -m asyncio`) has the code in a heredoc or a pipe, which the segment split has
  // already torn apart: judge the whole command text, which fails closed.
  if (readsStdin(program, args)) {
    if (ENV_DUMP[runtime].pattern.test(command)) {
      block(
        `blocked ${tool} call that dumps the environment (${ENV_DUMP[runtime].name} via stdin). ` +
          'Read one variable by name instead.'
      )
    }
    if (inlineNamesSecret(command)) {
      block(`blocked ${tool} call whose stdin code names a secret file. Use .env.example instead.`)
    }
  }
  const dump = envDump(program, args, code)
  if (dump !== null) {
    block(
      `blocked ${tool} call that dumps the environment (${dump}). ` +
        'Read one variable by name instead.'
    )
  }
}

function isSecretPath(value) {
  if (value === '' || value === '-') return false
  if (SECRET_DIR.test(value)) return true
  // poetry's repository credentials: <user config dir>/pypoetry/auth.toml.
  if (/(^|[\\/])pypoetry[\\/]auth\.toml$/i.test(value)) return true
  let base = value.split(/[\\/]/).pop() ?? ''
  // A glob such as `.env*` or `backend/.env.*` names every env file.
  if (/[*?]/.test(base)) base = base.replace(/[*?].*$/, '')
  if (base === '') return false
  if (SECRET_NAME_ALLOWED.test(base)) return false
  if (/^\.env/i.test(base)) return true
  return SECRET_NAME.some(pattern => pattern.test(base))
}

// Every token of the segment (quotes already removed, so `--env-file=".env"` is
// `--env-file=.env`), plus the value of each `--flag=value` / `NAME=value`. A token with
// whitespace is a quoted string handed to something else (inline code, a shell command); it is
// handled where it is parsed, not as a file name.
function rawTokens(segment, unescape) {
  const out = []
  for (const token of tokenize(segment, unescape)) {
    if (/\s/.test(token)) continue
    out.push(token)
    const eq = token.indexOf('=')
    if (eq > 0) out.push(token.slice(eq + 1))
  }
  return out
}

// Inline code cannot be parsed, so every quoted string in it is treated as a possible file
// name, and so is any bare word that is unmistakably a secret (`.env`, a secret directory).
// An identifier chain outside quotes (`obj.key`) is code, not a file.
function inlineNamesSecret(code) {
  const parts = code.split(/\\*["'`]/)
  return parts.some((part, index) => {
    const quoted = index % 2 === 1
    return part
      .split(/[\s()[\]{},;=:+]+/)
      .some(piece => isSecretPath(piece) && (quoted || isBareSecret(piece)))
  })
}

function isBareSecret(piece) {
  return /^\.env/i.test(piece.split(/[\\/]/).pop() ?? '') || SECRET_DIR.test(piece)
}

function stripRedirect(token) {
  return token.replace(/^[<>]+/, '')
}

// `code` is the program's inline code (see inlineCode), or null.
function envDump(program, args, code) {
  if (program === 'printenv' && args.length === 0) return 'printenv'
  // `env` with only its own flags (`env -u FOO`) and no program prints the environment too.
  if (program === 'env' && args.every(arg => arg.startsWith('-'))) return 'env'
  if (program === 'set' && args.length === 0) return 'set'
  if (program === 'export' && (args.length === 0 || args.every(arg => arg === '-p'))) return 'export -p'
  if (program === 'declare' && args.length > 0 && args.every(arg => /^-[px]+$/.test(arg))) return 'declare -x'
  if (['get-childitem', 'gci', 'ls', 'dir', 'get-item', 'gi'].includes(program) && args.some(arg => /^env:\\?\*?$/i.test(arg))) return 'Get-ChildItem Env:'
  // A whole-object read of the environment in inline code (`print(os.environ)`,
  // `dict(os.environ)`, `{**os.environ}`, `console.log(process.env)`, `print %ENV`).
  const runtime = runtimeOf(program)
  if (runtime === null) return null
  const dump = ENV_DUMP[runtime]
  if (code !== null && dump.pattern.test(code)) return `${dump.name} dump`
  // Python: any other argument too, a script or module that receives code as a string.
  if (runtime === 'python' && args.some(arg => !arg.startsWith('-') && dump.pattern.test(arg))) {
    return `${dump.name} dump`
  }
  return null
}
