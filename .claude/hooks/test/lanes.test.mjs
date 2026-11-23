// Derived lanes: each package's template kind in `.fullstack/catalog.yaml` adds write lanes.
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

const BARE = [
  'stack: astro-cloudflare',
  'packages:',
  '  serverless/cloudflare:',
  '    template: serverless/cloudflare',
  '    version: 1.0.0',
  '  frontend:',
  '    template: frontend/astro',
  '    version: 1.0.0',
  'providers: {}',
  ''
].join('\n')

const QUOTED_INLINE = [
  'packages:',
  '  "serverless/cloudflare": { template: serverless/cloudflare, version: 1.0.0 }',
  "  'frontend': { template: 'frontend/astro' }",
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

const SHAPES = {
  'bare keys': BARE,
  'quoted keys and inline templates': QUOTED_INLINE,
  'CRLF': BARE.replace(/\n/g, '\r\n'),
  'a BOM': '\uFEFF' + BARE
}

for (const [name, catalog] of Object.entries(SHAPES)) {
  test(`${name}: backend writes the serverless package, not the frontend`, () => {
    expect(catalog, [
      ['backend', 'serverless/cloudflare/functions/x.ts', true],
      ['backend', 'serverless/cloudflare/wrangler.jsonc', true],
      ['backend', 'frontend/src/x.astro', false],
      ['backend', 'serverless/cloudflarex/a.ts', false]
    ])
  })

  test(`${name}: frontend is the mirror`, () => {
    expect(catalog, [
      ['frontend', 'frontend/src/x.astro', true],
      ['frontend', 'serverless/cloudflare/functions/x.ts', false]
    ])
  })

  test(`${name}: qa writes tests, not source`, () => {
    expect(catalog, [
      ['qa', 'serverless/cloudflare/tests/x.test.ts', true],
      ['qa', 'frontend/tests/e2e/x.spec.ts', true],
      ['qa', 'frontend/src/x', false],
      ['qa', 'serverless/cloudflare/functions/x.ts', false]
    ])
  })
}

// Plan 030: a frontend's directory is its type, and a project may record several.
test('typed frontend directories: each recorded frontend is a lane, qa gets its tests', () => {
  const catalog = [
    'stack: astro-cloudflare',
    'packages:',
    '  serverless/cloudflare:',
    '    template: serverless/cloudflare',
    '  site:',
    '    template: frontend/astro',
    '  admin:',
    '    template: frontend/astro',
    '  app-billing:',
    '    template: frontend/astro',
    ''
  ].join('\n')
  expect(catalog, [
    ['frontend', 'site/src/pages/index.astro', true],
    ['frontend', 'admin/src/pages/index.astro', true],
    ['frontend', 'app-billing/src/x.ts', true],
    ['frontend', 'app-other/src/x.ts', false],
    ['frontend', 'serverless/cloudflare/server/api/admin/lead/routes.ts', false],
    ['backend', 'admin/src/x.ts', false],
    ['backend', 'serverless/cloudflare/server/api/admin/lead/routes.ts', true],
    ['qa', 'site/tests/e2e/x.spec.ts', true],
    ['qa', 'admin/tests/unit/x.test.ts', true],
    ['qa', 'app-billing/tests/x.test.ts', true],
    ['qa', 'admin/src/x.ts', false]
  ])
})

test('a renamed standard package derives backend from its template', () => {
  const catalog = 'packages:\n  api:\n    template: server/bun-express\n'
  expect(catalog, [
    ['backend', 'api/src/x.ts', true],
    ['qa', 'api/tests/x.ts', true],
    ['frontend', 'api/src/x.ts', false]
  ])
})

test('the constant lanes still apply with a record', () => {
  expect(BARE, [
    ['backend', 'backend/src/x.ts', true],
    ['backend', '.orchestrate/t/backend.md', true],
    ['frontend', 'frontend/src/x.ts', true],
    ['qa', 'frontend/tests/x.ts', true]
  ])
})

// Plan 032: a frontend agent writes its package's `.doc/`; the root `.doc/` stays closed.
test('frontend writes its own package .doc/, never the root .doc/', () => {
  expect(BARE, [
    ['frontend', 'frontend/.doc/design.md', true],
    ['frontend', '.doc/architecture.md', false]
  ])
})

for (const [name, catalog] of [
  ['no file', null],
  ['an empty file', ''],
  ['garbage', '\u0001 {{{ not yaml ]]'],
  ['no packages key', 'name: x\n'],
  ['a two-package project of unknown kinds', 'packages:\n  a:\n    template: job/x\n  b:\n    template: nope\n'],
  ['a lanes map only', 'packages:\n  app:\n    lanes:\n      backend: [functions/]\n']
]) {
  test(`constants only with ${name}`, () => {
    expect(catalog, [
      ['backend', 'app/functions/x.ts', false],
      ['backend', 'serverless/cloudflare/x.ts', false],
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
  assert.equal(verdict(root, 'backend', 'serverless/cloudflare/x.ts').allowed, false)
  assert.equal(verdict(root, 'backend', 'backend/x.ts').allowed, true)
})

test('unsafe or unnamed package keys grant nothing', () => {
  const keys = ['scripts', 'db', '../x', 'a/b/c', 'serverless/..', '.claude', 'docs']
  const catalog = ['packages:', ...keys.flatMap(k => [`  "${k}":`, '    template: server/x']), ''].join('\n')
  expect(catalog, [
    ['backend', 'scripts/a.mjs', false],
    ['backend', 'x/a.ts', false],
    ['backend', 'a/b/c/x.ts', false],
    ['backend', 'serverless/x.ts', false],
    ['backend', '.claude/settings.json', false],
    ['backend', 'docs/x.md', false],
    ['qa', 'scripts/tests/x.mjs', false]
  ])
})

test('an unknown template kind or one with no slash grants nothing', () => {
  const catalog = 'packages:\n  one:\n    template: worker/x\n  two:\n    template: server\n'
  expect(catalog, [
    ['backend', 'one/x.ts', false],
    ['backend', 'two/x.ts', false]
  ])
})

test('a package nested under another recorded package is dropped', () => {
  const catalog = [
    'packages:',
    '  serverless:',
    '    template: frontend/x',
    '  serverless/cloudflare:',
    '    template: serverless/cloudflare',
    ''
  ].join('\n')
  expect(catalog, [
    ['backend', 'serverless/cloudflare/x.ts', false],
    ['frontend', 'serverless/x.ts', true]
  ])
})

test('a recorded package never reaches the repository machinery', () => {
  const root = project(BARE)
  for (const role of ['backend', 'frontend', 'qa']) {
    for (const rel of [
      '.fullstack/catalog.yaml',
      '.claude/settings.json',
      '.plan/000-backlog.md'
    ]) {
      assert.equal(verdict(root, role, rel).allowed, false, `${role} ${rel}`)
    }
  }
})

test('no role writes .fullstack/catalog.yaml', () => {
  const root = project(BARE)
  for (const role of ['backend', 'frontend', 'qa', 'orchestrator', 'reviewer']) {
    assert.equal(verdict(root, role, '.fullstack/catalog.yaml').allowed, false, role)
  }
})

test('reviewer and orchestrator gain nothing from a record', () => {
  expect(BARE, [
    ['reviewer', 'frontend/src/x', false],
    ['orchestrator', 'serverless/cloudflare/x', false],
    ['reviewer', '.orchestrate/t/review.md', true],
    ['orchestrator', '.orchestrate/t/plan.md', true]
  ])
})

test('an unknown role gains nothing and the catalog is read from the project root only', () => {
  const root = project(BARE)
  assert.equal(verdict(root, 'mystery', 'serverless/cloudflare/x.ts').allowed, false)
  const other = project(BARE)
  const rootNoRecord = project(null)
  const payload = {
    cwd: other,
    tool_name: 'Write',
    tool_input: { file_path: path.join(other, 'serverless/cloudflare/x.ts'), content: 'x' },
    agent_type: 'backend'
  }
  const env = { ...process.env, CLAUDE_PROJECT_DIR: rootNoRecord }
  delete env.AGENT_ROLE
  const result = spawnSync('node', [HOOK], { input: JSON.stringify(payload), env, encoding: 'utf8' })
  assert.notEqual(result.status, 0)
})

test('the block message lists the constants and the derived lanes', () => {
  const root = project(BARE)
  const got = verdict(root, 'backend', 'frontend/src/x.astro')
  assert.equal(got.allowed, false)
  assert.match(got.stderr, /backend\//)
  assert.match(got.stderr, /serverless\/cloudflare\//)
})

if (process.platform === 'win32') {
  test('derived lanes fold case on Windows', () => {
    expect(BARE, [['backend', 'Serverless/Cloudflare/Functions/x.ts', true]])
  })
}
