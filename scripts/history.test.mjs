import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { authFlagFrom, clearHarnessHistory, resolveAuthMarkers } from './history.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const mixed = [
  '# Doc',
  '| session | A record | table `session` <!-- auth --> |',
  '| module | Reference | `api/module/` |',
  '<!-- auth-start -->',
  '- Default: JWT',
  '<!-- auth-end -->',
  '<!-- noauth: - Auth: none. No accounts. -->',
  '<!-- noauth:   a planned change. -->',
  '- Client model',
  '',
].join('\n')

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'history-'))
}

test('resolveAuthMarkers keeps an inline row without its marker when auth is on', () => {
  const out = resolveAuthMarkers('a\n| x | y <!-- auth --> |\nb', true)
  assert.equal(out, 'a\n| x | y |\nb')
})

test('resolveAuthMarkers drops an inline row when auth is off', () => {
  assert.equal(resolveAuthMarkers('a\n| x | y <!-- auth -->\nb', false), 'a\nb')
})

test('resolveAuthMarkers keeps or drops a block', () => {
  const text = 'a\n  <!-- auth-start -->\nx\ny\n<!-- auth-end -->\nb'
  assert.equal(resolveAuthMarkers(text, true), 'a\nx\ny\nb')
  assert.equal(resolveAuthMarkers(text, false), 'a\nb')
})

test('resolveAuthMarkers turns noauth lines into text or drops them', () => {
  const text = 'a\n  <!-- noauth: - none -->\n<!-- noauth:   more -->\nb'
  assert.equal(resolveAuthMarkers(text, false), 'a\n  - none\n  more\nb')
  assert.equal(resolveAuthMarkers(text, true), 'a\nb')
})

test('resolveAuthMarkers throws on an unclosed block', () => {
  assert.throws(() => resolveAuthMarkers('<!-- auth-start -->\nx', true), /auth-start/)
})

test('resolveAuthMarkers keeps the line ending and the trailing newline', () => {
  const crlf = resolveAuthMarkers(mixed.replace(/\n/g, '\r\n'), false)
  assert.ok(crlf.endsWith('\r\n'))
  assert.equal(crlf.replace(/\r\n/g, ''), crlf.replace(/[\r\n]/g, ''))
  assert.ok(!/(?<!\r)\n/.test(crlf))
  const lf = resolveAuthMarkers(mixed, true)
  assert.ok(!lf.includes('\r'))
  assert.ok(lf.endsWith('\n'))
})

test('resolveAuthMarkers returns a text with no marker unchanged', () => {
  const text = 'one\r\ntwo\r\n<!-- FILL: x -->\r\n'
  assert.equal(resolveAuthMarkers(text, true), text)
  assert.equal(resolveAuthMarkers(text, false), text)
})

test('resolveAuthMarkers leaves no marker in either variant', () => {
  for (const auth of [true, false]) {
    const out = resolveAuthMarkers(mixed, auth)
    assert.ok(!/<!-- (no)?auth/.test(out), out)
  }
  assert.ok(resolveAuthMarkers(mixed, false).includes('- Auth: none. No accounts.\n  a planned'))
  assert.ok(resolveAuthMarkers(mixed, true).includes('- Default: JWT'))
})

function git(root, ...args) {
  const flags = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false']
  const run = spawnSync('git', ['-C', root, ...flags, ...args], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
}

// Plans are only the harness's to delete when git tracks them, so a seeded root is a repository.
function seed(root, { tracked = true } = {}) {
  mkdirSync(path.join(root, '.plan'))
  mkdirSync(path.join(root, '.doc'))
  for (const name of ['000-backlog.md', '001-a.md', '010-b.md', 'notes.md']) {
    writeFileSync(path.join(root, '.plan', name), 'x\n')
  }
  writeFileSync(
    path.join(root, '.doc', 'glossary.md'),
    '| Term |\n| session | s <!-- auth --> |\n| module | m |\n',
  )
  writeFileSync(path.join(root, '.doc', 'architecture.md'), mixed.replace(/\n/g, '\r\n'))
  if (tracked) {
    git(root, 'init', '-q')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'seed')
  }
}

test('clearHarnessHistory removes plans and the auth text under auth off', () => {
  const root = tempRoot()
  seed(root)
  const result = clearHarnessHistory(root, { auth: false })
  assert.deepEqual(result.removedPlans, ['.plan/001-a.md', '.plan/010-b.md'])
  assert.deepEqual([...result.docs].sort(), ['.doc/architecture.md', '.doc/glossary.md'])
  assert.deepEqual(readdirSync(path.join(root, '.plan')).sort(), ['000-backlog.md', 'notes.md'])
  const glossary = readFileSync(path.join(root, '.doc', 'glossary.md'), 'utf8')
  assert.ok(!glossary.includes('session'))
  assert.ok(glossary.includes('| module | m |'))
  const arch = readFileSync(path.join(root, '.doc', 'architecture.md'), 'utf8')
  assert.ok(!/(?<!\r)\n/.test(arch))
  assert.ok(arch.includes('- Auth: none. No accounts.'))
  assert.ok(!arch.includes('JWT'))
})

test('clearHarnessHistory keeps the auth text under auth on', () => {
  const root = tempRoot()
  seed(root)
  clearHarnessHistory(root, { auth: true })
  const glossary = readFileSync(path.join(root, '.doc', 'glossary.md'), 'utf8')
  assert.ok(glossary.includes('| session | s |'))
  assert.ok(!glossary.includes('<!--'))
  const arch = readFileSync(path.join(root, '.doc', 'architecture.md'), 'utf8')
  assert.ok(arch.includes('- Default: JWT'))
  assert.ok(!arch.includes('none'))
})

