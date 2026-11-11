// Applies the change from BASE to NEXT onto a project, path by path, as a three-way merge.
// `decide` is the pure table; `applyTrees` reads the three trees and performs it.
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { assertConfined } from './confine.mjs'
import { ScaffoldError } from './request.mjs'

const LOCKFILES = new Set([
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'uv.lock',
  'poetry.lock',
])
const SECTION = /^# --- fullstack-templates: .+ ---\s*$/
const CASES = {
  'add-conflict': 'added by the part, different here',
  'removed-conflict': 'removed by the part, changed here',
  'deleted-conflict': 'deleted here, changed by the part',
}

const isText = (buf) => !buf.subarray(0, 8000).includes(0)
const latin1 = (buf, from, to) => Buffer.from(buf.toString('latin1').replace(from, to), 'latin1')
const toLf = (buf) => (isText(buf) ? latin1(buf, /\r\n/g, '\n') : buf)
const hasCrlf = (buf) => isText(buf) && buf.includes('\r\n')
const toCrlf = (buf) => latin1(buf, /\r?\n/g, '\r\n')

// Text compares as git would, with CRLF and LF equal; a binary file compares byte for byte.
export function sameContent(a, b) {
  if (a === undefined || b === undefined) return a === b
  return toLf(a).equals(toLf(b))
}

export function decide(base, next, project) {
  if (sameContent(base, next)) return { action: 'nothing' }
  if (base === undefined) {
    if (project === undefined) return { action: 'write' }
    return sameContent(project, next) ? { action: 'nothing' } : { action: 'add-conflict' }
  }
  if (next === undefined) {
    if (project === undefined) return { action: 'nothing' }
    return sameContent(project, base) ? { action: 'delete' } : { action: 'removed-conflict' }
  }
  if (sameContent(project, next)) return { action: 'nothing' }
  if (project === undefined) return { action: 'deleted-conflict' }
  return sameContent(project, base) ? { action: 'write' } : { action: 'merge' }
}

// Returns the merged text and its conflict count, or `error` when git cannot merge (binary).
function mergeFiles(tmp, project, base, next) {
  const names = { project, base, next }
  const files = Object.entries(names).map(([label, buf]) => {
    const file = path.join(tmp, `merge-${label}`)
    writeFileSync(file, toLf(buf))
    return file
  })
  const run = spawnSync(
    'git',
    [
      '-c',
      'core.fsmonitor=false',
      '-c',
      'merge.conflictStyle=merge',
      'merge-file',
      '-p',
      '-L',
      'project',
      '-L',
      'base',
      '-L',
      'next',
      ...files,
    ],
    { maxBuffer: 256 * 1024 * 1024 },
  )
  if (run.status === null || run.status > 127) return { error: true }
  const text = hasCrlf(project) ? toCrlf(run.stdout) : run.stdout
  return { text, conflicts: run.status }
}

function sections(text) {
  const found = []
  for (const line of text.split(/\r?\n/)) {
    if (SECTION.test(line)) found.push({ header: line.trim(), lines: [line.trim()] })
    else found.at(-1)?.lines.push(line)
  }
  for (const s of found) while (s.lines.at(-1)?.trim() === '') s.lines.pop()
  return found
}

function gitignoreEntry(next, project) {
  if (next === undefined) return { action: 'nothing' }
  if (project === undefined) return { action: 'write' }
  const have = new Set(project.toString().split(/\r?\n/).map((l) => l.trim()))
  const missing = sections(next.toString()).filter((s) => !have.has(s.header))
  if (missing.length === 0) return { action: 'nothing' }
  const eol = project.includes('\r\n') ? '\r\n' : '\n'
  let text = project.toString()
  if (!text.endsWith('\n')) text += eol
  for (const s of missing) text += eol + s.lines.join(eol) + eol
  return { action: 'append', content: Buffer.from(text) }
}

// A hand edit of the provenance survives: both generations carry the project's own stamp.
function withStamp(buf, project) {
  const stamp = /^generatedAt:[^\r\n]*/m.exec(project?.toString() ?? '')
  if (buf === undefined || stamp === null) return buf
  return Buffer.from(buf.toString().replace(/^generatedAt:[^\r\n]*/m, stamp[0]))
}

