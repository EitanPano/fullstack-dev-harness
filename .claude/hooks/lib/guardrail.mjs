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

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
