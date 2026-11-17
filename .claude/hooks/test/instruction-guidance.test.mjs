// The instruction-guidance gate: the first Edit or Write of an instruction file in a session is
// refused with the guidance text, the retry passes. It is not a guardrail, so every state it
// cannot read allows the call.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { isInstructionFile } from '../lib/instruction-scope.mjs'
import {
  BOUNDARIES_HOOK,
  GUIDANCE_HOOK,
  ROOT,
  guidancePayload,
  runGuidance,
  runHook
} from './harness.mjs'

const TEXT = '# Instruction files\n\nGUIDANCE-BODY-FOR-THE-TEST\n'
let base
let root
let tmp

afterEach(() => fs.rmSync(base, { recursive: true, force: true }))
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'guidance-test-'))
  root = path.join(base, 'project')
  tmp = path.join(base, 'tmp')
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(tmp)
  fs.writeFileSync(path.join(root, '.claude', 'instruction-files.md'), TEXT)
})

const call = (rel, options = {}) =>
  runGuidance(guidancePayload(path.join(root, rel), options), { root, tmp })
// One directory per user: the temp directory is shared on a multi-user Linux host.
const markerDir = () => path.join(tmp, `instruction-guidance-${os.userInfo().uid}`)
const markers = () => (fs.existsSync(markerDir()) ? fs.readdirSync(markerDir()) : [])
// Moves every marker's refusals out of the batch gap.
const ageMarkers = () => {
  for (const name of markers()) fs.writeFileSync(path.join(markerDir(), name), '1 1')
}
const context = result => JSON.parse(result.stdout).hookSpecificOutput.additionalContext

describe('scope', () => {
  const inScope = [
    'AGENTS.md',
    'CLAUDE.md',
    'frontend/AGENTS.md',
    'serverless/cloudflare/AGENTS.md',
    '.claude/README.md',
    '.claude/agents/backend.md',
    '.claude/skills/new/SKILL.md',
    '.claude/instruction-files.md',
    '.doc/glossary.md',
    '.github/copilot-instructions.md',
    '.claude/worktrees/x/AGENTS.md',
    '.claude\\agents\\backend.md'
  ]
  const outOfScope = [
    'README.md',
    'CONTRIBUTING.md',
    '.plan/000-backlog.md',
    '.orchestrate/x/backend.md',
    '.orchestrate/README.md',
    '.claude/skills/bootstrap-project/readme-template.md',
    'frontend/README.md',
    'frontend/node_modules/p/AGENTS.md',
    'src/x.ts',
    '.claude/settings.json',
    '.cursor/rules/index.mdc',
    '.claude/worktrees/x/README.md',
    '.claude/worktrees/x/.plan/001-x.md'
  ]
  for (const file of inScope) test(`in: ${file}`, () => assert.equal(isInstructionFile(file), true))
  for (const file of outOfScope) {
    test(`out: ${file}`, () => assert.equal(isInstructionFile(file), false))
  }
  test('folds letter case on Windows only', () => {
    assert.equal(isInstructionFile('.Claude/Agents/Backend.MD'), process.platform === 'win32')
  })
})

describe('first call', () => {
  const first = ['AGENTS.md', '.claude/agents/backend.md', '.doc/glossary.md', 'frontend/AGENTS.md']
  for (const file of first) {
    test(`T1 refuses ${file} with the guidance text`, () => {
      const result = call(file)
      assert.equal(result.status, 2)
      assert.match(result.stderr, /^\[instruction-guidance\] /)
      assert.ok(result.stderr.includes(file), result.stderr)
      assert.match(result.stderr, /not a guardrail refusal/)
      assert.ok(result.stderr.includes(TEXT.trim()))
      assert.match(result.stderr, /Now make the same call again\.\s*$/)
    })
  }
  test('T1 refuses a Write as it does an Edit', () => {
    assert.equal(call('AGENTS.md', { tool: 'Write' }).status, 2)
  })
  test('T1 shows the text of the real guidance file', () => {
    const real = fs.readFileSync(path.join(ROOT, '.claude', 'instruction-files.md'), 'utf8')
    const result = runGuidance(guidancePayload(path.join(ROOT, 'AGENTS.md')), { tmp })
    assert.equal(result.status, 2)
    assert.ok(result.stderr.includes(real.trim()))
  })
  const out = [
    'README.md',
    'CONTRIBUTING.md',
    '.plan/000-backlog.md',
    '.orchestrate/x/backend.md',
    '.claude/skills/bootstrap-project/readme-template.md',
    'frontend/README.md',
    'frontend/node_modules/p/AGENTS.md',
    'src/x.ts',
    '../outside/AGENTS.md'
  ]
  for (const file of out) {
    test(`T2 allows ${file} and writes no marker`, () => {
      const result = call(file)
      assert.equal(result.status, 0, result.stderr)
      assert.deepEqual(markers(), [])
    })
  }
  for (const file of ['.claude/skills/new/SKILL.md', '.claude/rules/new.md']) {
    test(`T3 refuses a file that does not exist yet: ${file}`, () => {
      assert.equal(call(file).status, 2)
    })
  }
  test('T2 allows a tool that is neither Edit nor Write', () => {
    assert.equal(call('AGENTS.md', { tool: 'Read' }).status, 0)
    assert.equal(call('AGENTS.md', { tool: 'NotebookEdit' }).status, 0)
  })
  test('T10 reads backslash separators and, on Windows, another letter case', () => {
    const file = path.join(root, '.claude', 'agents', 'backend.md')
    const spelled = process.platform === 'win32' ? file.replaceAll('/', '\\').toUpperCase() : file
    assert.equal(runGuidance(guidancePayload(spelled), { root, tmp }).status, 2)
  })
  test('T11 classifies a worktree path by the rest of the path', () => {
    assert.equal(call('.claude/worktrees/x/AGENTS.md').status, 2)
    assert.equal(call('.claude/worktrees/x/README.md', { session: 'other' }).status, 0)
  })
})

