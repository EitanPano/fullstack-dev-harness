#!/usr/bin/env node
// PreToolUse guardrail on Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell: keeps each role
// agent in its write lane. The role is the payload's `agent_type` (or AGENT_ROLE for a headless
// driver); none means the interactive session, which this hook leaves alone.
// - Fail closed: a role with no lane below cannot Edit/Write, but may run read-only commands.
// - Shell write channels (`>`, `tee`, `cp`, `rm`, `node -e`, git writes, …) are refused for role
//   agents, since only Edit/Write paths map to a lane. Scripts like `bun run format` pass.
// - WRITE_LANES owns who writes where; the agent prompts repeat it and lose on conflict.
import process from 'node:process'

import {
  allow,
  block,
  commandLines,
  commandOf,
  escapeForms,
  inlineCode,
  interpreterViews,
  isCanonicalPath,
  programName,
  projectRoot,
  readPayload,
  readsStdin,
  resolveRole,
  segmentTokens,
  sessionCwd,
  shellSegments,
  toProjectRelative,
  withoutQuotes
} from './lib/guardrail.mjs'

// A lane ending in `/` is a directory prefix; anything else is one exact file.
const WRITE_LANES = {
  // The data-layer task (database skill) adds its Compose service and db/init.sql.
  backend: ['backend/', 'docker-compose.yml', 'db/', '.orchestrate/report/backend.md'],
  frontend: ['frontend/', '.orchestrate/report/frontend.md'],
  // QA may add coverage but never feature source.
  qa: ['.orchestrate/report/qa.md', 'frontend/tests/', 'backend/tests/'],
  // The orchestrator plans and records tickets; it never touches application code.
  orchestrator: ['.plan/', '.orchestrate/ticket/'],
  // Reviewers read everything and write one report.
  reviewer: ['.orchestrate/review/'],
  // Generic implementers (superpowers, ad-hoc dispatch) are not role agents: unrestricted,
  // so a clone works out of the box. Remove this line to force every writer into a lane.
  'general-purpose': '*'
}

const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
// Programs whose purpose is to write, move or delete files.
const WRITE_PROGRAMS = new Set([
  'tee', 'cp', 'mv', 'rsync', 'install', 'ln', 'dd', 'truncate', 'touch', 'patch', 'rm', 'unlink',
  'rmdir', 'rd', 'del', 'erase', 'remove-item', 'ri', 'set-content', 'sc', 'add-content', 'ac',
  'out-file', 'copy-item', 'cpi', 'copy', 'move-item', 'mi', 'move', 'new-item', 'ni', 'rename-item',
  'rni', 'ren', 'rename', 'rimraf'
])
// git subcommands that never change the working tree or the history.
const GIT_READ = new Set([
  'status', 'diff', 'log', 'show', 'ls-files', 'ls-tree', 'rev-parse', 'rev-list', 'blame', 'grep',
  'describe', 'fetch', 'remote', 'shortlog', 'cat-file', 'merge-base', 'name-rev', 'var', 'version', 'help'
])
const GIT_LIST_FLAG = /^(-a|-r|-v|-vv|--list|--show-current|-l|--all|--contains|--merged|--no-merged)$/
// Global options that may precede the subcommand. Any other one is refused, `-c` above all:
// a config override such as core.pager or core.fsmonitor runs a command under a read.
const GIT_GLOBAL_WITH_VALUE = new Set(['-C', '--git-dir', '--work-tree', '--namespace'])
const GIT_GLOBAL_FLAG = /^(--no-pager|-P|--paginate|-p|--literal-pathspecs|--no-optional-locks|--(git-dir|work-tree|namespace)=.+)$/
// A redirection's target ends at whitespace or a shell operator glued to it (`2>&1;`).
// `>&N` duplicates a descriptor only when N stands alone: bash reads `>&1x` as a file name.
const REDIRECT = /(?<![=<\-])(?:\d|&|\*)?>{1,2}\s*(?:&[\d-]+(?=[\s;|&()<>]|$)|[^\s;|&()<>]*)/g
// Redirections that do not write a file.
const HARMLESS_REDIRECT = /^(\d?>&[\d-]+|(\d|&|\*)?>{1,2}\s*(\/dev\/null|\$null|nul))$/i

// Windows file systems are case-insensitive, so FRONTEND/ is frontend/ there and nowhere else.
const fold = process.platform === 'win32' ? value => value.toLowerCase() : value => value

const payload = await readPayload()

const role = resolveRole(payload)
if (role === null) allow() // interactive session: not this hook's job

