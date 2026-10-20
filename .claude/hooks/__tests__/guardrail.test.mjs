// Contract tests for .claude/hooks/lib/guardrail.mjs — the fail-closed stdin contract every
// hook shares, and the path normalisation the boundary hook relies on.
import assert from 'node:assert/strict'
import path from 'node:path'
import process from 'node:process'
import { test } from 'node:test'

import { isCanonicalPath, sessionCwd, toProjectRelative } from '../lib/guardrail.mjs'
import { REPO_ROOT, TESTS_DIR, runHook } from './run-hook.mjs'

const ECHO = path.join(TESTS_DIR, 'fixtures', 'echo-hook.mjs')
const CRASH = path.join(TESTS_DIR, 'fixtures', 'crash-hook.mjs')
const REJECT = path.join(TESTS_DIR, 'fixtures', 'reject-hook.mjs')
const OK_PAYLOAD = { tool_name: 'Write', tool_input: { file_path: 'x' } }

test('a hook that throws after readPayload exits 2 and says it crashed', () => {
  const r = runHook(CRASH, OK_PAYLOAD)
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /^\[guardrail\] hook crashed/)
  assert.match(r.stderr, /boom from fixture/)
  assert.equal(r.stdout, '')
})

test('a hook with an unhandled rejection after readPayload exits 2', () => {
  const r = runHook(REJECT, OK_PAYLOAD)
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /^\[guardrail\] hook crashed/)
  assert.equal(r.stdout, '')
})

test('every hook run writes nothing to stdout (stdout JSON could auto-approve a call)', () => {
  for (const payload of ['', '{not json', OK_PAYLOAD]) {
    assert.equal(runHook(ECHO, payload).stdout, '')
  }
})

test('toProjectRelative: a relative path resolves against the given base, not the root', () => {
  const base = path.join(REPO_ROOT, 'backend')
  assert.deepEqual(toProjectRelative('frontend/x.ts', REPO_ROOT, base), {
    rel: 'backend/frontend/x.ts',
    escapes: false
  })
})

test('sessionCwd: returns payload.cwd only when it is an absolute path', () => {
  assert.equal(sessionCwd({ cwd: REPO_ROOT }), REPO_ROOT)
  assert.equal(sessionCwd({ cwd: 'relative/dir' }), null)
  assert.equal(sessionCwd({}), null)
  assert.equal(sessionCwd({ cwd: 42 }), null)
})

test('isCanonicalPath: rejects the spellings Claude Code rewrites before use', () => {
  assert.equal(isCanonicalPath(' frontend/x.ts'), false, 'leading whitespace')
  assert.equal(isCanonicalPath('frontend/x.ts '), false, 'trailing whitespace')
  assert.equal(isCanonicalPath('\tfrontend/x.ts'), false, 'leading tab')
  assert.equal(isCanonicalPath('~/x.ts'), false, 'home expansion')
  assert.equal(isCanonicalPath('~'), false, 'bare home')
  assert.equal(isCanonicalPath('/c/x.ts'), process.platform !== 'win32', 'msys drive form is rewritten only on win32')
})

test('isCanonicalPath: accepts plain relative, absolute and dot paths', () => {
  // `/usr/...` not `/x/...`: a single-letter first segment is the drive form on Windows.
  for (const p of ['frontend/x.ts', './frontend/x.ts', 'C:/x/y.ts', '/usr/y.ts', '../x.ts', 'x']) {
    assert.equal(isCanonicalPath(p), true, p)
  }
})

test('readPayload: empty stdin blocks with a [guardrail] message', () => {
  const r = runHook(ECHO, '')
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /^\[guardrail\]/)
})

test('readPayload: invalid JSON blocks', () => {
  const r = runHook(ECHO, '{not json')
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /^\[guardrail\]/)
})

test('readPayload: a JSON array is not a payload and blocks', () => {
  const r = runHook(ECHO, '[]')
  assert.equal(r.status, 2, r.stderr)
})

test('readPayload: missing tool_input blocks', () => {
  const r = runHook(ECHO, { tool_name: 'Bash' })
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /tool_input/)
})

test('readPayload: tool_input that is not an object blocks', () => {
  const r = runHook(ECHO, { tool_name: 'Bash', tool_input: 'x' })
  assert.equal(r.status, 2, r.stderr)
})

test('readPayload: empty tool_input object is a valid payload and allows', () => {
  const r = runHook(ECHO, { tool_name: 'ListAgents', tool_input: {} })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stderr, '')
})

test('readPayload: ordinary payload allows', () => {
  const r = runHook(ECHO, { tool_name: 'Glob', tool_input: { pattern: '**/*.ts' }, cwd: 'x' })
  assert.equal(r.status, 0, r.stderr)
})

test('toProjectRelative: traversal inside the repo normalises to the real target', () => {
  assert.deepEqual(toProjectRelative('frontend/../backend/x.ts', REPO_ROOT), {
    rel: 'backend/x.ts',
    escapes: false
  })
})

test('toProjectRelative: ./ prefix is stripped', () => {
  assert.deepEqual(toProjectRelative('./frontend/src/x.ts', REPO_ROOT), {
    rel: 'frontend/src/x.ts',
    escapes: false
  })
})

test('toProjectRelative: parent traversal out of the repo escapes', () => {
  const r = toProjectRelative('../x.ts', REPO_ROOT)
  assert.equal(r.escapes, true)
  assert.ok(r.rel.startsWith('../'), r.rel)
})

test('toProjectRelative: the repo root itself escapes (never a writable target)', () => {
  assert.deepEqual(toProjectRelative(REPO_ROOT, REPO_ROOT), { rel: '', escapes: true })
})

test('toProjectRelative: absolute path inside the repo is made relative', () => {
  const abs = path.join(REPO_ROOT, 'frontend', 'a.ts')
  assert.deepEqual(toProjectRelative(abs, REPO_ROOT), { rel: 'frontend/a.ts', escapes: false })
})

test('toProjectRelative: absolute path outside the repo escapes', () => {
  const abs = path.resolve(REPO_ROOT, '..', 'elsewhere', 'x.ts')
  const r = toProjectRelative(abs, REPO_ROOT)
  assert.equal(r.escapes, true)
})

test('toProjectRelative: always returns forward slashes', () => {
  const r = toProjectRelative(path.join('frontend', 'src', 'x.ts'), REPO_ROOT)
  assert.equal(r.rel, 'frontend/src/x.ts')
})
