#!/usr/bin/env node
// PreToolUse guardrail on every tool (the `*` matcher is deliberate): hard-blocks access to
// secret files whichever tool names them in a path field or a shell command — Read, Edit,
// Write, NotebookEdit, Bash, PowerShell, and any MCP tool with a path field — and blocks
// commands that dump the environment. `permissions.deny` covers only the tool+pattern
// pairs listed there and cannot look inside a command string; this hook inspects the
// target of every call.
//
// What is inspected, and what is not on purpose:
// - Fields that NAME a target (file_path, path, notebook_path, paths[], file_paths[]),
//   trimmed the way the file tools trim them, and every token of a shell `command`.
// - Raw tokens as well as wrapper-stripped ones (`uv run --env-file .env x`), and the quoted
//   strings of inline code (`python -c "open('.env')"`, `node -e`).
// - Not a Write's `content` and not a Grep `pattern`: docs, templates and searches
//   legitimately mention env files. Scanning content made the hook unable to edit itself.
// - Secret names are matched as file names (an extension or a dot-file), so a directory or
//   word called `secret` is not one. `.env.example`, `.env.sample` and `.env.template` are
//   committed template content and are allowed.
import {
  allow,
  block,
  isPythonProgram,
  programName,
  pythonInlineCode,
  pythonReadsStdin,
  readPayload,
  scriptInlineCode,
  segmentTokens,
  shellSegments,
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
const INLINE_RUNTIMES = new Set(['node', 'bun', 'deno', 'tsx', 'ts-node'])
const PYTHON_ENV_DUMP = /(?<!\w)environb?\b(?!\s*\[|\s*\.get\b)/

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

const command = typeof toolInput.command === 'string' ? toolInput.command : ''
if (/\[(System\.)?Environment\]::GetEnvironmentVariables?\b/i.test(command)) {
  block(`blocked ${tool} call that dumps the environment (GetEnvironmentVariables). Read one variable by name instead.`)
}
for (const segment of shellSegments(command)) {
  // `env` and `printenv` alone dump everything; checked before wrapper stripping, which
  // would otherwise remove a bare `env` as the wrapper form `env NAME=value cmd`.
  if (/^(printenv|env)(\s+-\w+)*$/i.test(segment)) {
    block(`blocked ${tool} call that dumps the environment (${segment.split(/\s/)[0]}). Read one variable by name instead.`)
  }
  const tokens = segmentTokens(segment)
  if (tokens.length === 0) continue
  // The wrapper-stripped tokens drop runner flags such as `--env-file`, so the raw tokens
  // are scanned too, however the command is wrapped.
  const candidates = [...tokens, ...rawTokens(segment)]
  if (candidates.some(token => isSecretPath(stripRedirect(token)))) {
    block(`blocked ${tool} call naming a secret file in the command. Use .env.example instead.`)
  }
  const program = programName(tokens[0])
  const args = tokens.slice(1)
  const code = inlineCode(program, args)
  if (code !== null && inlineNamesSecret(code)) {
    block(`blocked ${tool} call whose inline code names a secret file. Use .env.example instead.`)
  }
  // Python that reads its program from stdin (`python - <<EOF`, `echo "…" | python`) has the
  // code in a heredoc or a pipe, which the segment split has already torn apart: judge the
  // whole command text, which fails closed.
  if (isPythonProgram(program) && pythonReadsStdin(args)) {
    if (PYTHON_ENV_DUMP.test(command)) {
      block(
        `blocked ${tool} call that dumps the environment (os.environ via stdin). ` +
          'Read one variable by name instead.'
      )
    }
    if (inlineNamesSecret(command)) {
      block(`blocked ${tool} call whose stdin code names a secret file. Use .env.example instead.`)
    }
  }
  const dump = envDump(program, args, segment)
  if (dump !== null) {
    block(
      `blocked ${tool} call that dumps the environment (${dump}). ` +
        'Read one variable by name instead.'
    )
  }
}

allow()

function isSecretPath(value) {
  if (value === '' || value === '-') return false
  if (SECRET_DIR.test(value)) return true
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
function rawTokens(segment) {
  const out = []
  for (const token of tokenize(segment)) {
    if (/\s/.test(token)) continue
    out.push(token)
    const eq = token.indexOf('=')
    if (eq > 0) out.push(token.slice(eq + 1))
  }
  return out
}

// The inline code of `node -e …` / `python -c …`, or null when the call is not inline.
function inlineCode(program, args) {
  if (isPythonProgram(program)) return pythonInlineCode(args)
  return INLINE_RUNTIMES.has(program) ? scriptInlineCode(args) : null
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

function envDump(program, args, segment) {
  if (program === 'printenv' && args.length === 0) return 'printenv'
  if (program === 'env' && args.length === 0) return 'env'
  if (program === 'set' && args.length === 0) return 'set'
  if (program === 'export' && (args.length === 0 || args.every(arg => arg === '-p'))) return 'export -p'
  if (program === 'declare' && args.length > 0 && args.every(arg => /^-[px]+$/.test(arg))) return 'declare -x'
  if (['get-childitem', 'gci', 'ls', 'dir', 'get-item', 'gi'].includes(program) && args.some(arg => /^env:\\?\*?$/i.test(arg))) return 'Get-ChildItem Env:'
  // A whole-object dump of process.env / Bun.env in inline code (reading one key is fine).
  const dumpsProcessEnv = /\b(process|Bun|Deno)\.env\b(?!\s*[.[])/.test(segment)
  if (INLINE_RUNTIMES.has(program) && scriptInlineCode(args) !== null && dumpsProcessEnv) {
    return 'process.env dump'
  }
  // Python: any use of environ / environb as a whole object (`print(os.environ)`,
  // `dict(os.environ)`, `.items()`, `{**os.environ}`, a bare `environ` after `from os import`).
  // Reading one key (`os.environ['X']`, `os.environ.get('X')`, `os.getenv('X')`) is fine.
  if (isPythonProgram(program)) {
    const code = pythonInlineCode(args)
    if (code !== null && PYTHON_ENV_DUMP.test(code)) return 'os.environ dump'
    // Any other argument too: a script or module that receives code as a string.
    if (args.some(arg => !arg.startsWith('-') && PYTHON_ENV_DUMP.test(arg))) {
      return 'os.environ dump'
    }
  }
  return null
}
