// Payload matrix: every case in cases.json is fed to its hook exactly as Claude Code would
// feed it, and the exit code is asserted. Cases marked `deferred` are skipped with the
// reason shown, so the suite stays green while the debt stays visible in the skip count.
//
// Routing is honoured: a hook only runs for the tools its settings.json matcher names. A
// case whose tool_name the matcher does not cover is asserted against "hook not invoked"
// (exit 0), so a case cannot go green by feeding a hook a payload it would never see.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { test } from 'node:test'

import { HOOKS, REPO_ROOT, TESTS_DIR, runHook } from './run-hook.mjs'

const { cases } = JSON.parse(fs.readFileSync(path.join(TESTS_DIR, 'cases.json'), 'utf8'))

const ROOT = REPO_ROOT.split(path.sep).join('/')
const HOME = os.homedir().split(path.sep).join('/')

const fill = value =>
  value.replaceAll('{{root}}', ROOT).replaceAll('{{root-upper}}', ROOT.toUpperCase()).replaceAll('{{home}}', HOME)
const fillDeep = value =>
  typeof value === 'string' ? fill(value)
  : Array.isArray(value) ? value.map(fillDeep)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, fillDeep(inner)]))
    : value

const verdictOf = c => (typeof c.expect === 'string' ? c.expect : (c.expect[process.platform] ?? c.expect.default))
const exitFor = verdict => (verdict === 'block' ? 2 : 0)

// hook key -> matcher string, read from the live wiring so the matrix cannot drift from it.
const MATCHERS = readMatchers()

function readMatchers() {
  const settings = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude', 'settings.json'), 'utf8'))
  const byFile = {}
  for (const group of settings.hooks?.PreToolUse ?? []) {
    for (const hook of group.hooks ?? []) {
      const file = path.basename(hook.args?.[0] ?? hook.command ?? '')
      byFile[file] = group.matcher ?? '*'
    }
  }
  return Object.fromEntries(Object.entries(HOOKS).map(([key, file]) => [key, byFile[path.basename(file)] ?? null]))
}

function toolMatches(matcher, toolName) {
  if (matcher === '*' || matcher === '' || matcher === undefined) return true
  return matcher.split('|').includes(toolName)
}

test('cases.json is well-formed', () => {
  const names = new Set()
  for (const c of cases) {
    assert.ok(!names.has(c.name), `duplicate case name ${c.name}`)
    names.add(c.name)
    assert.ok(c.hook in HOOKS, `${c.name}: unknown hook ${c.hook}`)
    assert.ok(['block', 'allow'].includes(verdictOf(c)), `${c.name}: bad expect`)
    assert.ok(c.raw !== undefined || (typeof c.tool_name === 'string' && c.tool_input && typeof c.tool_input === 'object'),
      `${c.name}: needs raw, or tool_name + tool_input`)
  }
})

test('every hook under test is wired in settings.json', () => {
  for (const [key, matcher] of Object.entries(MATCHERS)) assert.ok(matcher !== null, `${key} hook is not wired`)
})

for (const c of cases) {
  const verdict = verdictOf(c)
  test(`${c.name} [${c.hook}] → ${verdict}`, t => {
    if (c.deferred) return t.skip(`deferred: ${c.deferred}`)

    const invoked = c.raw !== undefined || toolMatches(MATCHERS[c.hook], c.tool_name)
    if (!invoked) {
      assert.equal(exitFor(verdict), 0,
        `${c.hook} hook is wired for "${MATCHERS[c.hook]}", so Claude Code never invokes it for ${c.tool_name}: the effective result is allow`)
      return
    }

    const body = c.raw !== undefined
      ? c.raw
      : JSON.stringify(fillDeep({
        session_id: 'test',
        hook_event_name: 'PreToolUse',
        tool_name: c.tool_name,
        tool_input: c.tool_input,
        cwd: c.cwd ?? '{{root}}',
        ...(c.agent_type !== undefined ? { agent_type: c.agent_type } : {})
      }))

    const r = runHook(HOOKS[c.hook], body, { env: fillDeep(c.env ?? {}) })
    assert.equal(r.status, exitFor(verdict), `exit ${r.status}: ${r.error?.message ?? r.stderr}`)
    assert.equal(r.stdout, '', 'hooks never write stdout (stdout JSON could auto-approve the call)')
    if (verdict === 'block') {
      assert.match(r.stderr, /^\[guardrail\]/, 'block must explain itself on stderr')
      assert.doesNotMatch(r.stderr, /hook crashed/, 'a crash is not a verdict; the rule must block on purpose')
    } else {
      assert.equal(r.stderr, '', 'allow must be silent')
    }
    for (const forbidden of fillDeep(c.forbid_in_stderr ?? [])) {
      assert.ok(!r.stderr.includes(forbidden), `stderr must not contain "${forbidden}": ${r.stderr}`)
    }
  })
}

test('matrix summary', t => {
  const deferred = cases.filter(c => c.deferred)
  const byReason = {}
  for (const c of deferred) byReason[c.deferred] = (byReason[c.deferred] ?? 0) + 1
  t.diagnostic(`matrix: ${cases.length} cases, ${deferred.length} deferred`)
  for (const [reason, n] of Object.entries(byReason)) t.diagnostic(`  deferred ${n}: ${reason}`)
})
