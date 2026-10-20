// Test helper: runs a hook exactly the way Claude Code does — `node <hook>` with the
// JSON payload on stdin — and returns the exit status and stderr.
//
// Defaults are chosen to prove the properties the hooks must have:
// - cwd is this __tests__ directory, never the repo root, so a hook that depends on
//   process.cwd() fails here before it fails in a session that ran `cd`.
// - CLAUDE_PROJECT_DIR is set to the repo root, as Claude Code sets it for every hook.
// - AGENT_ROLE is removed from the inherited environment so a developer's shell cannot
//   leak a role into the suite. A case opts in through `env`.
// - An env value of '' means "unset this variable" (JSON has no way to say delete).
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

export const TESTS_DIR = import.meta.dirname
export const HOOKS_DIR = path.resolve(TESTS_DIR, '..')
export const REPO_ROOT = path.resolve(HOOKS_DIR, '../..')

export const HOOKS = {
  destructive: path.join(HOOKS_DIR, 'block-destructive-bash.mjs'),
  secret: path.join(HOOKS_DIR, 'block-secret-file-access.mjs'),
  boundary: path.join(HOOKS_DIR, 'enforce-agent-boundaries.mjs')
}

export function runHook(hookFile, payload, { env = {}, cwd = TESTS_DIR } = {}) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload)

  const base = { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT }
  delete base.AGENT_ROLE
  const merged = { ...base, ...env }
  for (const [key, value] of Object.entries(merged)) {
    if (value === '') delete merged[key]
  }

  const result = spawnSync(process.execPath, [hookFile], {
    input,
    cwd,
    env: merged,
    encoding: 'utf8'
  })

  return {
    status: result.status,
    stderr: (result.stderr ?? '').trim(),
    stdout: (result.stdout ?? '').trim(),
    error: result.error
  }
}
