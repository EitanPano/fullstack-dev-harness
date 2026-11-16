import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  '      testDb: >-',
  '        docker compose up -d --wait database',
  '        && bun run test',
  '      dev: bun run dev # reload',
  '  backend:',
  '    template: server/python-fastapi',
  '    http:',
  '      port: 8000',
  '    commands:',
  '      check: uv run poe check',
  '      contract: "uv run poe contract"',
  '',
].join('\n')

function read(text) {
  const dir = mkdtempSync(path.join(tmpdir(), 'provenance-'))
  const file = path.join(dir, 'catalog.yaml')
  writeFileSync(file, text)
  try {
    return readProvenance(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('single: deploy, templates and ports', () => {
  const result = read(single)
  assert.equal(result.deploy, 'single')
  assert.deepEqual(
    result.packages.map(({ name, dir, template, port }) => ({ name, dir, template, port })),
    [
      { name: 'frontend', dir: 'frontend', template: 'frontend/react', port: 5173 },
      { name: 'backend', dir: 'backend', template: 'server/python-fastapi', port: 8000 },
    ],
  )
})

test('commands: folded lines are joined, plain and quoted values are read', () => {
  const [frontend, backend] = read(single).packages
  assert.deepEqual(frontend.commands, {
    check: 'bun run typecheck && bun run lint',
    testDb: 'docker compose up -d --wait database && bun run test',
    dev: 'bun run dev',
  })
  assert.deepEqual(backend.commands, { check: 'uv run poe check', contract: 'uv run poe contract' })
})

test('a package with no commands block has an empty command map', () => {
  const result = read(['packages:', '  frontend:', '    template: frontend/react', ''].join('\n'))
  assert.deepEqual(result.packages[0].commands, {})
})

test('a port stays out of the commands', () => {
  const [frontend] = read(single).packages
  assert.equal(frontend.port, 5173)
  assert.equal('port' in frontend.commands, false)
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

test('a literal block joins its lines with newlines, a folded one with spaces', () => {
  const text = [
    'packages:',
    '  backend:',
    '    template: server/x',
    '    commands:',
    '      check: |',
    '        one',
    '        two',
    '      lint: >',
    '        three',
    '        four',
    '',
  ].join('\n')
  assert.deepEqual(read(text).packages[0].commands, { check: 'one\ntwo', lint: 'three four' })
})

const LANE_ROLES = {
  backend: ['functions/', 'server/', 'shared/', 'migrations/', 'wrangler.jsonc', 'package.json'],
  frontend: ['src/', 'public/', 'astro.config.mjs', 'package.json'],
  qa: ['tests/'],
}

test('a one-package fullstack record: inline http and inline lanes are read', () => {
  const text = [
    'stack: astro-cloudflare-pages',
    'providers: {}',
    'packages:',
    '  app:',
    '    template: fullstack/astro-cloudflare-pages',
    '    version: 1.0.0',
    '    flags: { auth: true, jobs: false, islands: false }',
    '    capabilities: {}',
    '    commands:',
    '      check: bun run check',
    '      testDb: bun run test:db',
    '    http: { port: 4321, health: /api/health }',
    '    lanes:',
    '      backend: [functions/, server/, shared/, migrations/, wrangler.jsonc, package.json]',
    "      frontend: [src/, public/, 'astro.config.mjs', package.json]",
    '      qa: [tests/]',
    '',
  ].join('\n')
  const result = read(text)
  assert.equal(result.deploy, undefined)
  assert.equal(result.packages.length, 1)
  const [app] = result.packages
  assert.equal(app.template, 'fullstack/astro-cloudflare-pages')
  assert.equal(app.port, 4321)
  assert.deepEqual(app.commands, { check: 'bun run check', testDb: 'bun run test:db' })
  assert.deepEqual(app.lanes, LANE_ROLES)
})

test('lanes in block form (a list under each role) and a record without lanes', () => {
  const text = [
    'packages:',
    '  app:',
    '    template: fullstack/x',
    '    lanes:',
    '      backend:',
    '        - functions/',
    '        - "package.json" # shared',
    '      qa:',
    '        - tests/',
    '    http:',
    '      port: 4321',
    '  other:',
    '    template: frontend/react',
    '',
  ].join('\n')
  const [app, other] = read(text).packages
  assert.deepEqual(app.lanes, { backend: ['functions/', 'package.json'], qa: ['tests/'] })
  assert.equal(app.port, 4321)
  assert.equal(other.lanes, undefined)
})

test('answers.brand and the v1.4.0 start and e2eDb commands: brand stays out of the commands', () => {
  const text = [
    'deploy: single',
    'answers:',
    '  brand:',
    '    displayName: Plant Care',
    '    primary: "#2f6f4e"',
    '    radius: lg',
    'packages:',
    '  frontend:',
    '    template: frontend/next',
    '    http:',
    '      port: 3000',
    '    commands:',
    '      check: bun run check',
    '  backend:',
    '    template: server/bun-express',
    '    http:',
    '      port: 4000',
    '    commands:',
    '      start: bun run start',
    '      e2eDb: >-',
    '        docker compose up -d --wait database',
    '        && bun run db:e2e',
    '',
  ].join('\n')
  const result = read(text)
  assert.equal(result.deploy, 'single')
  assert.equal(result.packages.length, 2)
  assert.equal(result.packages[0].port, 3000)
  assert.deepEqual(result.packages[0].commands, { check: 'bun run check' })
  assert.deepEqual(result.packages[1].commands, {
    start: 'bun run start',
    e2eDb: 'docker compose up -d --wait database && bun run db:e2e',
  })
})
