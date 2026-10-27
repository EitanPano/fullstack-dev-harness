import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePlan } from '../verify.mjs'
import { diffChecks } from './checks.mjs'
import { securityPaths } from './security.mjs'
import { parseSummary } from './summary.mjs'

test('bun test summary', () => {
  const out = ' 12 pass\n 1 skip\n 2 fail\nRan 15 tests across 3 files.'
  assert.deepEqual(parseSummary(out), { passed: 12, failed: 2, skipped: 1, flaky: 0 })
})

test('Vitest summary, with colour codes', () => {
  const out = ' Test Files  1 failed (1)\n\u001b[2m      Tests \u001b[22m 3 failed | 5 passed | 1 skipped (9)'
  assert.deepEqual(parseSummary(out), { passed: 5, failed: 3, skipped: 1, flaky: 0 })
})

test('Playwright summary with a flaky test', () => {
  const out = '  1 flaky\n    [chromium] › a.spec.ts:3\n  1 skipped\n  8 passed (12.3s)'
  assert.deepEqual(parseSummary(out), { passed: 8, failed: 0, skipped: 1, flaky: 1 })
})

test('pytest summary counts xfailed as skipped and errors as failed', () => {
  const out = '=== 1 failed, 5 passed, 2 skipped, 1 xfailed, 1 error in 0.42s ==='
  assert.deepEqual(parseSummary(out), { passed: 5, failed: 2, skipped: 3, flaky: 0 })
})

test('output with no summary counts nothing', () => {
  assert.deepEqual(parseSummary('compiled 3 files'), { passed: 0, failed: 0, skipped: 0, flaky: 0 })
})

const added = (file, text) => ({ file, line: 1, text })
const names = (list) => list.filter((entry) => !entry.ok).map((entry) => entry.name)

test('every forbidden spelling is found in a code file', () => {
  const spellings = [
    'it.only(',
    'describe.skip(',
    'it.todo(',
    'test.fixme(',
    'xit(',
    'xdescribe(',
    '@pytest.mark.skip',
    '@pytest.mark.skipif(x)',
    '@pytest.mark.xfail',
    'pytest.skip("x")',
  ]
  for (const text of spellings) {
    assert.deepEqual(names(diffChecks([added('a.test.ts', text)])), ['no-focused-or-skipped-test'])
  }
})

test('prose and other file types are not read, an ordinary line passes', () => {
  assert.deepEqual(names(diffChecks([added('.plan/001.md', 'no `.only(` allowed')])), [])
  assert.deepEqual(names(diffChecks([added('a.ts', 'const skipped = items.filter(x)')])), [])
})

test('.exclude( counts only in an e2e spec', () => {
  assert.deepEqual(names(diffChecks([added('frontend/e2e/a.spec.ts', 'axe.exclude(".x")')])), [
    'no-axe-exclude',
  ])
  assert.deepEqual(names(diffChecks([added('frontend/src/list.ts', 'set.exclude(1)')])), [])
})

