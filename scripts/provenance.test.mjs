import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { readProvenance } from './provenance.mjs'

// Shaped like the generator's `yaml` stringify output, including a folded long command.
const single = [
  'deploy: single',
  'packages:',
  '  frontend:',
  '    template: frontend/react',
  '    http:',
  '      port: 5173',
  '    commands:',
  '      check: >-',
  '        bun run typecheck && bun run lint',
  '  backend:',
  '    template: server/python-fastapi',
  '    http:',
  '      port: 8000',
  '',
].join('\n')

function read(text) {
  const dir = mkdtempSync(path.join(tmpdir(), 'provenance-'))
  const file = path.join(dir, 'catalog.yaml')
  writeFileSync(file, text)
  return readProvenance(file)
}

test('single: deploy, templates and ports, folded command skipped', () => {
  const result = read(single)
  assert.equal(result.deploy, 'single')
  assert.deepEqual(result.packages, [
    { name: 'frontend', template: 'frontend/react', port: 5173 },
    { name: 'backend', template: 'server/python-fastapi', port: 8000 },
  ])
})

test('split: deploy is read as written', () => {
  assert.equal(read(single.replace('deploy: single', 'deploy: split')).deploy, 'split')
})

test('absent deploy line leaves deploy undefined', () => {
  assert.equal(read(single.replace('deploy: single\n', '')).deploy, undefined)
})

test('a lone package has no deploy and keeps its port', () => {
  const lone = ['packages:', '  frontend:', '    template: frontend/react']
  const result = read([...lone, '    http:', '      port: 5173', ''].join('\n'))
  assert.equal(result.deploy, undefined)
  assert.equal(result.packages.length, 1)
  assert.equal(result.packages[0].port, 5173)
})

test('CRLF line endings', () => {
  const result = read(single.replace(/\n/g, '\r\n'))
  assert.equal(result.deploy, 'single')
  assert.equal(result.packages[1].port, 8000)
})

test('a leading BOM', () => {
  assert.equal(read(`﻿${single}`).deploy, 'single')
})

test('a quoted package key is read as its own package', () => {
  const result = read(single.replace('  backend:', '  "backend":'))
  assert.equal(result.packages[1].name, 'backend')
  assert.equal(result.packages[1].template, 'server/python-fastapi')
  assert.equal(result.packages[0].template, 'frontend/react')
})

test('an unparsed package key does not attach facts to the previous package', () => {
  const result = read(single.replace('  backend:', '  ? backend'))
  assert.equal(result.packages.length, 1)
  assert.equal(result.packages[0].template, 'frontend/react')
  assert.equal(result.packages[0].port, 5173)
})

test('a missing file gives an empty result', () => {
  const result = readProvenance(path.join(tmpdir(), 'provenance-does-not-exist.yaml'))
  assert.deepEqual(result, { deploy: undefined, packages: [] })
})
