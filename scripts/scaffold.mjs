#!/usr/bin/env node
// Adds a part (a server, a flag, a capability) to a generated project. The project's recorded
// selection (.fullstack/catalog.yaml) is generated again at the pinned catalog as BASE, the same
// selection plus the part as NEXT, and the change from BASE to NEXT is merged into the project
// three ways. A conflict leaves markers and a list for the driver (exit 1); `--complete` finishes
// once they are resolved.
//
//   node scripts/scaffold.mjs [--stack <id>] [--flag <name>=<bool>]…
//     [--capability <kind>=<id>]… [--deploy single|split] [--slug <slug>] [--templates <path>]
//     [--root <dir>] [--dry-run]
//   node scripts/scaffold.mjs --complete [--slug <slug>] [--templates <path>] [--root <dir>]
//
// Exit: 0 done · 1 conflicts to resolve · 2 refused, nothing written · 3 a command or an
// unexpected failure.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  CatalogError,
  defaultCacheRoot,
  isDirectory,
  locateCatalog,
  onDiskPath,
  readLock,
  runSpawn,
} from './catalog.mjs'
import { applyTrees } from './scaffold/apply.mjs'
import {
  completeCommand,
  finish,
  openConflicts,
  readState,
  removeState,
  writeConflicts,
  writeState,
} from './scaffold/finish.mjs'
import { listFiles } from './scaffold/listing.mjs'
import {
  ScaffoldError,
  USAGE,
  answersFor,
  baseArguments,
  checkRequest,
  compareProvenance,
  nextArguments,
  parseArgs,
  partsOf,
  readYaml,
} from './scaffold/request.mjs'

const harnessRoot = fileURLToPath(new URL('..', import.meta.url))
const git = (cwd, args) =>
  spawnSync('git', ['-c', 'core.fsmonitor=false', ...args], { cwd, encoding: 'utf8' })

function main(argv) {
  const options = parseArgs(argv)
  if (options.help) return console.log(USAGE)
  const root = onDiskPath(path.resolve(options.root ?? harnessRoot))
  const override = options.templates ?? process.env.FULLSTACK_TEMPLATES_DIR
  return options.complete ? complete(root, options, override) : add(root, options, override)
}

// The catalog the project was generated at: the lock's cached clone, or a local checkout whose
// HEAD is the recorded commit.
function locate(root, recorded, override) {
  let located
  try {
    const lock = readLock(root)
    const bypass = override !== undefined && override !== ''
    if (!bypass && (lock.version !== recorded?.version || lock.commit !== recorded?.commit)) {
      throw new ScaffoldError(
        `catalog.lock pins ${lock.version} (${lock.commit}) but .fullstack/catalog.yaml ` +
          `records ${recorded?.version} (${recorded?.commit}); bring them in step first`,
      )
    }
    located = locateCatalog({ harnessRoot: root, override, cacheRoot: defaultCacheRoot() })
  } catch (error) {
    if (error instanceof CatalogError) throw new ScaffoldError(error.message)
    throw error
  }
  const catalog = onDiskPath(located.catalog)
  if (!located.fromCache) {
    if (!recorded?.commit) {
      throw new ScaffoldError('.fullstack/catalog.yaml records no catalog commit (null)')
    }
    const head = git(catalog, ['rev-parse', 'HEAD']).stdout.trim()
    const dirty = git(catalog, ['status', '--porcelain'])
    if (dirty.status === 0 && dirty.stdout.trim() !== '') {
      throw new ScaffoldError(
        `the catalog checkout ${catalog} has uncommitted changes; BASE would not match the ` +
          'project generation',
      )
    }
    if (head !== recorded.commit) {
      throw new ScaffoldError(
        `the catalog checkout ${catalog} is at HEAD ${head || 'unknown'}, not the recorded ` +
          `commit ${recorded.commit}`,
      )
    }
  }
  const tools = path.join(catalog, 'tools')
  if (located.fromCache && existsSync(path.join(tools, 'package.json'))) {
    if (!isDirectory(path.join(tools, 'node_modules'))) {
      const install = runSpawn('bun', ['install', '--frozen-lockfile'], tools)
      if (install.status !== 0) {
        throw new ScaffoldError('bun install failed in the catalog tools', 3)
      }
    }
  }
  return { catalog, lock: located.lock, fromCache: located.fromCache }
}

function generate(catalog, args, label) {
  const result = runSpawn('bun', args, catalog)
  if (result.status !== 0) {
    throw new ScaffoldError(`the generator failed for ${label}${result.reason}`, 3)
  }
}

