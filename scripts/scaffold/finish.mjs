// What happens after the merge: the conflict list and state for the driver, the marker check
// of `--complete`, and the package commands and README blocks of a finished scaffold.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  cloneLinesFrom,
  renderConfiguration,
  renderPackageBlocks,
  replaceConfiguration,
  replacePackageBlocks,
} from '../readme.mjs'
import { assertConfined } from './confine.mjs'
import { ScaffoldError, ownerOf } from './request.mjs'

// The labelled lines our merge writes; a bare `=======` is legitimate in Markdown and more.
const MARKER = /^(<<<<<<< project|>>>>>>> next)/m
const DASH = '—'

export const scaffoldDir = (root, slug) => path.join(root, '.orchestrate', slug, 'scaffold')

// The package whose directory holds the path; root files belong to no package.
function packageOf(provenance, rel) {
  const dirs = Object.keys(provenance.packages ?? {})
  return dirs.find((dir) => rel === dir || rel.startsWith(`${dir}/`))
}

// The command that finishes a scaffold, with the run's slug and templates override.
export function completeCommand({ slug, templates }) {
  const override = templates === undefined ? '' : ` --templates ${templates}`
  return `node scripts/scaffold.mjs --complete --slug ${slug}${override}`
}

// conflicts.md is a checklist: the driver writes `- [x]` after deciding. A conflict without
// markers (a file kept, a file deleted) is otherwise invisible to `--complete`; where the part
// has a copy the resolver cannot see in the tree, it is saved under `next/` and named on the line.
export function writeConflicts(root, options, conflicts, next, parts) {
  const slug = options.slug
  const dir = scaffoldDir(root, slug)
  mkdirSync(dir, { recursive: true })
  const rows = conflicts.map(({ path: rel, conflict, markers, nextCopy }) => {
    const pkg = packageOf(next, rel)
    const owner = pkg === undefined ? 'driver' : ownerOf(next, pkg)
    let row = `- [ ] ${rel} ${DASH} ${pkg ?? '.'} ${DASH} ${owner} ${DASH} ${conflict}`
    if (!markers && nextCopy !== undefined) {
      const copy = path.join(dir, 'next', rel)
      mkdirSync(path.dirname(copy), { recursive: true })
      writeFileSync(copy, nextCopy)
      row += ` ${DASH} next: .orchestrate/${slug}/scaffold/next/${rel}`
    }
    return row
  })
  const list = [
    '# Scaffold conflicts',
    '',
    `Resolve each file, check it off (\`- [x]\`), then run \`${completeCommand(options)}\`.`,
    'A file with merge markers must lose them; one without markers must be checked off.',
    '',
    ...rows,
    '',
  ].join('\n')
  const file = path.join(dir, 'conflicts.md')
  writeFileSync(file, list)
  const kept = conflicts.map((c) => ({ path: c.path, markers: c.markers === true }))
  writeState(root, slug, { parts, conflicts: kept })
  return file
}

export function writeState(root, slug, state) {
  const dir = scaffoldDir(root, slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2))
}

// state.json is only a note of what to finish: its paths are checked, its commands never run.
export function readState(root, slug) {
  let state
  try {
    state = JSON.parse(readFileSync(path.join(scaffoldDir(root, slug), 'state.json'), 'utf8'))
  } catch {
    throw new ScaffoldError(`no scaffold to complete: ${slug}/scaffold/state.json is missing`)
  }
  const ok =
    Array.isArray(state?.parts) &&
    state.parts.every((p) => typeof p === 'string') &&
    Array.isArray(state?.conflicts)
  if (!ok) throw new ScaffoldError(`${slug}/scaffold/state.json is malformed`)
  assertConfined(root, state.conflicts.map((c) => c?.path), 'conflict path')
  return state
}

export function removeState(root, slug) {
  rmSync(path.join(scaffoldDir(root, slug), 'state.json'), { force: true })
}

// Paths still to resolve: a merge-conflict file that still holds a labelled marker line, or a
// marker-less conflict whose checklist line is not checked.
export function openConflicts(root, slug, conflicts) {
  const file = path.join(scaffoldDir(root, slug), 'conflicts.md')
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : []
  const checked = (rel) =>
    ['x', 'X'].some((mark) => lines.some((l) => l.startsWith(`- [${mark}] ${rel} ${DASH} `)))
  return conflicts
    .filter(({ path: rel, markers }) => {
      if (!markers) return !checked(rel)
      const target = path.join(root, rel)
      return existsSync(target) && MARKER.test(readFileSync(target, 'utf8'))
    })
    .map((c) => c.path)
}

// Same shell form as `verify`; a multi-line command runs line by line.
function run(root, dir, name, command, again) {
  for (const line of command.split('\n').filter((l) => l.trim() !== '')) {
    console.log(`  ${dir}: ${line}`)
    const result = spawnSync(line, { cwd: path.join(root, dir), shell: true, stdio: 'inherit' })
    if (result.status !== 0) {
      throw new ScaffoldError(
        `${dir} ${name} failed (${result.error?.message ?? `exit ${result.status}`}); fix it, ` +
          `then run \`${again}\` again`,
        3,
      )
    }
  }
}

// install for every package, then contract, then format; NEXT's order puts producers first.
export function finish(root, next, catalog, again) {
  assertConfined(root, Object.keys(next.packages), 'package directory')
  for (const name of ['install', 'contract', 'format']) {
    for (const [dir, pkg] of Object.entries(next.packages)) {
      if (pkg.commands?.[name] !== undefined) run(root, dir, name, pkg.commands[name], again)
    }
  }
  const file = path.join(root, 'README.md')
  if (!existsSync(file)) return console.warn('  warning: no README.md to update')
  try {
    let text = readFileSync(file, 'utf8')
    const clone = cloneLinesFrom(text)
    text = replacePackageBlocks(text, renderPackageBlocks(root, catalog, { clone }))
    writeFileSync(file, replaceConfiguration(text, renderConfiguration(root)))
  } catch (error) {
    console.warn(`  warning: README.md not updated: ${error.message.split('\n')[0]}`)
  }
}
