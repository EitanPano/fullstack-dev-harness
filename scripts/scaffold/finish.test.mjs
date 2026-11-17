import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { packageOf } from './finish.mjs'

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
