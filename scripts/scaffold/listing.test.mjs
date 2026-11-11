import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { listFiles } from './listing.mjs'
import { ScaffoldError } from './request.mjs'

const top = mkdtempSync(path.join(os.tmpdir(), 'scaffold-listing-'))
after(() => rmSync(top, { recursive: true, force: true }))

describe('listFiles', () => {
  it('lists every file, whatever the global git configuration ignores', () => {
    const dir = path.join(top, 'tree')
    mkdirSync(path.join(dir, 'src'), { recursive: true })
    writeFileSync(path.join(dir, 'src', 'server.txt'), 'x\n')
    writeFileSync(path.join(dir, '.env.example'), 'X=\n')
    const ignore = path.join(top, 'ignore')
    writeFileSync(ignore, 'server.txt\n.env*\n')
    const config = path.join(top, 'gitconfig')
    writeFileSync(config, `[core]\n\texcludesFile = ${ignore.replaceAll('\\', '/')}\n`)
    const saved = process.env.GIT_CONFIG_GLOBAL
    process.env.GIT_CONFIG_GLOBAL = config
    try {
      assert.deepEqual(listFiles(dir).sort(), ['.env.example', 'src/server.txt'])
    } finally {
      if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL
      else process.env.GIT_CONFIG_GLOBAL = saved
    }
  })
  it('fails with exit 3 naming git when a git call fails', () => {
    assert.throws(
      () => listFiles(path.join(top, 'missing')),
      (e) => e instanceof ScaffoldError && e.exit === 3 && /git init failed/.test(e.message),
    )
  })
})
