// Recorded lanes: `.fullstack/catalog.yaml` adds write lanes for backend, frontend and qa.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const HOOK = path.resolve(here, '..', 'enforce-agent-boundaries.mjs')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lanes-'))
after(() => fs.rmSync(tmp, { recursive: true, force: true }))

const INLINE = [
  'packages:',
  '  app:',
  '    template: fullstack/astro-cloudflare-pages',
  '    lanes:',
  '      backend: [functions/, server/, shared/, migrations/, wrangler.jsonc, package.json]',
  '      frontend: [src/, public/, astro.config.mjs, package.json]',
  '      qa: [tests/]',
  ''
].join('\n')

const BLOCK = [
  'packages:',
  '  app:',
  '    lanes:',
  '      backend:',
  '        - functions/',
  '        - wrangler.jsonc',
  '      frontend:',
  '        - src/',
  '      qa:',
  '        - tests/',
  ''
].join('\n')

let counter = 0
// A project directory holding `catalog` (null: no file) and the verdict of one Edit by `role`.
function project(catalog) {
  counter += 1
  const root = path.join(tmp, `p${counter}`)
  fs.mkdirSync(path.join(root, '.fullstack'), { recursive: true })
  if (catalog !== null) fs.writeFileSync(path.join(root, '.fullstack', 'catalog.yaml'), catalog)
  return root
}

function verdict(root, role, rel, tool = 'Write') {
  const payload = {
    cwd: root,
    tool_name: tool,
    tool_input: { file_path: path.join(root, rel), content: 'x' },
    agent_type: role
  }
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root }
  delete env.AGENT_ROLE
  const result = spawnSync('node', [HOOK], { input: JSON.stringify(payload), env, encoding: 'utf8' })
  return { allowed: result.status === 0, stderr: result.stderr }
}

function expect(catalog, cases) {
  const root = project(catalog)
  for (const [role, rel, allowed] of cases) {
    const got = verdict(root, role, rel)
    assert.equal(got.allowed, allowed, `${role} ${rel}: ${got.stderr}`)
  }
}

test('inline lanes: backend writes its paths, not the frontend ones', () => {
  expect(INLINE, [
    ['backend', 'app/functions/x.ts', true],
    ['backend', 'app/functions/deep/x.ts', true],
    ['backend', 'app/wrangler.jsonc', true],
    ['backend', 'app/src/x.astro', false],
    ['backend', 'app/wrangler.jsonc.bak', false],
    ['backend', 'app/functionsx/a.ts', false],
    ['backend', 'app/tests/e2e/x.spec.ts', false]
  ])
})

test('inline lanes: frontend is the mirror', () => {
  expect(INLINE, [
    ['frontend', 'app/src/x.astro', true],
    ['frontend', 'app/public/a.png', true],
    ['frontend', 'app/astro.config.mjs', true],
    ['frontend', 'app/functions/x.ts', false],
    ['frontend', 'app/wrangler.jsonc', false]
  ])
})

test('inline lanes: qa writes tests, not source', () => {
  expect(INLINE, [
    ['qa', 'app/tests/e2e/x.spec.ts', true],
    ['qa', 'app/src/x', false],
    ['qa', 'app/functions/x.ts', false]
  ])
})

test('a path in two lanes is writable by both', () => {
  expect(INLINE, [
    ['backend', 'app/package.json', true],
    ['frontend', 'app/package.json', true],
    ['qa', 'app/package.json', false]
  ])
})

test('block lists work like inline lists', () => {
  expect(BLOCK, [
    ['backend', 'app/functions/x.ts', true],
    ['backend', 'app/src/x.astro', false],
    ['frontend', 'app/src/x.astro', true],
    ['qa', 'app/tests/a.ts', true]
  ])
})

test('a CRLF file works', () => {
  expect(INLINE.replace(/\n/g, '\r\n'), [
    ['backend', 'app/functions/x.ts', true],
    ['qa', 'app/tests/a.ts', true]
  ])
})

test('the constant lanes still apply with a record', () => {
  expect(INLINE, [
    ['backend', 'backend/src/x.ts', true],
    ['backend', '.orchestrate/t/backend.md', true],
    ['frontend', 'frontend/src/x.ts', true],
    ['qa', 'frontend/tests/x.ts', true]
  ])
})

for (const [name, catalog] of [
  ['no file', null],
  ['an empty file', ''],
  ['garbage', '\u0001 {{{ not yaml ]]'],
  ['lanes as a string', 'packages:\n  app:\n    lanes: backend\n'],
  ['no packages key', 'name: x\n'],
  ['a two-package project without lanes', 'packages:\n  backend:\n    template: a\n  frontend:\n    template: b\n']
]) {
  test(`constants only with ${name}`, () => {
    expect(catalog, [
      ['backend', 'app/functions/x.ts', false],
      ['frontend', 'app/src/x', false],
      ['qa', 'app/tests/x', false],
      ['backend', 'backend/x.ts', true],
      ['frontend', 'frontend/x.ts', true]
    ])
  })
}

