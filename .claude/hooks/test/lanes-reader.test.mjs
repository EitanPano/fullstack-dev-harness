// Unit tests of the strict reader that derives lanes from each package's `template:` kind.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { lanesFor, parsePackages } from '../lib/lanes.mjs'

const TWO = `
# a comment
stack: astro-cloudflare
packages:
  serverless/cloudflare:
    template: serverless/cloudflare  # trailing comment
    version: 1.0.0
    flags: { jobs: false }
  frontend:
    template: frontend/astro
    version: 1.0.0
providers: {}
`

test('reads a bare two-segment key and the key after it', () => {
  assert.deepEqual(parsePackages(TWO), [
    { dir: 'serverless/cloudflare', kind: 'serverless' },
    { dir: 'frontend', kind: 'frontend' }
  ])
})

test('reads a quoted key, a quoted template and an inline template', () => {
  const text = [
    'packages:',
    '  "serverless/cloudflare":',
    '    template: "serverless/cloudflare"',
    "  'frontend': { template: frontend/astro, version: 1.0.0 }",
    '  api:',
    '    template: server/bun-express',
    ''
  ].join('\n')
  assert.deepEqual(parsePackages(text), [
    { dir: 'serverless/cloudflare', kind: 'serverless' },
    { dir: 'frontend', kind: 'frontend' },
    { dir: 'api', kind: 'server' }
  ])
})

test('reads a CRLF file with a BOM', () => {
  const got = parsePackages('﻿' + TWO.replace(/\n/g, '\r\n'))
  assert.equal(got.length, 2)
})

test('ignores a lanes map', () => {
  const text = 'packages:\n  app:\n    template: x/y\n    lanes:\n      qa: [tests/]\n'
  assert.deepEqual(lanesFor(parsePackages(text), 'qa'), [])
})

for (const [name, text] of [
  ['an empty file', ''],
  ['garbage', '\u0000\u0001 not yaml at all {{{ ]]'],
  ['no packages key', 'name: x\n'],
  ['a tab indent', 'packages:\n\tapi:\n\t\ttemplate: server/x\n'],
  ['no template', 'packages:\n  api:\n    version: 1\n'],
  ['a template with no slash', 'packages:\n  api:\n    template: server\n'],
  ['a repeated template', 'packages:\n  api:\n    template: server/a\n    template: server/b\n'],
  ['an inline repeated template', 'packages:\n  api: { template: server/a, template: server/b }\n']
]) {
  test(`reads nothing from ${name}`, () => {
    assert.deepEqual(parsePackages(text), [])
  })
}

test('a malformed package drops only itself', () => {
  const text = 'packages:\n  one:\n    version: 1\n  two:\n    template: server/x\n'
  assert.deepEqual(parsePackages(text), [{ dir: 'two', kind: 'server' }])
})

test('a package nested under another recorded package is dropped', () => {
  const text = [
    'packages:',
    '  serverless:',
    '    template: serverless/cloudflare',
    '  serverless/cloudflare:',
    '    template: serverless/cloudflare',
    ''
  ].join('\n')
  assert.deepEqual(parsePackages(text), [{ dir: 'serverless', kind: 'serverless' }])
})

for (const key of ['../evil', '.', '..', 'a/b/c', 'App', '1app', '.claude', 'a b', 'a.b', '-x',
  'serverless/..', 'serverless/.', '../x', 'scripts', 'db', 'docs', 'node_modules',
  'scripts/x', 'db/x']) {
  test(`grants nothing to the package key ${JSON.stringify(key)}`, () => {
    const text = `packages:\n  "${key}":\n    template: server/x\n`
    for (const role of ['backend', 'frontend', 'qa']) {
      assert.deepEqual(lanesFor(parsePackages(text), role), [])
    }
  })
}

test('lanesFor derives by kind', () => {
  const packages = [
    { dir: 'serverless/cloudflare', kind: 'serverless' },
    { dir: 'frontend', kind: 'frontend' },
    { dir: 'api', kind: 'server' },
    { dir: 'worker', kind: 'job' }
  ]
  assert.deepEqual(lanesFor(packages, 'backend'), ['serverless/cloudflare/', 'api/'])
  assert.deepEqual(lanesFor(packages, 'frontend'), ['frontend/'])
  assert.deepEqual(lanesFor(packages, 'qa'), [
    'serverless/cloudflare/tests/',
    'frontend/tests/',
    'api/tests/'
  ])
})

test('only backend, frontend and qa gain lanes', () => {
  const packages = [{ dir: 'api', kind: 'server' }]
  for (const role of ['reviewer', 'orchestrator', 'general-purpose', 'other', '__proto__']) {
    assert.deepEqual(lanesFor(packages, role), [])
  }
})
