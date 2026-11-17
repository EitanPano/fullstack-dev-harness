// modern-web-guidance runs only through scripts/guidance.mjs (exact pin, telemetry off). The
// hook refuses the CLI in every spelling, for the interactive session and every role alike.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runHook, shellVerdict } from './harness.mjs'

const ROLES = [undefined, 'frontend']
const label = (role, tool) => `${role ?? 'interactive'}${tool === 'PowerShell' ? ' [PowerShell]' : ''}`

const refused = command => {
  for (const role of ROLES) {
    test(`refuses (${label(role)}): ${command}`, () => {
      const verdict = shellVerdict(command, { role })
      assert.equal(verdict.blocked, true, 'expected a block')
      assert.equal(verdict.hook, 'block-destructive-bash.mjs', `${verdict.hook}: ${verdict.stderr}`)
      assert.match(verdict.stderr, /node scripts\/guidance\.mjs search\|retrieve/)
      assert.doesNotMatch(verdict.stderr, /by hand/)
    })
  }
}

const passes = command => {
  for (const role of ROLES) {
    test(`passes (${label(role)}): ${command}`, () => {
      const verdict = shellVerdict(command, { role })
      assert.equal(verdict.blocked, false, `unexpected block by ${verdict.hook}: ${verdict.stderr}`)
    })
  }
}

const REACH = [
  'modern-web-guidance',
  'npx -y modern-web-guidance@latest',
  'npx modern-web-guidance@1.0.1',
  'npx --yes modern-web-guidance',
  'bunx modern-web-guidance',
  'bun x modern-web-guidance',
  'bunx --bun modern-web-guidance',
  'bunx modern-web-guidance@1.0.1',
  'pnpx modern-web-guidance',
  'pnpm dlx modern-web-guidance',
  'pnpm exec modern-web-guidance',
  'yarn dlx modern-web-guidance',
  'yarn modern-web-guidance',
  'npm exec modern-web-guidance',
  'npm exec -- modern-web-guidance',
  'npx -y npm:modern-web-guidance@1',
  './node_modules/.bin/modern-web-guidance',
  '.\\node_modules\\.bin\\modern-web-guidance.cmd',
  'node_modules/.bin/modern-web-guidance.exe',
  'node node_modules/modern-web-guidance/skills/modern-web-guidance/modern-web.mjs',
  'node %TEMP%/bunx-123-modern-web-guidance@1.0.1/node_modules/modern-web-guidance/skills/modern-web-guidance/modern-web.mjs',
  'DISABLE_TELEMETRY=1 npx modern-web-guidance',
  'env DISABLE_TELEMETRY=1 modern-web-guidance',
  'cd app && modern-web-guidance',
  'cd app; bunx modern-web-guidance',
  'sudo modern-web-guidance',
  'timeout 60 modern-web-guidance'
]
for (const reach of REACH) {
  refused(reach)
  refused(`${reach} search "confirm dialog"`)
  refused(`${reach} retrieve dialog`)
}

// Reading the registry is how a pin bump starts; a file run by bun is not the package.
passes('npm view modern-web-guidance versions')
passes('npm pack modern-web-guidance@1.0.1')
passes('bun scripts/guidance.mjs search modern-web-guidance')
passes('node scripts/guidance.mjs search modern-web.mjs')

refused('bash -c "npx -y modern-web-guidance@latest search x"')
refused("bash -lc 'bunx modern-web-guidance retrieve dialog'")
refused('powershell -Command "npx modern-web-guidance search x"')
refused('pwsh -NoProfile -Command "modern-web-guidance search x"')
refused('echo ok; modern-web-guidance search x')
refused('docker compose exec app npx modern-web-guidance search x')

for (const command of [
  'npx -y modern-web-guidance@latest search x',
  'bunx modern-web-guidance search x'
]) {
  for (const role of ROLES) {
    test(`refuses (${label(role, 'PowerShell')}): ${command}`, () => {
      const verdict = shellVerdict(command, { role, tool: 'PowerShell' })
      assert.equal(verdict.blocked, true)
      assert.equal(verdict.hook, 'block-destructive-bash.mjs', verdict.stderr)
    })
  }
}

for (const command of [
  'node scripts/guidance.mjs search "confirm dialog"',
  'node scripts/guidance.mjs retrieve dialog,light-dismiss-a-dialog',
  'node scripts/guidance.mjs search modern-web-guidance',
  'echo modern-web-guidance',
  'grep -rn "modern-web-guidance" .claude',
  'git log --grep=modern-web-guidance',
  'cat .orchestrate/guidance/1.0.1/dialog.md',
  'git grep -nE "modern-web-guidance@(latest|next)"'
]) {
  passes(command)
}

// Every hook settings.json wires for a shell tool lets a role agent run the wrapper, so the
// lane rules and the secret-file rule do not stand in its way.
test('every hook wired on a shell tool lets the wrapper through, for every role', async () => {
  const { readFile } = await import('node:fs/promises')
  const settings = JSON.parse(
    await readFile(new URL('../../settings.json', import.meta.url), 'utf8')
  )
  for (const tool of ['Bash', 'PowerShell']) {
    const hooks = settings.hooks.PreToolUse
      .filter(entry => entry.matcher === '*' || new RegExp(`^(${entry.matcher})$`).test(tool))
      .flatMap(entry => entry.hooks.map(hook => hook.args[0].split('/').pop()))
    assert.ok(hooks.length >= 3, `${tool}: ${hooks}`)
    for (const hook of hooks) {
      for (const role of ['frontend', 'backend', 'qa', 'orchestrator', 'reviewer', undefined]) {
        for (const command of [
          'node scripts/guidance.mjs search dialog',
          'node scripts/guidance.mjs retrieve dialog'
        ]) {
          const payload = { tool_name: tool, tool_input: { command } }
          if (role !== undefined) payload.agent_type = role
          const { status, stderr } = runHook(hook, payload)
          assert.equal(status, 0, `${hook} refused (${role ?? 'interactive'}, ${tool}): ${stderr}`)
        }
      }
    }
  }
})