const readIf = (dir, rel) => {
  const file = path.join(dir, rel)
  return existsSync(file) ? readFileSync(file) : undefined
}

function writeTo(root, rel, content) {
  const file = path.join(root, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

function removeFrom(root, rel) {
  rmSync(path.join(root, rel), { force: true })
  for (let dir = path.dirname(path.join(root, rel)); dir !== path.resolve(root); ) {
    if (readdirSync(dir).length > 0) break
    rmdirSync(dir)
    dir = path.dirname(dir)
  }
}

// Compute every action first, then write, so a refusal or a merge error leaves the tree as it
// was. A failure while writing names the paths already written and how to get back.
function performAll(root, ops) {
  const done = []
  try {
    for (const [kind, rel, content] of ops) {
      if (kind === 'write') writeTo(root, rel, content)
      else removeFrom(root, rel)
      done.push(rel)
    }
  } catch (error) {
    const written = done.length === 0 ? 'none' : done.join(', ')
    throw new ScaffoldError(
      `applying the scaffold failed (${error.message}); already written: ${written}. ` +
        'The tree was clean before: run `git checkout -- .` and remove the untracked files ' +
        '(`git clean -fd`, mind your own untracked files) to restore it, then run again',
      3,
    )
  }
}

function refuseUnsafeFiles(root, dirs, rels) {
  assertConfined(root, rels, 'generated path')
  for (const dir of dirs) {
    for (const rel of rels) {
      const file = path.join(dir, rel)
      if (existsSync(file) && lstatSync(file).isSymbolicLink()) {
        throw new ScaffoldError(`unsafe generated path ${JSON.stringify(rel)}: a symbolic link`)
      }
    }
  }
}

// Returns one entry per path: { path, action, conflict?, markers? }. `baseFiles` and
// `nextFiles` are the relative paths each generation tracks (POSIX separators).
export function applyTrees({ root, baseDir, nextDir, baseFiles, nextFiles, tmp, dryRun }) {
  const paths = [...new Set([...baseFiles, ...nextFiles])].sort()
  refuseUnsafeFiles(root, [baseDir, nextDir], paths)
  const entries = []
  const ops = []
  const write = (rel, content) => ops.push(['write', rel, content])
  for (const rel of paths) {
    const project = readIf(root, rel)
    let base = readIf(baseDir, rel)
    let next = readIf(nextDir, rel)
    const name = path.posix.basename(rel)
    const entry = { path: rel }
    entries.push(entry)

    if (LOCKFILES.has(name)) {
      if (base === undefined && next !== undefined && project === undefined) {
        entry.action = 'write'
        write(rel, next)
      } else entry.action = sameContent(base, next) ? 'nothing' : 'lockfile-left'
      continue
    }
    if (rel === '.gitignore') {
      const g = gitignoreEntry(next, project)
      entry.action = g.action
      if (g.action === 'write') write(rel, next)
      if (g.action === 'append') write(rel, g.content)
      continue
    }
    if (rel === '.fullstack/catalog.yaml') {
      base = withStamp(base, project)
      next = withStamp(next, project)
    }

    const { action } = decide(base, next, project)
    entry.action = action
    const keepEol = (buf) => (hasCrlf(project ?? Buffer.alloc(0)) ? toCrlf(toLf(buf)) : buf)
    if (action === 'write') write(rel, project === undefined ? next : keepEol(next))
    else if (action === 'delete') ops.push(['delete', rel])
    else if (action === 'merge' || action === 'add-conflict') {
      const merged = mergeFiles(tmp, project, base ?? Buffer.alloc(0), next)
      if (merged.error) {
        // git cannot merge a binary file: the project's copy stays, with no markers.
        entry.conflict = action === 'merge' ? 'binary file differs, cannot merge' : CASES[action]
        entry.markers = false
      } else {
        if (merged.conflicts > 0) {
          entry.conflict = action === 'merge' ? 'merge conflict' : CASES[action]
          entry.markers = true
        }
        write(rel, merged.text)
      }
    } else if (CASES[action] !== undefined) {
      entry.conflict = CASES[action]
      entry.markers = false
    }
  }
  if (!dryRun) performAll(root, ops)
  return entries
}
