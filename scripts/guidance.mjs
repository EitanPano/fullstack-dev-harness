// The one way agents reach the `modern-web-guidance` guides: a pinned version, telemetry forced
// off, and only `search` and `retrieve`. `node scripts/guidance.mjs search <query…>` or
// `node scripts/guidance.mjs retrieve <id[,id…]>`; guides are cached under .orchestrate/guidance/.
import { spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isMain } from './verify/main.mjs'

export const VERSION = '1.0.1'
export const CACHE_DIR = `.orchestrate/guidance/${VERSION}`
// Under the Bash tool's default 120 s, so the one-line failure arrives before the tool gives up.
const TIMEOUT_MS = 90_000
const USAGE = 'usage: node scripts/guidance.mjs search <query…> | retrieve <id[,id…]>'
const ID = /^[a-z0-9][a-z0-9-]*$/
// Guides cite each other as an `npx … retrieve` call, which the hook refuses; point them here.
const CROSS_REF = /\b(?:npx|bunx|bun x)(?: -y)? modern-web-guidance(?:@[^\s"'`]+)? retrieve/g
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// stdoutFile hands the child a file as stdout: upstream prints a pointer to %TEMP% instead of a
// guide over 9500 bytes when stdout is a pipe.
export function spawnRunner(command, args, { env, stdoutFile, cwd }) {
  const fd = stdoutFile === undefined ? undefined : openSync(stdoutFile, 'w')
  try {
    const result = spawnSync(command, args, {
      env,
      cwd,
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      stdio: ['ignore', fd ?? 'pipe', 'pipe'],
    })
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error }
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

// bun prints install progress on stderr; the last line that is neither progress nor a stack frame
// says what went wrong.
function reasonOf(result) {
  if (result.error?.code === 'ENOENT') return 'bun is not installed or not on PATH'
  if (result.error?.code === 'ETIMEDOUT') return 'timed out waiting for the guide package'
  if (result.error) return result.error.message.split('\n')[0]
  const lines = (result.stderr ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^at /.test(line) && !/^Resolv|^Resolved|^Saved|^Installed/.test(line))
  const meaningful = lines.find((l) => /error/i.test(l)) ?? lines[0]
  return meaningful ?? `exit ${result.status}`
}

// The child runs from the repository root, so upstream's `.mwgrc` lookup and bun's registry
// settings do not depend on where the caller stands.
function child(runner, root, sub, tail, stdoutFile) {
  const env = { ...process.env, DISABLE_TELEMETRY: '1' }
  const args = ['x', `modern-web-guidance@${VERSION}`, sub, ...tail]
  const result = runner('bun', args, { env, stdoutFile, cwd: root })
  const ok = !result.error && result.status === 0
  return { ok, result }
}

export function guidance(argv, { root = REPO_ROOT, runner = spawnRunner, out, err } = {}) {
  out ??= (line) => process.stdout.write(line)
  err ??= (line) => process.stderr.write(`${line}\n`)
  const [sub, ...rest] = argv
  const fail = (result) => {
    err(`guidance: ${reasonOf(result)}`)
    return 1
  }
  if (sub === 'search' && rest.length > 0) {
    const { ok, result } = child(runner, root, 'search', [rest.join(' ')])
    if (!ok) return fail(result)
    out(result.stdout)
    return 0
  }
  if (sub === 'retrieve' && rest.length === 1) {
    const ids = rest[0].split(',')
    if (!ids.every((id) => ID.test(id))) {
      err('guidance: an id is lowercase letters, digits and hyphens, not starting with a hyphen')
      return 2
    }
    const dir = path.join(root, ...CACHE_DIR.split('/'))
    try {
      mkdirSync(dir, { recursive: true })
      for (const id of ids) {
        const file = path.join(dir, `${id}.md`)
        if (!(existsSync(file) && statSync(file).size > 0)) {
          const code = fetchGuide(runner, root, id, dir, file, fail, err)
          if (code !== 0) return code
        }
        out(`${CACHE_DIR}/${id}.md ${statSync(file).size}\n`)
      }
    } catch (error) {
      // A file system error, not the child's: `fail` would read its ENOENT as a missing bun.
      err(`guidance: ${error.message.split('\n')[0]}`)
      return 1
    }
    return 0
  }
  err(USAGE)
  return 2
}

// Writes one guide through a temp file, so a failed or interrupted fetch never leaves a cached
// guide behind.
function fetchGuide(runner, root, id, dir, file, fail, err) {
  const temp = path.join(dir, `${id}.${process.pid}.tmp`)
  try {
    const { ok, result } = child(runner, root, 'retrieve', [id], temp)
    if (!(ok && existsSync(temp) && statSync(temp).size > 0)) {
      return ok ? (err(`guidance: no guide text for ${id}`), 1) : fail(result)
    }
    const text = readFileSync(temp, 'utf8')
    const rewritten = text.replace(CROSS_REF, 'node scripts/guidance.mjs retrieve')
    if (rewritten !== text) writeFileSync(temp, rewritten)
    renameSync(temp, file)
    return 0
  } finally {
    rmSync(temp, { force: true })
  }
}

if (isMain(import.meta.url, process.argv[1])) {
  process.exitCode = guidance(process.argv.slice(2))
}
