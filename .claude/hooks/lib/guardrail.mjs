// Shared contract for every PreToolUse guardrail hook in this directory.
//
// A guardrail must refuse what it cannot inspect. Claude Code treats a hook that exits 0,
// crashes, or prints nothing as "go ahead" unless the settings entry has
// `"onFailure": "block"`, so the hooks here converge on two outcomes only:
//   exit 0  — allow (the hook has nothing to say about this call)
//   exit 2  — block (stderr carries the reason; Claude Code shows it to the agent)
// Anything unreadable — empty stdin, invalid JSON, no `tool_input` — blocks.
//
// readPayload() also installs process-level handlers so a bug in a hook after parsing
// still exits 2. A failure before readPayload() (for example a syntax error in the hook
// file itself) is covered by `onFailure: "block"` in .claude/settings.json.
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

// Claude Code rewrites some path spellings before it opens a file: it trims whitespace,
// expands a leading `~` to the home directory and, on Windows, turns `/c/...` into `C:\...`.
// The hooks do not copy that logic (it is unversioned runtime behaviour); a role agent must
// spell paths plainly or be refused. Refusing is the fail-closed choice: if the runtime's
// rules change, a plain path still means the same thing to both sides.
export function isCanonicalPath(rawPath) {
  if (rawPath !== rawPath.trim()) return false
  if (rawPath.startsWith('~')) return false
  if (process.platform === 'win32' && /^\/[a-zA-Z](\/|$)/.test(rawPath)) return false
  return true
}

// Resolves rawPath (relative paths against `base`, the session cwd) and expresses it
// relative to root with forward slashes. `escapes` is true when the target is the root
// itself or lies outside it, which no role may ever write to. Traversal such as
// `frontend/../backend/x.ts` collapses to its real target before any prefix comparison.
export function toProjectRelative(rawPath, root, base = root) {
  const absolute = path.resolve(base, rawPath)
  const rel = path.relative(root, absolute).split(path.sep).join('/')
  const escapes = rel === '' || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)
  return { rel, escapes }
}

// Shell command helpers shared by the Bash|PowerShell hooks.

// Operators that start a new command, matched only outside quotes.
const SEGMENT_OPERATORS = ['&&', '||', '|', ';', '&', '\n', '\r', '$(', '`', '(', ')']

// Programs that run another program: the real program is what follows their flags.
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'pwsh', 'powershell', 'cmd'])
const PREFIXES = new Set([
  'sudo', 'doas', 'env', 'nohup', 'time', 'command', 'exec', 'eval', 'xargs', 'nice', 'busybox',
  'timeout', 'stdbuf', 'caffeinate', 'bunx', 'npx', 'pnpx'
])
// Package runners: `bun x pkg`, `bun run pkg`, `npm exec pkg`, … run the named program.
const RUNNERS = { bun: ['x', 'run'], npm: ['exec', 'run', 'x'], pnpm: ['dlx', 'exec', 'run'], yarn: ['dlx', 'run'] }
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
export function segmentTokens(segment) {
  let tokens = tokenize(segment)
  for (let guard = 0; guard < 8; guard += 1) {
    while (tokens.length > 0 && /^[A-Za-z_]\w*=/.test(tokens[0])) tokens = tokens.slice(1)
    if (tokens.length === 0) return tokens
    const program = programName(tokens[0])
    const runner = RUNNERS[program]
    if (runner !== undefined) {
      if (tokens.length < 2 || !runner.includes(tokens[1].toLowerCase())) return tokens
      tokens = tokens.slice(2)
    } else if (SHELLS.has(program) || PREFIXES.has(program)) {
      tokens = tokens.slice(1)
      if (program === 'timeout' && tokens.length > 0 && DURATION.test(tokens[0])) tokens = tokens.slice(1)
    } else {
      return tokens
    }
    // Drop the wrapper's own flags (`-lc`, `-NoProfile -Command`, `-u root`, `--`, cmd's `/c`).
    while (tokens.length > 0 && (tokens[0].startsWith('-') || (program === 'cmd' && /^\/[a-z]$/i.test(tokens[0])))) {
      const flag = tokens[0]
      tokens = tokens.slice(1)
      if (FLAG_WITH_VALUE.test(flag) && (program === 'sudo' || program === 'doas' || program === 'env' || program === 'nice' || program === 'xargs')) {
        tokens = tokens.slice(1)
      }
    }
    if (tokens.length > 0 && /\s/.test(tokens[0])) tokens = [...tokenize(tokens[0]), ...tokens.slice(1)]
  }
  return tokens
}

export function programName(token) {
  const base = token.replace(/^["']|["']$/g, '').split(/[\\/]/).pop() ?? ''
  return base.replace(/\.(exe|cmd|bat)$/i, '').toLowerCase()
}

export function tokenize(text) {
  const tokens = []
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g
  let match
  while ((match = re.exec(text)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3])
  }
  return tokens
}

// The command with quoted strings blanked, for scans that must not see string contents.
export function withoutQuotes(command) {
  return command.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""')
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
