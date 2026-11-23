import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { finish, packageOf } from './finish.mjs'

const provenance = (...dirs) => ({
  packages: Object.fromEntries(dirs.map((dir) => [dir, { template: 'x/y' }])),
})

describe('packageOf', () => {
  it('picks a nested package directory by its two segments', () => {
    const p = provenance('serverless/cloudflare', 'frontend')
    assert.equal(packageOf(p, 'serverless/cloudflare/functions/a.ts'), 'serverless/cloudflare')
    assert.equal(packageOf(p, 'frontend/src/a.ts'), 'frontend')
  })
  it('prefers the longest directory when one package nests inside another', () => {
    const p = provenance('serverless', 'serverless/cloudflare')
    assert.equal(packageOf(p, 'serverless/cloudflare/a.ts'), 'serverless/cloudflare')
    assert.equal(packageOf(p, 'serverless/other.ts'), 'serverless')
  })
  it('gives no package to a root file or a sibling prefix', () => {
    const p = provenance('serverless/cloudflare')
    assert.equal(packageOf(p, 'README.md'), undefined)
    assert.equal(packageOf(p, 'serverless/cloudflare-x/a.ts'), undefined)
    assert.equal(packageOf(p, 'serverless/a.ts'), undefined)
  })
})

describe('finish', () => {
  const project = (yaml, dirs) => {
    const root = mkdtempSync(path.join(tmpdir(), 'finish-'))
    mkdirSync(path.join(root, '.fullstack'))
    writeFileSync(path.join(root, '.fullstack', 'catalog.yaml'), yaml)
    for (const dir of dirs) mkdirSync(path.join(root, dir))
    return root
  }
  const YAML =
    'packages:\n  site:\n    template: frontend/astro\n  old:\n    template: frontend/vue\n'
  const NEXT = { packages: { site: {}, old: {} } }
  it('seeds the packages the scaffold added, once, and leaves an older one alone', () => {
    const root = project(YAML, ['site', 'old'])
    try {
      finish(root, NEXT, root, 'again', ['site', 'site:pwa', 'database=postgres'])
      assert.ok(existsSync(path.join(root, 'site', '.doc', 'design.md')))
      assert.equal(existsSync(path.join(root, 'old', '.doc')), false)
      writeFileSync(path.join(root, 'site', '.doc', 'design.md'), 'mine\n')
      finish(root, NEXT, root, 'again', ['site'])
      assert.equal(readFileSync(path.join(root, 'site', '.doc', 'design.md'), 'utf8'), 'mine\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('seeds nothing when no package was added', () => {
    const root = project(YAML, ['site', 'old'])
    try {
      finish(root, NEXT, root, 'again', ['database=postgres'])
      assert.equal(existsSync(path.join(root, 'site', '.doc')), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
