// Unit tests of the strict reader for `packages.<name>.lanes` in .fullstack/catalog.yaml.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseLaneRecord, confinedLanes } from '../lib/lanes.mjs'

const INLINE = `
# a comment
packages:
  app:
    template: fullstack/astro-cloudflare-pages  # trailing comment
    lanes:
      backend: [functions/, server/, wrangler.jsonc, package.json]
      frontend: ['src/', "public/", astro.config.mjs]
      qa: [tests/]
`

test('reads inline lists, quoted scalars and comments', () => {
  assert.deepEqual(parseLaneRecord(INLINE), {
    app: {
      backend: ['functions/', 'server/', 'wrangler.jsonc', 'package.json'],
      frontend: ['src/', 'public/', 'astro.config.mjs'],
      qa: ['tests/']
    }
  })
})

test('reads block lists, indented or flush with the key', () => {
  const text = [
    'packages:',
    '  app:',
    '    lanes:',
    '      backend:',
    '        - functions/',
    '        - "wrangler.jsonc"   # why',
    '      qa:',
    '      - tests/',
    ''
  ].join('\n')
  assert.deepEqual(parseLaneRecord(text), {
    app: { backend: ['functions/', 'wrangler.jsonc'], qa: ['tests/'] }
  })
})

test('reads a CRLF file with a BOM', () => {
  const text = '\uFEFF' + INLINE.replace(/\n/g, '\r\n')
  assert.deepEqual(parseLaneRecord(text).app.qa, ['tests/'])
})

test('reads an empty inline list as no entries', () => {
  assert.deepEqual(parseLaneRecord('packages:\n  app:\n    lanes:\n      qa: []\n'), {
    app: { qa: [] }
  })
})

test('a package without lanes, and other packages, are read apart', () => {
  const text = [
    'packages:',
    '  backend:',
    '    template: x',
    '  app:',
    '    lanes:',
    '      qa: [tests/]'
  ].join('\n')
  assert.deepEqual(parseLaneRecord(text), { app: { qa: ['tests/'] } })
})

for (const [name, text] of [
  ['an empty file', ''],
  ['garbage', '\u0000\u0001 not yaml at all {{{ ]]'],
  ['no packages key', 'name: x\n'],
  ['lanes that is a string', 'packages:\n  app:\n    lanes: nope\n'],
  ['lanes that is a flow map', 'packages:\n  app:\n    lanes: {qa: [tests/]}\n'],
  ['a role that is a string', 'packages:\n  app:\n    lanes:\n      qa: tests/\n'],
  ['a tab indent', 'packages:\n\tapp:\n\t\tlanes:\n\t\t\tqa: [tests/]\n'],
  ['an unterminated list', 'packages:\n  app:\n    lanes:\n      qa: [tests/\n'],
  ['a nested list', 'packages:\n  app:\n    lanes:\n      qa: [[tests/]]\n'],
  ['a duplicate role', 'packages:\n  app:\n    lanes:\n      qa: [a/]\n      qa: [b/]\n']
]) {
  test(`reads no lanes from ${name}`, () => {
    assert.deepEqual(parseLaneRecord(text), {})
  })
}

test('a malformed package drops only itself', () => {
  const text = [
    'packages:',
    '  one:',
    '    lanes:',
    '      qa: tests/',
    '  two:',
    '    lanes:',
    '      qa: [tests/]'
  ].join('\n')
  assert.deepEqual(parseLaneRecord(text), { two: { qa: ['tests/'] } })
})

test('confinedLanes prefixes the package and keeps plain paths', () => {
  const record = { app: { backend: ['functions/', 'wrangler.jsonc', 'a/b.ts'] } }
  assert.deepEqual(confinedLanes(record, 'backend'), [
    'app/functions/',
    'app/wrangler.jsonc',
    'app/a/b.ts'
  ])
  assert.deepEqual(confinedLanes(record, 'qa'), [])
})

for (const entry of ['../x', '/abs', 'C:/x', 'c:x', 'a\\b', './x', 'a/./b', 'a/../b', '*', 'a/*', '',
  'a//b', ' x', 'x ', '.', '..', '../', 'a?b', 'x\u0000']) {
  test(`ignores the entry ${JSON.stringify(entry)}`, () => {
    assert.deepEqual(confinedLanes({ app: { backend: [entry, 'ok/'] } }, 'backend'), ['app/ok/'])
  })
}

for (const key of ['../evil', '.', '..', 'a/b', 'App', '1app', '.claude', 'a b', 'a.b', '', '-x']) {
  test(`ignores the package key ${JSON.stringify(key)}`, () => {
    assert.deepEqual(confinedLanes({ [key]: { backend: ['ok/'] } }, 'backend'), [])
  })
}

test('only backend, frontend and qa gain lanes', () => {
  const record = { app: { reviewer: ['x/'], orchestrator: ['x/'], 'general-purpose': ['x/'] } }
  for (const role of ['reviewer', 'orchestrator', 'general-purpose', 'other', '__proto__']) {
    assert.deepEqual(confinedLanes(record, role), [])
  }
})