describe('later calls', () => {
  test('T4 allows the second call once the batch window has passed', () => {
    assert.equal(call('AGENTS.md').status, 2)
    ageMarkers()
    const result = call('.doc/glossary.md')
    assert.equal(result.status, 0, result.stderr)
  })
  test('T4 refuses a call inside the batch window with one line and no file text', () => {
    assert.equal(call('AGENTS.md').status, 2)
    const result = call('.doc/glossary.md')
    assert.equal(result.status, 2)
    assert.match(result.stderr, /^\[instruction-guidance\] /)
    assert.ok(!result.stderr.includes('GUIDANCE-BODY'))
    assert.equal(result.stderr.trim().split('\n').length, 1)
  })
  // The calls of one turn reach the hook one after another, so the batch is read from the gap
  // to the last refused call, not from a fixed time after the first.
  const setMarker = (firstAgo, lastAgo) => {
    fs.mkdirSync(markerDir(), { recursive: true })
    const now = Date.now()
    fs.writeFileSync(path.join(markerDir(), 'session-1.main'), `${now - firstAgo} ${now - lastAgo}`)
  }
  test('T4 a long batch stays refused while its calls keep coming', () => {
    setMarker(5000, 0)
    assert.equal(call('.doc/glossary.md').status, 2)
    const [, last] = fs.readFileSync(path.join(markerDir(), 'session-1.main'), 'utf8').split(' ')
    assert.ok(Date.now() - Number(last) < 400, 'the refusal moves the gap forward')
  })
  test('T4 a call after the gap passes', () => {
    setMarker(2500, 2000)
    assert.equal(call('.doc/glossary.md').status, 0)
  })
  test('T4 quick retries cannot keep the gate shut past its cap', () => {
    setMarker(11000, 200)
    assert.equal(call('.doc/glossary.md').status, 0)
  })
  test('a marker that cannot be read does not refuse for ever', () => {
    fs.mkdirSync(path.join(markerDir(), 'session-1.main'), { recursive: true })
    assert.equal(call('AGENTS.md').status, 0)
    assert.equal(call('AGENTS.md').status, 0)
  })
  test('a marker from a clock that has since stepped back does not hold the gate shut', () => {
    setMarker(-3600000, -3600000)
    assert.equal(call('AGENTS.md').status, 0)
  })
  test('a marker left empty by a crash does not refuse for ever', () => {
    fs.mkdirSync(markerDir())
    const marker = path.join(markerDir(), 'session-1.main')
    fs.writeFileSync(marker, '')
    const before = new Date(Date.now() - 60 * 1000)
    fs.utimesSync(marker, before, before)
    assert.equal(call('AGENTS.md').status, 0)
  })
  test('T5 gates each sub-agent once, apart from the main session', () => {
    assert.equal(call('AGENTS.md').status, 2)
    ageMarkers()
    assert.equal(call('AGENTS.md').status, 0)
    const first = call('AGENTS.md', { agent: 'agent-a' })
    assert.equal(first.status, 2)
    assert.ok(first.stderr.includes('GUIDANCE-BODY'))
    ageMarkers()
    assert.equal(call('AGENTS.md', { agent: 'agent-a' }).status, 0)
    assert.ok(call('AGENTS.md', { agent: 'agent-b' }).stderr.includes('GUIDANCE-BODY'))
  })
  test('T13 two first calls close together are both refused, one with the text', async () => {
    const hook = path.join(ROOT, '.claude', 'hooks', GUIDANCE_HOOK)
    const env = { ...process.env, CLAUDE_PROJECT_DIR: root, TEMP: tmp, TMP: tmp, TMPDIR: tmp }
    const input = JSON.stringify(guidancePayload(path.join(root, 'AGENTS.md')))
    const one = () =>
      new Promise(resolve => {
        const child = spawn('node', [hook], { env })
        let stderr = ''
        child.stderr.on('data', chunk => (stderr += chunk))
        child.on('close', status => resolve({ status, stderr }))
        child.stdin.end(input)
      })
    const results = await Promise.all([one(), one()])
    assert.deepEqual(
      results.map(r => r.status),
      [2, 2]
    )
    assert.equal(results.filter(r => r.stderr.includes('GUIDANCE-BODY')).length, 1)
  })
  test('T14 refuses beside the lane hook and still writes its marker', () => {
    const file = path.join(ROOT, '.claude', 'agents', 'backend.md')
    const payload = guidancePayload(file, { agent: 'agent-a', role: 'backend' })
    assert.equal(runHook(BOUNDARIES_HOOK, payload).status, 2)
    assert.equal(runGuidance(payload, { tmp }).status, 2)
    assert.equal(markers().length, 1)
  })
})