function add(root, options, override) {
  const provenanceFile = path.join(root, '.fullstack', 'catalog.yaml')
  if (!existsSync(provenanceFile)) {
    throw new ScaffoldError(
      `.fullstack/catalog.yaml is missing in ${root}: not a generated project`,
    )
  }
  const status = git(root, ['status', '--porcelain'])
  if (status.status !== 0) throw new ScaffoldError(`${root} is not a git work tree`)
  if (status.stdout.trim() !== '') {
    throw new ScaffoldError('the working tree has uncommitted changes; commit or stash them first')
  }
  const base = readYaml(provenanceFile)
  const { catalog, lock, fromCache } = locate(root, base.catalog, override)

  let stackPackages
  if (options.stack !== undefined) {
    const file = path.join(catalog, 'stacks', options.stack, 'stack.yaml')
    if (!existsSync(file)) throw new ScaffoldError(`the catalog has no stack ${options.stack}`)
    stackPackages = readYaml(file).packages
  }
  checkRequest(base, options, stackPackages)

  const tmp = onDiskPath(mkdtempSync(path.join(os.tmpdir(), 'scaffold-')))
  let keep = false
  try {
    const dirs = { base: path.join(tmp, 'base'), next: path.join(tmp, 'next') }
    for (const dir of Object.values(dirs)) mkdirSync(dir)
    const answers = path.join(tmp, 'answers.json')
    writeFileSync(answers, JSON.stringify(answersFor(base), null, 2))
    const catalogVersion = fromCache ? lock.version : undefined
    generate(catalog, baseArguments(base, { out: dirs.base, answers, catalogVersion }), 'BASE')
    const nextIo = { out: dirs.next, answers, catalogVersion }
    generate(catalog, nextArguments(base, options, nextIo), 'NEXT')

    const next = readYaml(path.join(dirs.next, '.fullstack', 'catalog.yaml'))
    compareProvenance(base, next)
    const parts = partsOf(base, next, options)

    const entries = applyTrees({
      root,
      baseDir: dirs.base,
      nextDir: dirs.next,
      baseFiles: listFiles(dirs.base),
      nextFiles: listFiles(dirs.next),
      tmp,
      dryRun: options.dryRun,
    })
    const conflicts = entries.filter((e) => e.conflict !== undefined)
    for (const { path: rel, action, conflict } of entries) {
      if (action === 'nothing') continue
      console.log(`  ${action.padEnd(14)} ${rel}${conflict ? `  (${conflict})` : ''}`)
    }
    if (options.dryRun) return conflicts.length > 0 ? 1 : 0
    if (conflicts.length > 0) {
      const list = writeConflicts(root, options, conflicts, next, parts)
      console.log(`\n${conflicts.length} conflict(s): ${list}`)
      console.log(`Resolve them, then run: ${completeCommand(options)}`)
      return 1
    }
    writeState(root, options.slug, { parts, conflicts: [] })
    return conclude(root, options, catalog, parts)
  } catch (error) {
    keep = !(error instanceof ScaffoldError)
    if (keep) console.error(`scaffold: temp folders kept at ${tmp}`)
    throw error
  } finally {
    if (!keep) removeTemp(tmp)
  }
}

// The project is already written by now: a stuck temp folder (antivirus, a lingering bun) warns.
function removeTemp(tmp) {
  try {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 5 })
  } catch (error) {
    console.warn(`scaffold: could not remove ${tmp} (${error.message}); remove it by hand`)
  }
}

// The commands come from the project's own merged provenance, never from state.json.
function conclude(root, options, catalog, parts) {
  const provenance = readYaml(path.join(root, '.fullstack', 'catalog.yaml'))
  finish(root, provenance, catalog, completeCommand(options))
  removeState(root, options.slug)
  console.log(`\nchore(scaffold): add ${parts.join(', ')}`)
  return 0
}

function complete(root, options, override) {
  const state = readState(root, options.slug)
  const open = openConflicts(root, options.slug, state.conflicts)
  if (open.length > 0) {
    throw new ScaffoldError(`unresolved conflicts (markers or unchecked): ${open.join(', ')}`)
  }
  const provenance = readYaml(path.join(root, '.fullstack', 'catalog.yaml'))
  const { catalog } = locate(root, provenance.catalog, override)
  return conclude(root, options, catalog, state.parts)
}

// exitCode, not exit(): a piped stdout may still hold unwritten output.
try {
  process.exitCode = main(process.argv.slice(2)) ?? 0
} catch (error) {
  if (error instanceof ScaffoldError) {
    console.error(`scaffold: ${error.message}`)
    process.exitCode = error.exit
  } else {
    console.error(`scaffold: ${error.stack ?? error}`)
    process.exitCode = 3
  }
}
