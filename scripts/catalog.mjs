// Finds the template catalog a project is pinned to. Shared by the bootstrap and by the scripts
// that add a part to an existing project; every function takes its inputs as parameters and
// throws a CatalogError, so each caller decides how to fail.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

export const SUPPORTED_SCHEMA_VERSION = 1

export class CatalogError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CatalogError'
  }
}

export function defaultCacheRoot(env = process.env) {
  return env.FULLSTACK_TEMPLATES_CACHE ?? path.join(os.homedir(), '.cache', 'fullstack-templates')
}

// A cwd spelled `C:\dev` when the disk says `C:\Dev` makes Bun's `import.meta.main` false, so
// its scripts exit 0 and do nothing. An unresolvable path is returned as given.
export function onDiskPath(p) {
  try {
    return realpathSync.native(p)
  } catch {
    return p
  }
}

export function isDirectory(dir) {
  return existsSync(dir) && statSync(dir).isDirectory()
}

export function readLock(harnessRoot) {
  const file = path.join(harnessRoot, 'catalog.lock')
  let lock
  try {
    // A BOM (Windows editors add one) makes JSON.parse throw on an otherwise valid file.
    lock = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch (error) {
    throw new CatalogError(`cannot read ${file}: ${error.message}`)
  }
  for (const field of ['repository', 'version', 'commit']) {
    if (typeof lock?.[field] !== 'string' || lock[field] === '') {
      throw new CatalogError(`catalog.lock: "${field}" must be a non-empty string`)
    }
  }
  if (!/^[0-9a-f]{40}$/.test(lock.commit)) {
    throw new CatalogError('catalog.lock: "commit" must be 40 lowercase hex characters')
  }
  // The version becomes a path segment and a git ref, so it must be a plain tag.
  if (!/^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(lock.version)) {
    throw new CatalogError('catalog.lock: "version" must be a tag such as v0.1.0')
  }
  return lock
}

// The lock pins a tag, but a tag can move; the commit check is what makes the pin real.
export function locateCachedCatalog(lock, cacheRoot) {
  const dir = path.join(cacheRoot, lock.version)
  if (!existsSync(dir)) {
    console.log(`  cloning ${lock.repository} at ${lock.version} into ${dir}`)
    const cloned = runSpawn(
      'git',
      [
        'clone',
        '--depth',
        '1',
        '--branch',
        lock.version,
        '--quiet',
        '-c',
        'advice.detachedHead=false',
        '--',
        lock.repository,
        dir,
      ],
      process.cwd(),
    )
    if (cloned.status !== 0) {
      const what = `git clone of ${lock.repository} into ${dir} failed${cloned.reason}`
      throw new CatalogError(`${what}; it needs the network`)
    }
  }
  const head = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  const actual = head.status === 0 ? head.stdout.trim() : ''
  if (actual !== lock.commit) {
    const found = actual === '' ? 'an unknown commit' : actual
    throw new CatalogError(
      `catalog.lock expects commit ${lock.commit} but ${dir} is at ${found}; ` +
        'the tag moved or the cache is stale: delete that directory by hand and run again',
    )
  }
  return dir
}

export function locateLocalCatalog(override) {
  const dir = path.resolve(override)
  if (!isDirectory(dir)) throw new CatalogError(`template catalog ${dir} does not exist`)
  console.warn(`  warning: using the local catalog ${dir}; catalog.lock is bypassed`)
  return dir
}

// One regex on one line instead of a YAML parser: the harness stays dependency-free.
export function checkSchemaVersion(catalog) {
  const file = path.join(catalog, 'index.yaml')
  if (!existsSync(file)) {
    throw new CatalogError(`${file} is missing; ${catalog} is not a template catalog`)
  }
  let version
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^schemaVersion:\s*(\d+)\s*$/.exec(line)
    if (match !== null) {
      version = Number(match[1])
      break
    }
  }
  if (version === undefined) throw new CatalogError(`${file} has no schemaVersion`)
  if (version > SUPPORTED_SCHEMA_VERSION) {
    throw new CatalogError(
      `catalog schemaVersion ${version} is newer than this harness supports ` +
        `(${SUPPORTED_SCHEMA_VERSION}); update the harness`,
    )
  }
}

// Lock, then the cached clone or the override, then the schema check: the bootstrap's steps in
// one call. The lock is read (and must be valid) even when an override bypasses it.
export function locateCatalog({ harnessRoot, override, cacheRoot = defaultCacheRoot() }) {
  const lock = readLock(harnessRoot)
  const fromCache = override === undefined || override === ''
  const catalog = fromCache ? locateCachedCatalog(lock, cacheRoot) : locateLocalCatalog(override)
  checkSchemaVersion(catalog)
  return { lock, catalog, fromCache }
}

// `reason` carries the spawn error (a missing executable, say) so the failure names its cause.
export function runSpawn(command, commandArgs, cwd) {
  const resolved = resolveCommand(command)
  const result = spawnSync(resolved.file, [...resolved.prefix, ...commandArgs], {
    cwd,
    stdio: 'inherit',
  })
  const reason = result.error === undefined ? '' : ` (${result.error.message})`
  return { status: result.status ?? 1, reason }
}

// Windows: an npm-installed `bun` is a .cmd shim that spawn cannot execute directly. When
// where.exe lists several hits, a real .exe wins: the official Bun installer ships bun.exe, and
// the shim goes through cmd.exe, which mishandles quoted paths with spaces.
export function resolveCommand(command) {
  if (process.platform !== 'win32') return { file: command, prefix: [] }
  const where = spawnSync('where.exe', [command], { encoding: 'utf8' })
  const hits = (where.stdout ?? '').split(/\r?\n/).filter((line) => line.trim() !== '')
  const first = hits.find((line) => /\.exe$/i.test(line.trim())) ?? hits[0]
  if (first === undefined) return { file: command, prefix: [] }
  return /\.(cmd|bat)$/i.test(first)
    ? { file: 'cmd.exe', prefix: ['/c', first] }
    : { file: first, prefix: [] }
}