test('the detail lists file, line and text, capped at ten', () => {
  const many = Array.from({ length: 12 }, (_, line) => ({ file: 'a.test.ts', line, text: 'it.only(' }))
  const [check] = diffChecks(many)
  assert.equal(check.ok, false)
  assert.match(check.detail, /a\.test\.ts:0 it\.only\(/)
  assert.match(check.detail, /and 2 more$/)
})

test('.each variants and fit/fdescribe are found', () => {
  for (const text of ['it.only.each([1])(', 'describe.skip.each([1])(', 'fit("x", f)', 'fdescribe("x", f)']) {
    assert.deepEqual(names(diffChecks([added('a.test.ts', text)])), ['no-focused-or-skipped-test'])
  }
})

test('.exclude( counts in any *.spec.* file as well as in an e2e folder', () => {
  assert.deepEqual(names(diffChecks([added('tests/a11y.spec.ts', 'axe.exclude(".x")')])), [
    'no-axe-exclude',
  ])
  assert.deepEqual(names(diffChecks([added('src/a11y.test.ts', 'axe.exclude(".x")')])), [])
})

test('fit( and fdescribe( are found only as bare calls', () => {
  for (const text of ['model.fit(x)', 'fitAddon.fit()', 'obj.fdescribe(1)', 'refit(1)', '$fit(1)']) {
    assert.deepEqual(names(diffChecks([added('a.test.ts', text)])), [], text)
  }
  for (const text of ['  fit("x", f)', 'fdescribe("x", f)']) {
    assert.deepEqual(names(diffChecks([added('a.test.ts', text)])), ['no-focused-or-skipped-test'])
  }
})

test('the skip spellings apply to test paths only', () => {
  assert.deepEqual(names(diffChecks([added('src/page.ts', 'cursor.skip(n)')])), [])
  assert.deepEqual(names(diffChecks([added('backend/src/q.py', 'q.todo(1)')])), [])
  const paths = [
    'tests/a.ts',
    'src/__tests__/a.ts',
    'frontend/e2e/a.ts',
    'a.test.ts',
    'a.spec.tsx',
    'backend/test_a.py',
    'backend/a_test.py',
    'backend/conftest.py',
  ]
  for (const file of paths) {
    assert.deepEqual(names(diffChecks([added(file, 'cursor.skip(n)')])), ['no-focused-or-skipped-test'], file)
  }
})

test('the conditional and value spellings are found on a test path', () => {
  const spellings = [
    'it.skipIf(win)("x", f)',
    'it.runIf(win)("x", f)',
    'it.todoIf(win)("x", f)',
    'it.failing("x", f)',
    'it.failingIf(win)("x", f)',
    'test.if(win)("x", f)',
    'const t = describe.skip',
    'xtest("x", f)',
  ]
  for (const text of spellings) {
    assert.deepEqual(names(diffChecks([added('a.test.ts', text)])), ['no-focused-or-skipped-test'], text)
  }
  assert.deepEqual(names(diffChecks([added('a.test.ts', 'it("skips nothing", f)')])), [])
})

test('the catalog store seam skipif is exempt, any other skipif is not', () => {
  const seam = 'store_backed = pytest.mark.skipif(not STORE_ENABLED, reason=STORE_SKIP_REASON)'
  assert.deepEqual(names(diffChecks([added('backend/tests/store.py', seam)])), [])
  const other = '@pytest.mark.skipif(True, reason="later")'
  assert.deepEqual(names(diffChecks([added('backend/tests/store.py', other)])), [
    'no-focused-or-skipped-test',
  ])
})

test('the last summary line of a runner wins, even when it reports zero', () => {
  const out = '3 failed attempts\n 12 pass\n 0 fail'
  assert.deepEqual(parseSummary(out), { passed: 12, failed: 0, skipped: 0, flaky: 0 })
})

test('parsePlan reads the first token after Base:', () => {
  const branch = 'Branch: `feat/x`\n'
  assert.equal(parsePlan(`${branch}Base: 6a85649 (dev = main)\n`).base, '6a85649')
  assert.equal(parsePlan(`${branch}Base: \`6a85649\` (dev)\n`).base, '6a85649')
  assert.equal(parsePlan(`${branch}Base: dev (defaced)\n`).base, undefined)
})

test('securityPaths matches the D3 globs with glob semantics', () => {
  const hit = [
    'backend/src/api/auth/routes.ts',
    'frontend/src/shared/auth/session.ts',
    'backend/src/middleware/gate.ts',
    'backend/src/services/security/hash.ts',
    'frontend/src/proxy.ts',
    'backend/db/migrations/001.sql',
    'db/init.sql',
    'backend/Dockerfile',
    'docker-compose.yml',
    'backend/src/config/env.ts',
    'backend/src/app/config/env.py',
    'frontend/src/env.ts',
  ]
  const miss = [
    'backend/src/api/author/routes.ts',
    'backend/src/api/post/controller.ts',
    'frontend/src/feature/post/ui/Card.tsx',
    'backend/docs/docker-compose.yml',
    'backend/src/myproxy.ts',
    'backend/src/authority.ts',
  ]
  assert.deepEqual(securityPaths([...hit, ...miss]), hit)
})