test('clearHarnessHistory on an empty root returns empty lists and creates nothing', () => {
  const root = tempRoot()
  assert.deepEqual(clearHarnessHistory(root, { auth: true }), {
    removedPlans: [],
    keptPlans: [],
    docs: [],
  })
  assert.deepEqual(readdirSync(root), [])
})

test('authFlagFrom reads the resolved flag from the provenance', () => {
  const dir = tempRoot()
  const file = path.join(dir, 'catalog.yaml')
  writeFileSync(file, 'packages:\n  backend:\n    flags:\n      auth: false\n')
  assert.equal(authFlagFrom(file), false)
  writeFileSync(file, 'packages:\n  backend:\n    flags:\n      auth: true\n')
  assert.equal(authFlagFrom(file), true)
  assert.equal(authFlagFrom(path.join(dir, 'missing.yaml')), true)
  assert.ok(!existsSync(path.join(dir, 'missing.yaml')))
})

test("the repository's own .doc files resolve cleanly in both variants", () => {
  const glossary = readFileSync(path.join(repo, '.doc', 'glossary.md'), 'utf8')
  const arch = readFileSync(path.join(repo, '.doc', 'architecture.md'), 'utf8')
  // Conditional on content, so the test holds before and after a file is cleared: a file with
  // markers loses them in both variants, a file without any comes back unchanged.
  const marked = (text) => /<!--\s*(no)?auth|auth-(start|end)/.test(text)
  for (const text of [glossary, arch]) {
    for (const auth of [true, false]) {
      const out = resolveAuthMarkers(text, auth)
      if (marked(text)) assert.ok(!marked(out))
      else assert.equal(out, text)
    }
  }
  if (marked(glossary)) {
    const noAuthGlossary = resolveAuthMarkers(glossary, false)
    for (const term of ['session', 'caller', 'OTP', 'target']) {
      assert.ok(!noAuthGlossary.split('\n').some((line) => line.startsWith(`| ${term}`)))
    }
  }
  if (marked(arch)) assert.ok(resolveAuthMarkers(arch, false).includes('Auth: none'))
})

test('clearHarnessHistory keeps a modified tracked plan and an untracked plan', () => {
  const root = tempRoot()
  seed(root)
  writeFileSync(path.join(root, '.plan', '001-a.md'), 'edited by the product\n')
  writeFileSync(path.join(root, '.plan', '020-own.md'), 'new\n')
  const result = clearHarnessHistory(root, { auth: false })
  assert.deepEqual(result.removedPlans, ['.plan/010-b.md'])
  assert.deepEqual(result.keptPlans, ['.plan/001-a.md', '.plan/020-own.md'])
  const kept = readFileSync(path.join(root, '.plan', '001-a.md'), 'utf8')
  assert.equal(kept, 'edited by the product\n')
  assert.ok(existsSync(path.join(root, '.plan', '020-own.md')))
})

test('clearHarnessHistory keeps every plan when the root is not a git repository', () => {
  const root = tempRoot()
  seed(root, { tracked: false })
  const result = clearHarnessHistory(root, { auth: true })
  assert.deepEqual(result.removedPlans, [])
  assert.deepEqual(result.keptPlans, ['.plan/001-a.md', '.plan/010-b.md'])
  assert.deepEqual(readdirSync(path.join(root, '.plan')).sort(), [
    '000-backlog.md',
    '001-a.md',
    '010-b.md',
    'notes.md',
  ])
})

test('resolveAuthMarkers throws on a misspelled or misplaced marker', () => {
  for (const text of [
    'a <!--auth-->',
    'a <!-- auth --> trailing words',
    '<!-- authh -->',
    '<!--noauth: x -->',
    '<!--auth-start-->',
  ]) {
    assert.throws(() => resolveAuthMarkers(text, true), /auth marker|auth-start/, text)
    assert.throws(() => resolveAuthMarkers(text, false), /auth marker|auth-start/, text)
  }
})

test('resolveAuthMarkers takes an inline marker only at the end of the content', () => {
  assert.equal(resolveAuthMarkers('| r | c <!-- auth -->  ', true), '| r | c  ')
  assert.equal(resolveAuthMarkers('| r | c <!-- auth --> |  ', true), '| r | c |  ')
  assert.equal(resolveAuthMarkers('x <!-- auth -->  \ny', false), 'y')
})

test('clearHarnessHistory touches nothing when a marker is malformed', () => {
  const root = tempRoot()
  seed(root)
  writeFileSync(path.join(root, '.doc', 'architecture.md'), '<!-- auth-start -->\nx\n')
  const glossary = readFileSync(path.join(root, '.doc', 'glossary.md'), 'utf8')
  assert.throws(() => clearHarnessHistory(root, { auth: false }), /auth-start/)
  assert.ok(existsSync(path.join(root, '.plan', '001-a.md')))
  assert.equal(readFileSync(path.join(root, '.doc', 'glossary.md'), 'utf8'), glossary)
})

test('resolveAuthMarkers throws on a stray end and on a nested start', () => {
  assert.throws(() => resolveAuthMarkers('x\n<!-- auth-end -->\n', true), /auth-end/)
  const nested = '<!-- auth-start -->\n<!-- auth-start -->\n<!-- auth-end -->\n'
  assert.throws(() => resolveAuthMarkers(nested, true), /auth-start/)
})

test('resolveAuthMarkers handles an arrow in noauth text and no final newline', () => {
  assert.equal(resolveAuthMarkers('<!-- noauth: a --> b -->', false), 'a --> b')
  assert.equal(resolveAuthMarkers('a\n<!-- noauth: b -->', false), 'a\nb')
  assert.equal(resolveAuthMarkers('a\n| r | c <!-- auth --> |', true), 'a\n| r | c |')
})
