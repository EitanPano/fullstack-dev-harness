import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./bootstrap.mjs', import.meta.url))

// Both folders sit under the OS temp dir, outside any git repository. The cache points at an
// empty folder so a regression that skips the preflight cannot reach a real catalog cache.
function runOutsideGit(extraArgs) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-root-'))
  const cache = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-cache-'))
  try {
    const result = spawnSync(
      process.execPath,
      [script, '--stack', 'x', '--name', 'y', '--root', root, ...extraArgs],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          FULLSTACK_TEMPLATES_CACHE: cache,
          FULLSTACK_TEMPLATES_DIR: '',
          GIT_CEILING_DIRECTORIES: path.dirname(root),
        },
      },
    )
    return result
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(cache, { recursive: true, force: true })
  }
}

test('outside a git work tree it exits 1 with the preflight message before fetching', () => {
  const result = runOutsideGit([])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /not inside a git work tree/)
  assert.match(result.stderr, /git init/)
  assert.doesNotMatch(result.stdout, /Reading catalog\.lock|cloning/)
})

// --fetch writes no project, so it must work where the root is no git work tree. GIT_DIR points
// git at nothing, which makes every work tree check fail; the fixture catalog keeps it offline.
test('--fetch skips the preflight and prints the index of a local catalog', () => {
  const catalog = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-catalog-'))
  try {
    mkdirSync(path.join(catalog, 'tools'))
    writeFileSync(path.join(catalog, 'tools', 'package.json'), '{}\n')
    writeFileSync(path.join(catalog, 'index.yaml'), 'schemaVersion: 1\nstacks: []\n')
    const result = spawnSync(process.execPath, [script, '--fetch', '--templates', catalog], {
      encoding: 'utf8',
      env: { ...process.env, GIT_DIR: path.join(catalog, 'no-such-git-dir') },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /--- index\.yaml ---/)
    assert.doesNotMatch(result.stderr, /not inside a git work tree/)
  } finally {
    rmSync(catalog, { recursive: true, force: true })
  }
})

test('a --root that does not exist is reported as missing', () => {
  const missing = path.join(os.tmpdir(), `bootstrap-missing-root-${process.pid}`)
  const result = spawnSync(
    process.execPath,
    [script, '--stack', 'x', '--name', 'y', '--root', missing],
    { encoding: 'utf8', env: { ...process.env, FULLSTACK_TEMPLATES_DIR: '' } },
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /does not exist/)
  assert.doesNotMatch(result.stderr, /not inside a git work tree/)
})