describe('states that allow the call', () => {
  test('T6 allows with the pointer when the session has no id', () => {
    const payload = guidancePayload(path.join(root, 'AGENTS.md'))
    delete payload.session_id
    const result = runGuidance(payload, { root, tmp })
    assert.equal(result.status, 0, result.stderr)
    assert.match(context(result), /\.claude\/instruction-files\.md/)
  })
  test('T6 allows with the pointer when the session id has no usable character', () => {
    const result = call('AGENTS.md', { session: '///' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(context(result), /\.claude\/instruction-files\.md/)
    assert.deepEqual(markers(), [])
  })
  test('T6 allows with the pointer when the marker directory is a file', () => {
    fs.writeFileSync(markerDir(), '')
    const result = call('AGENTS.md')
    assert.equal(result.status, 0, result.stderr)
    assert.match(context(result), /\.claude\/instruction-files\.md/)
  })
  test('T6 allows with the pointer when the marker cannot be written', () => {
    const blocked = path.join(tmp, 'a-file')
    fs.writeFileSync(blocked, '')
    const payload = guidancePayload(path.join(root, 'AGENTS.md'))
    const result = runGuidance(payload, { root, tmp: path.join(blocked, 'under') })
    assert.equal(result.status, 0, result.stderr)
    assert.match(context(result), /\.claude\/instruction-files\.md/)
  })
  for (const file of ['AGENTS.md', '.claude/instruction-files.md']) {
    test(`T7 allows ${file} when the guidance file is missing, with no marker`, () => {
      fs.rmSync(path.join(root, '.claude', 'instruction-files.md'))
      const result = call(file, { tool: 'Write' })
      assert.equal(result.status, 0, result.stderr)
      assert.match(JSON.parse(result.stdout).systemMessage, /instruction-files\.md/)
      assert.deepEqual(markers(), [])
    })
  }
  test('T7 allows when the guidance file is empty', () => {
    fs.writeFileSync(path.join(root, '.claude', 'instruction-files.md'), ' \n')
    assert.equal(call('AGENTS.md').status, 0)
    assert.deepEqual(markers(), [])
  })
  const raw = {
    'empty stdin': '',
    'invalid JSON': '{ not json',
    'an array': '[]',
    'no tool_input': JSON.stringify({ tool_name: 'Edit', session_id: 's' }),
    'a file_path that is no string': JSON.stringify({
      tool_name: 'Edit',
      session_id: 's',
      tool_input: { file_path: 7 }
    })
  }
  for (const [name, input] of Object.entries(raw)) {
    test(`T8 allows ${name}`, () => {
      assert.equal(runGuidance(null, { root, tmp, input }).status, 0)
    })
  }
  test("T9 allows the update probe's three payloads", () => {
    const readme = path.join(ROOT, 'README.md')
    const probes = [
      { tool_name: 'Read', tool_input: { file_path: readme } },
      { tool_name: 'Bash', tool_input: { command: 'git status' } },
      { tool_name: 'Edit', tool_input: { file_path: readme, old_string: 'a', new_string: 'b' } }
    ]
    for (const probe of probes) assert.equal(runGuidance(probe, { tmp }).status, 0)
  })
})

describe('--reset', () => {
  const reset = input =>
    runGuidance(
      { session_id: 'session-1', hook_event_name: 'SessionStart' },
      { root, tmp, args: ['--reset'], input }
    )
  test("T12 removes this session's markers only", () => {
    call('AGENTS.md')
    call('AGENTS.md', { agent: 'agent-a' })
    call('AGENTS.md', { session: 'session-2' })
    assert.equal(markers().length, 3)
    assert.equal(reset().status, 0)
    assert.equal(markers().length, 1)
    ageMarkers()
    assert.equal(call('AGENTS.md', { session: 'session-2' }).status, 0)
    assert.equal(call('AGENTS.md').status, 2)
  })
  test('T12 exits 0 on any input', () => {
    assert.equal(reset('').status, 0)
    assert.equal(reset('{ not json').status, 0)
    assert.equal(reset(JSON.stringify({ tool_name: 'Edit' })).status, 0)
  })
})

test('prunes markers older than seven days on a refusal', () => {
  fs.mkdirSync(path.join(markerDir(), 'a-directory.main'), { recursive: true })
  const old = path.join(markerDir(), 'old-session.main')
  fs.writeFileSync(old, '1')
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
  fs.utimesSync(old, eightDaysAgo, eightDaysAgo)
  fs.utimesSync(path.join(markerDir(), 'a-directory.main'), eightDaysAgo, eightDaysAgo)
  assert.equal(call('AGENTS.md').status, 2)
  assert.equal(markers().includes('old-session.main'), false)
})
