import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import {
  CatalogError,
  checkSchemaVersion,
  defaultCacheRoot,
  locateCachedCatalog,
  locateCatalog,
  locateLocalCatalog,
  onDiskPath,
  readLock,
} from './catalog.mjs'

const made = []
after(() => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

function temp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'catalog-'))
  made.push(dir)
  return dir
}

const COMMIT = 'a'.repeat(40)
const lockText = (over = {}) =>
  JSON.stringify({ repository: 'https://example.test/c', version: 'v1.2.3', commit: COMMIT, ...over })

function withLock(text) {
  const root = temp()
  writeFileSync(path.join(root, 'catalog.lock'), text)
  return root
}

function git(cwd, ...args) {
  const config = ['-c', 'commit.gpgsign=false', '-c', 'core.fsmonitor=false']
  const run = spawnSync('git', [...config, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf8',
  })
  assert.equal(run.status, 0, run.stderr)
  return run.stdout.trim()
}

describe('readLock', () => {
  it('reads a valid lock, with or without a BOM', () => {
    assert.equal(readLock(withLock(lockText())).version, 'v1.2.3')
    assert.equal(readLock(withLock('﻿' + lockText())).commit, COMMIT)
  })
  it('rejects a missing file, a bad commit, a bad tag and an empty field', () => {
    assert.throws(() => readLock(temp()), CatalogError)
    assert.throws(() => readLock(withLock(lockText({ commit: 'abc' }))), /40 lowercase hex/)
    assert.throws(() => readLock(withLock(lockText({ version: '../x' }))), /such as v0\.1\.0/)
    assert.throws(() => readLock(withLock(lockText({ repository: '' }))), /"repository"/)
    assert.throws(() => readLock(withLock('{')), /cannot read/)
  })
})

describe('checkSchemaVersion', () => {
  const catalogWith = (text) => {
    const dir = temp()
    if (text !== undefined) writeFileSync(path.join(dir, 'index.yaml'), text)
    return dir
  }
  it('accepts the supported version and an older one', () => {
    checkSchemaVersion(catalogWith('schemaVersion: 1\nstacks: []\n'))
    checkSchemaVersion(catalogWith('schemaVersion: 0\r\n'))
  })
  it('rejects a newer version, a missing line and a missing file', () => {
    assert.throws(() => checkSchemaVersion(catalogWith('schemaVersion: 2\n')), /newer/)
    assert.throws(() => checkSchemaVersion(catalogWith('stacks: []\n')), /no schemaVersion/)
    assert.throws(() => checkSchemaVersion(catalogWith()), /not a template catalog/)
  })
})

describe('locateLocalCatalog', () => {
  it('returns the resolved directory, and throws for a missing one', () => {
    const dir = temp()
    assert.equal(locateLocalCatalog(dir), path.resolve(dir))
    assert.throws(() => locateLocalCatalog(path.join(dir, 'nope')), /does not exist/)
  })
})

describe('locateCachedCatalog', () => {
  // A one-commit repository standing in for the catalog, cloned through a file path.
  function origin() {
    const dir = temp()
    git(dir, 'init', '-q')
    writeFileSync(path.join(dir, 'index.yaml'), 'schemaVersion: 1\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-qm', 'init')
    git(dir, 'tag', 'v1.2.3')
    return { dir, commit: git(dir, 'rev-parse', 'HEAD') }
  }
  it('clones the tag into the cache and accepts the locked commit', () => {
    const { dir, commit } = origin()
    const cache = temp()
    const lock = { repository: dir, version: 'v1.2.3', commit }
    const found = locateCachedCatalog(lock, cache)
    assert.equal(found, path.join(cache, 'v1.2.3'))
    assert.equal(locateCachedCatalog(lock, cache), found)
  })
  it('refuses a cache whose commit is not the locked one', () => {
    const { dir } = origin()
    const lock = { repository: dir, version: 'v1.2.3', commit: COMMIT }
    assert.throws(() => locateCachedCatalog(lock, temp()), /expects commit a{40} but .* is at/)
  })
})

describe('locateCatalog', () => {
  it('uses the override and still validates the lock and the schema', () => {
    const catalog = temp()
    writeFileSync(path.join(catalog, 'index.yaml'), 'schemaVersion: 1\n')
    const found = locateCatalog({ harnessRoot: withLock(lockText()), override: catalog })
    assert.equal(found.fromCache, false)
    assert.equal(found.catalog, path.resolve(catalog))
    assert.throws(() => locateCatalog({ harnessRoot: temp(), override: catalog }), CatalogError)
  })
})

describe('defaultCacheRoot and onDiskPath', () => {
  it('prefers FULLSTACK_TEMPLATES_CACHE', () => {
    assert.equal(defaultCacheRoot({ FULLSTACK_TEMPLATES_CACHE: '/x' }), '/x')
    assert.match(defaultCacheRoot({}), /fullstack-templates$/)
  })
  it('returns the on-disk spelling of an existing path and others unchanged', () => {
    const dir = temp()
    mkdirSync(path.join(dir, 'MixedCase'))
    const wrong = path.join(dir, 'mixedcase')
    // A case-sensitive file system has no such path, which leaves it unchanged.
    const expected = process.platform === 'linux' ? wrong : path.join(onDiskPath(dir), 'MixedCase')
    assert.equal(onDiskPath(wrong), expected)
    const missing = path.join(dir, 'gone')
    assert.equal(onDiskPath(missing), missing)
  })
})
