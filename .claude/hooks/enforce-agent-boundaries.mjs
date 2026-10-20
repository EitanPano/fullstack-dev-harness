#!/usr/bin/env node
// PreToolUse guardrail on Edit|Write|MultiEdit|NotebookEdit: keeps each role agent inside
// its write lane. The prompts in .claude/agents/*.md only *ask* an agent to stay in its lane;
// this hook is what makes that hold, in every permission mode.
//
// How the role arrives: inside a sub-agent, Claude Code puts the agent's frontmatter `name`
// in every hook payload as `agent_type`. `AGENT_ROLE` in the environment is an override for
// a headless driver that spawns one `claude -p` per role; `agent_type` wins when both are
// present. No role at all (the interactive main session) means this hook has nothing to say.
//
// Fail closed: a role that is set but has no lane here cannot Edit/Write at all. That is the
// point: a renamed agent or a typo must surface as a block, never as silent freedom. To admit
// a new agent type, add a lane below; `'*'` means unrestricted.
//
// WRITE_LANES is the single owner of "which role may write where". The agent prompts repeat
// the lanes in prose for the agent's benefit; if they ever disagree, this table wins.
import process from 'node:process'

import {
  allow,
  block,
  isCanonicalPath,
  projectRoot,
  readPayload,
  sessionCwd,
  toProjectRelative
} from './lib/guardrail.mjs'

// A lane ending in `/` is a directory prefix; anything else is one exact file.
const WRITE_LANES = {
  frontend: ['frontend/', '.orchestrate/api-contract.yaml', '.orchestrate/frontend-agent-report.md'],
  backend: ['backend/', '.orchestrate/backend-agent-report.md'],
  // QA writes its report plus tests: it may add coverage but never feature source.
  qa: ['.orchestrate/qa-report.md', 'frontend/tests/', 'frontend/e2e/', 'tests/'],
  // The orchestrator plans; it never touches application code.
  orchestrator: ['.plan/']
}

// Windows file systems are case-insensitive, so FRONTEND/ is frontend/ there and nowhere else.
const fold = process.platform === 'win32' ? value => value.toLowerCase() : value => value

const payload = await readPayload()

const role = resolveRole(payload)
if (role === null) allow() // interactive session: not this hook's job

const lanes = Object.hasOwn(WRITE_LANES, role) ? WRITE_LANES[role] : undefined
if (lanes === undefined) {
  block(
    `agent type "${role}" has no write lane in .claude/hooks/enforce-agent-boundaries.mjs; ` +
    'add one before this agent may Edit/Write'
  )
}
if (lanes === '*') allow()

const rawPath = firstString(payload.tool_input.file_path, payload.tool_input.notebook_path)
if (rawPath.trim() === '') block('write with an empty path blocked')
if (!isCanonicalPath(rawPath)) {
  block(
    `"${role}" used a path spelling the runtime rewrites (surrounding whitespace, a leading ~, ` +
    `or a /drive/ prefix): "${rawPath}". Spell the path plainly.`
  )
}

const root = projectRoot(payload)
const { rel, escapes } = toProjectRelative(rawPath, root, sessionCwd(payload) ?? root)
if (escapes || !lanes.some(lane => matchesLane(rel, lane))) {
  block(`"${role}" may not write "${rel || rawPath}". Allowed: ${lanes.join(', ')}`)
}

allow()

function resolveRole(payload) {
  for (const candidate of [payload.agent_type, process.env.AGENT_ROLE]) {
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return null
}

function firstString(...values) {
  return values.find(value => typeof value === 'string') ?? ''
}

function matchesLane(rel, lane) {
  return lane.endsWith('/') ? fold(rel).startsWith(fold(lane)) : fold(rel) === fold(lane)
}
