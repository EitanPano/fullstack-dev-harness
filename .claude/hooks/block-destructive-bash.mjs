#!/usr/bin/env node
// PreToolUse guardrail on Bash|PowerShell: blocks destructive shell commands before they
// run. Hooks fire in every permission mode, so this holds even where no permission prompt
// would have appeared.
//
// Layering: the `Bash(...)` / `PowerShell(...)` rules in `permissions.deny` are a separate
// prefix-matched layer that Claude Code evaluates regardless of what this hook returns. This
// hook sees the whole command string and catches what a prefix rule cannot. Keep both.
//
// Access to env/secret FILES is handled by block-secret-file-access.mjs. Do not add a bare
// /\.env\b/ rule here: it also matches `process.env`, `import.meta.env` and `$env:`, which
// blocked ordinary commands.
//
// Known gap, tracked as deferred cases in __tests__/cases.json: one spelling per intent.
// Phase 1 of the harness upgrade replaces this list with a tokenised intent matcher.
import { allow, block, readPayload } from './lib/guardrail.mjs'

const RULES = [
  { name: 'rm -rf', re: /\brm\s+-rf\b/i },
  // Also matches --force-with-lease by prefix. Decided 2026-10-20 (Eitan): agents never
  // force-push, with or without a lease; cases.json d14 pins it. A human runs any rewrite.
  { name: 'git push --force', re: /\bgit\s+push\s+--force/i },
  { name: 'git reset --hard', re: /\bgit\s+reset\s+--hard/i },
  { name: 'DROP TABLE|DATABASE', re: /\bDROP\s+(TABLE|DATABASE)\b/i },
  { name: 'DELETE without WHERE', re: /\bdelete\s+from\s+\w+\s*;?\s*$/i },
  { name: 'supabase db reset', re: /\bsupabase\s+db\s+reset\b/i }
]

const payload = await readPayload()
const command = typeof payload.tool_input.command === 'string' ? payload.tool_input.command : ''
const hit = RULES.find(rule => rule.re.test(command))

if (hit) {
  // Never echo the full command: it can carry a token or URL, and stderr lands in the transcript.
  block(
    `blocked destructive command: rule "${hit.name}" matched (program: ${programOf(command)}). ` +
    'Agents do not run this; ask the user to run it by hand.'
  )
}

allow()

// Names the program only when the command starts with a bare word. A leading `NAME=value`
// assignment or quoted token may carry a secret, so in that case nothing is echoed.
function programOf(command) {
  const first = command.trim().split(/\s+/)[0] ?? ''
  return /^[\w.\/-]+$/.test(first) ? first : 'not shown'
}