const lanes = Object.hasOwn(WRITE_LANES, role) ? WRITE_LANES[role] : undefined
if (lanes === '*') allow()

if (SHELL_TOOLS.has(payload.tool_name)) {
  const command = commandOf(payload)
  const channel = shellWriteChannel(command)
  if (channel !== null) {
    block(`"${role}" may not change files through the shell (${channel}). Use the Edit or Write tool; git writes are the driver's job.`)
  }
  allow()
}

if (lanes === undefined) {
  block(
    `agent type "${role}" has no write lane in .claude/hooks/enforce-agent-boundaries.mjs; ` +
      'add one before this agent may Edit/Write'
  )
}

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

// The line and each command string handed to a shell in it (`bash -c "echo 1 > x"`).
function shellWriteChannel(command) {
  for (const line of commandLines(command)) {
    // Redirections are checked on the unquoted text because `>` may be glued to its target;
    // `=>`, `->` and `<>` are not redirections.
    const redirects = withoutQuotes(line).match(REDIRECT) ?? []
    const written = redirects.map(redirect => redirect.trim()).find(r => !HARMLESS_REDIRECT.test(r))
    if (written !== undefined) return `redirect ${written.split(/\s+/)[0]}`
    for (const segment of shellSegments(line)) {
      // As written, and the way bash unescapes a backslash (`t\ee f` is `tee f`).
      for (const unescape of escapeForms(segment)) {
        const channel = segmentWriteChannel(segment, unescape)
        if (channel !== null) return channel
      }
    }
  }
  return null
}

function segmentWriteChannel(segment, unescape) {
  const tokens = segmentTokens(segment, unescape)
  if (tokens.length === 0) return null
  const program = programName(tokens[0])
  const args = tokens.slice(1)
  if (WRITE_PROGRAMS.has(program)) return program
  if (program === 'sed' && args.some(arg => /^-[a-z]*i/i.test(arg) || arg === '--in-place')) return 'sed -i'
  const inline = interpreterChannel(program, args)
  if (inline !== null) return inline
  // A runner's flag table is best effort: an unlisted flag can make its value the apparent
  // program and hide an interpreter behind it. Judge every later interpreter as a program
  // start too, which fails closed.
  for (const view of interpreterViews(segment, unescape)) {
    const hidden = interpreterChannel(programName(view[0]), view.slice(1))
    if (hidden !== null) return hidden
  }
  if (program === 'git') {
    const git = gitCommand(args)
    if (git.option !== undefined) return `git ${git.option}`
    const { sub, rest } = git
    // `git diff --output=<file>` and `git log --output <file>` write despite a read subcommand.
    if (rest.some(arg => /^--output(=|$)/.test(arg))) return `git ${sub} --output`
    const listOnly = rest.every(arg => GIT_LIST_FLAG.test(arg))
    const ok =
      GIT_READ.has(sub) ||
      (sub === 'branch' && listOnly) ||
      (sub === 'tag' && listOnly) ||
      (sub === 'stash' && (rest[0] === 'list' || rest[0] === 'show')) ||
      (sub === 'config' && rest.some(arg => /^(--get|--list|-l)$/.test(arg)))
    if (!ok) return `git ${sub || '(no subcommand)'}`
  }
  return null
}

// Inline code through an interpreter writes anything: `node -e`, `perl -lne`, Python's `-c` or
// an inline module, `deno eval`, or a program read from stdin (a heredoc, a pipe, `-`). Scripts
// run by path (`bun run src/x.ts`, `python run.py -c conf`) are fine.
function interpreterChannel(program, args) {
  if (inlineCode(program, args) !== null || readsStdin(program, args)) {
    return `${program} inline code`
  }
  return null
}

// Skips the global options before the subcommand; `option` names the first one not allowed.
function gitCommand(args) {
  let i = 0
  while (i < args.length && args[i].startsWith('-')) {
    if (args[i] === '--version' || args[i] === '--help') return { sub: 'version', rest: [] }
    if (GIT_GLOBAL_WITH_VALUE.has(args[i])) i += 2
    else if (GIT_GLOBAL_FLAG.test(args[i])) i += 1
    else return { option: args[i] }
  }
  return { sub: (args[i] ?? '').toLowerCase(), rest: args.slice(i + 1) }
}

function firstString(...values) {
  return values.find(value => typeof value === 'string') ?? ''
}

function matchesLane(rel, lane) {
  return lane.endsWith('/') ? fold(rel).startsWith(fold(lane)) : fold(rel) === fold(lane)
}