test('an unreadable catalog (a directory) is constants only', () => {
  const root = project(null)
  fs.mkdirSync(path.join(root, '.fullstack', 'catalog.yaml'))
  assert.equal(verdict(root, 'backend', 'app/functions/x.ts').allowed, false)
  assert.equal(verdict(root, 'backend', 'backend/x.ts').allowed, true)
})

test('unsafe entries and package keys are ignored', () => {
  const entries = ['../x', '/abs', 'C:/x', 'a\\b', './x', '*', '""', 'src/../../x']
  const catalog = [
    'packages:',
    '  app:',
    '    lanes:',
    `      backend: [${entries.join(', ')}, functions/]`,
    '  ../evil:',
    '    lanes:',
    '      backend: [x/]',
    '  .:',
    '    lanes:',
    '      backend: [y/]',
    ''
  ].join('\n')
  expect(catalog, [
    ['backend', 'app/functions/x.ts', true],
    ['backend', 'x/a.ts', false],
    ['backend', 'y/a.ts', false],
    ['backend', 'a.ts', false],
    ['backend', 'app/src/x', false],
    ['backend', '.claude/settings.json', false],
    ['backend', 'app/x', false]
  ])
})

test('a recorded lane never reaches the repository machinery', () => {
  const catalog = [
    'packages:',
    '  app:',
    '    lanes:',
    '      backend: [../.fullstack/, ../.claude/, ../.plan/, ../backend/, .fullstack/catalog.yaml]',
    '      frontend: [../.fullstack/catalog.yaml, ../]',
    '      qa: [../.fullstack/catalog.yaml, /]',
    ''
  ].join('\n')
  const root = project(catalog)
  for (const role of ['backend', 'frontend', 'qa']) {
    for (const rel of [
      '.fullstack/catalog.yaml',
      '.claude/settings.json',
      '.plan/000-backlog.md',
      'app/.fullstack/catalog.yaml'
    ]) {
      assert.equal(verdict(root, role, rel).allowed, false, `${role} ${rel}`)
    }
  }
})

test('no role writes .fullstack/catalog.yaml, whatever is recorded', () => {
  const catalog = INLINE + '      reviewer: [.fullstack/catalog.yaml]\n'
  const root = project(catalog)
  for (const role of ['backend', 'frontend', 'qa', 'orchestrator', 'reviewer']) {
    assert.equal(verdict(root, role, '.fullstack/catalog.yaml').allowed, false, role)
  }
})

test('reviewer and orchestrator gain nothing from a record', () => {
  const catalog = [
    'packages:',
    '  app:',
    '    lanes:',
    '      reviewer: [src/]',
    '      orchestrator: [src/]',
    '      general-purpose: [src/]',
    ''
  ].join('\n')
  expect(catalog, [
    ['reviewer', 'app/src/x', false],
    ['orchestrator', 'app/src/x', false],
    ['reviewer', '.orchestrate/t/review.md', true],
    ['orchestrator', '.orchestrate/t/plan.md', true]
  ])
})

test('an unknown role gains nothing and the catalog is read from the project root only', () => {
  const root = project(INLINE)
  assert.equal(verdict(root, 'mystery', 'app/functions/x.ts').allowed, false)
  // The session sits in another directory with its own catalog: it is ignored.
  const other = project(INLINE)
  const rootNoRecord = project(null)
  const payload = {
    cwd: other,
    tool_name: 'Write',
    tool_input: { file_path: path.join(other, 'app/functions/x.ts'), content: 'x' },
    agent_type: 'backend'
  }
  const env = { ...process.env, CLAUDE_PROJECT_DIR: rootNoRecord }
  delete env.AGENT_ROLE
  const result = spawnSync('node', [HOOK], { input: JSON.stringify(payload), env, encoding: 'utf8' })
  assert.notEqual(result.status, 0)
})

test('the block message lists the constants and the recorded lanes', () => {
  const root = project(INLINE)
  const got = verdict(root, 'backend', 'app/src/x.astro')
  assert.equal(got.allowed, false)
  assert.match(got.stderr, /backend\//)
  assert.match(got.stderr, /app\/functions\//)
  assert.match(got.stderr, /app\/wrangler\.jsonc/)
})

if (process.platform === 'win32') {
  test('recorded lanes fold case on Windows', () => {
    expect(INLINE, [['backend', 'APP/Functions/x.ts', true]])
  })
}
