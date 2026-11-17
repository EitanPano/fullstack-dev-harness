#!/usr/bin/env node
// PreToolUse on Edit|Write: refuses the first edit of a harness prompt in a session, with
// `.claude/instruction-files.md` as the refusal text, and lets the retry through.
// - Not a guardrail: it refuses only after it has parsed an in-scope path, read the guidance
//   and written its marker. Every other state, a crash included, allows the call.
// - One marker per session and sub-agent, in the OS temp directory: hook payloads carry no
//   scratchpad directory in `claude -p` runs or sub-agents (plan 028, S1).
// - `--reset` (SessionStart on compact and clear) drops the session's markers, so the text is
//   shown again once it may have left the context.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const TAG = '[instruction-guidance]'
const GUIDANCE = '.claude/instruction-files.md'
// The calls of one turn reach the hook one after another, about 0.7 s apart, before Claude reads
// a result; a retry needs a model round trip, 2 s or more (S1). So a call close behind the last
// refused one belongs to its batch. The cap keeps quick retries from holding the gate shut.
const BATCH_GAP_MS = 1000
const BATCH_CAP_MS = 10000
const STALE_MS = 7 * 24 * 60 * 60 * 1000
const POINTER = `The instruction-file guidance could not be shown first; read \`${GUIDANCE}\`.`

// One directory per user, since a Linux temp directory is shared.
const markerDir = () => path.join(os.tmpdir(), `instruction-guidance-${os.userInfo().uid}`)

// Creates the marker directory and throws unless it is a real directory of this user: in one
// another user made, a marker could be planted to refuse a session or to redirect a write.
function ownMarkerDir() {
  const dir = markerDir()
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const stat = fs.lstatSync(dir)
  const mine = process.getuid === undefined || stat.uid === process.getuid()
  if (!stat.isDirectory() || !mine) throw new Error('marker directory is not usable')
  return dir
}
const safe = id => String(id).replace(/[^A-Za-z0-9_-]/g, '')

function allow(output) {
  if (output) process.stdout.write(JSON.stringify(output))
  process.exit(0)
}

const withContext = text => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text }
})

function refuse(message) {
  process.stderr.write(`${TAG} ${message}\n`)
  process.exit(2)
}

const refuseBatch = () =>
  refuse(
    'This call was refused with the one before it; the guidance is in that refusal. ' +
      'Make the same call again.'
  )

async function readInput() {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  const payload = JSON.parse(input)
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('payload is not an object')
  }
  return payload
}

function reset(payload) {
  if (typeof payload.session_id !== 'string') return
  const prefix = `${safe(payload.session_id)}.`
  for (const name of fs.readdirSync(markerDir())) {
    if (name.startsWith(prefix)) fs.rmSync(path.join(markerDir(), name), { force: true })
  }
}

// Markers of sessions long gone; a failure here must not change the verdict.
function prune(dir) {
  for (const name of fs.readdirSync(dir)) {
    try {
      const file = path.join(dir, name)
      if (Date.now() - fs.statSync(file).mtimeMs > STALE_MS) fs.rmSync(file, { force: true })
    } catch {}
  }
}

async function main() {
  const payload = await readInput()
  if (process.argv.includes('--reset')) return reset(payload)

  const rawPath = payload.tool_input?.file_path
  if (!['Edit', 'Write'].includes(payload.tool_name) || typeof rawPath !== 'string') return

  // Imported here so that a missing library allows the call instead of failing the hook.
  const { projectRoot, sessionCwd, toProjectRelative } = await import('./lib/guardrail.mjs')
  const { isInstructionFile } = await import('./lib/instruction-scope.mjs')
  const root = projectRoot(payload)
  const { rel, escapes } = toProjectRelative(rawPath, root, sessionCwd(payload) ?? root)
  if (escapes || !isInstructionFile(rel)) return

  // An id with no usable character would share one marker with every such session.
  const session = typeof payload.session_id === 'string' ? safe(payload.session_id) : ''
  if (session === '') allow(withContext(POINTER))
  let marker
  try {
    marker = path.join(ownMarkerDir(), `${session}.${safe(payload.agent_id ?? 'main')}`)
  } catch {
    allow(withContext(POINTER))
  }

  // The marker holds the times of the first and the last refusal.
  let times = null
  try {
    times = fs.readFileSync(marker, 'utf8').split(' ').map(Number)
    // An empty marker is one a parallel call is still writing, or one a crash left: its
    // modification time stands in, so it cannot refuse for ever.
    if (times.length !== 2 || !times.every(time => time > 0)) {
      times = Array(2).fill(fs.statSync(marker).mtimeMs)
    }
  } catch (error) {
    // A marker that exists and cannot be read would refuse on every call.
    if (error.code !== 'ENOENT') return
  }
  if (times !== null) {
    const [first, last] = times
    const now = Date.now()
    // A time ahead of the clock is one the clock stepped back from.
    if (now < first || now < last) return
    if (now - last > BATCH_GAP_MS || now - first > BATCH_CAP_MS) return
    try {
      fs.writeFileSync(marker, `${first} ${now}`)
    } catch {}
    refuseBatch()
  }

  let text = ''
  try {
    text = fs.readFileSync(path.join(root, GUIDANCE), 'utf8').trim()
  } catch {}
  if (text === '') {
    const note = `${GUIDANCE} is missing or empty, so the instruction-file guidance was not shown.`
    allow({ systemMessage: note, ...withContext(note) })
  }

  try {
    const now = Date.now()
    fs.writeFileSync(marker, `${now} ${now}`, { flag: 'wx' })
  } catch (error) {
    if (error.code === 'EEXIST') refuseBatch()
    allow(withContext(POINTER))
  }
  try {
    prune(path.dirname(marker))
  } catch {}

  refuse(
    `${rel} is a harness prompt. This is its editing guidance, shown once per session. ` +
      'It is not a guardrail refusal and needs no report: read it, then make the same call ' +
      `again.\n\n${text}\n\nNow make the same call again.`
  )
}

try {
  await main()
} catch {}
process.exit(0)
