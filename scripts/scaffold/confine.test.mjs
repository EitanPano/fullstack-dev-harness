import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { assertConfined, safeRelative } from './confine.mjs'
import { ScaffoldError } from './request.mjs'

const refuses = (fn) =>
  assert.throws(fn, (e) => e instanceof ScaffoldError && e.exit === 2 && /outside|unsafe/.test(e.message))

describe('safeRelative', () => {
  it('accepts plain relative POSIX paths', () => {
    for (const ok of ['a.txt', 'frontend/src/app.txt', '.fullstack/catalog.yaml', 'a/.b/c']) {
      assert.equal(safeRelative(ok), ok)
    }
  })
  it('refuses absolute, parent, drive-letter, backslash, empty and NUL paths', () => {
    for (const bad of ['/etc/x', '../x', 'a/../../x', 'a/..', 'C:/x', 'c:x', 'a\\b', '', 'a\0b']) {
      refuses(() => safeRelative(bad))
    }
    refuses(() => safeRelative(undefined))
  })
})

describe('assertConfined', () => {
  it('passes a list that stays inside the root and names the first escape otherwise', () => {
    const root = path.resolve('some-root')
    assertConfined(root, ['a', 'b/c'])
    assert.throws(() => assertConfined(root, ['a', 'b/../../c']), /b\/\.\.\/\.\.\/c/)
  })
})
