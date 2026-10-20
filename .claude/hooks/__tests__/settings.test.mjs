// Wiring invariants for .claude/settings.json — the only place Claude Code reads hook config
// from (AGENTS.md: "a hook script that is not listed there never runs"). These tests fail
// before a misconfigured entry can lock or silently disarm a session.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { HOOKS_DIR, REPO_ROOT } from './run-hook.mjs'

const SETTINGS_PATH = path.join(REPO_ROOT, '.claude', 'settings.json')
const PLACEHOLDER = '${CLAUDE_PROJECT_DIR}/.claude/hooks/'

const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
const entries = (settings.hooks?.PreToolUse ?? []).flatMap(group =>
  (group.hooks ?? []).map(hook => ({ matcher: group.matcher, ...hook }))
)
const wiredFile = entry => (typeof entry.args?.[0] === 'string' && entry.args[0].startsWith(PLACEHOLDER)
  ? entry.args[0].slice(PLACEHOLDER.length)
  : null)

const EXPECTED_MATCHERS = {
  'block-secret-file-access.mjs': '*',
  'block-destructive-bash.mjs': 'Bash|PowerShell',
  'enforce-agent-boundaries.mjs': 'Edit|Write|MultiEdit|NotebookEdit'
}

test('settings.json wires PreToolUse hooks', () => {
  assert.ok(entries.length >= 3, `expected at least 3 hook entries, found ${entries.length}`)
})

test('every hook entry is exec form (node + args), fails closed, and has a timeout', () => {
  for (const entry of entries) {
    const label = `${entry.matcher}: ${entry.command} ${JSON.stringify(entry.args ?? '')}`
    assert.equal(entry.type, 'command', label)
    assert.equal(entry.command, 'node', `${label}: exec form needs a bare executable name`)
    assert.ok(Array.isArray(entry.args) && entry.args.length === 1, `${label}: args must be [hookPath]`)
    assert.ok(entry.args[0].startsWith(PLACEHOLDER), `${label}: hook path must start with ${PLACEHOLDER}`)
    assert.equal(entry.onFailure, 'block', `${label}: a hook that cannot run must block`)
    assert.equal(typeof entry.timeout, 'number', `${label}: timeout (seconds) must be set`)
  }
})

test('every wired hook file exists', () => {
  for (const entry of entries) {
    const file = wiredFile(entry)
    assert.ok(file !== null, `unparseable hook path in entry for matcher ${entry.matcher}`)
    assert.ok(fs.existsSync(path.join(HOOKS_DIR, file)), `${entry.args[0]} does not exist`)
  }
})

test('every hook file in .claude/hooks/ is wired exactly once', () => {
  const hookFiles = fs.readdirSync(HOOKS_DIR, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.mjs'))
    .map(d => d.name)
  const wired = entries.map(wiredFile)
  for (const file of hookFiles) {
    const n = wired.filter(w => w === file).length
    assert.equal(n, 1, `${file} is wired ${n} times (AGENTS.md: an unlisted hook never runs)`)
  }
})

test('each guardrail hook is on its intended matcher', () => {
  for (const [file, matcher] of Object.entries(EXPECTED_MATCHERS)) {
    const entry = entries.find(e => wiredFile(e) === file)
    assert.ok(entry, `${file} is not wired`)
    assert.equal(entry.matcher, matcher, `${file} matcher`)
  }
})

test('no legacy .js hooks remain next to the .mjs ones', () => {
  const legacy = fs.readdirSync(HOOKS_DIR).filter(f => f.endsWith('.js'))
  assert.deepEqual(legacy, [], 'rename or delete these so only one copy of each guardrail exists')
})

test('every wired hook file starts with a node shebang (POSIX clones can run it directly)', () => {
  for (const entry of entries) {
    const file = wiredFile(entry)
    const firstLine = fs.readFileSync(path.join(HOOKS_DIR, file), 'utf8').split('\n', 1)[0]
    assert.equal(firstLine, '#!/usr/bin/env node', `${file}: first line`)
  }
})
