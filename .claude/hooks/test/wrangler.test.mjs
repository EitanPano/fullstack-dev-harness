// Platform commands: no sub-agent reaches outside the machine through wrangler, whatever its
// role. The interactive session (no role) is not refused by the hook: settings.json asks the
// person there, so a deploy or a remote migration stays possible on their word.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { shellVerdict } from './harness.mjs'

// Every spawn runs three hooks, so the reach matrix uses two roles and the named commands all four.
const ALL_ROLES = ['backend', 'qa', 'reviewer', 'general-purpose']
const label = (role, tool) => `${role ?? 'interactive'}${tool === 'PowerShell' ? ' [PowerShell]' : ''}`

const refused = (command, roles = ALL_ROLES) => {
  for (const role of roles) {
    test(`refuses (${label(role)}): ${command}`, () => {
      const verdict = shellVerdict(command, { role })
      assert.equal(verdict.blocked, true, 'expected a block')
      assert.equal(verdict.hook, 'block-destructive-bash.mjs', `${verdict.hook}: ${verdict.stderr}`)
      assert.match(verdict.stderr, /wrangler/)
      assert.match(verdict.stderr, /person/)
    })
  }
}

const passes = command => {
  for (const role of [undefined, 'backend', 'general-purpose']) {
    test(`passes (${label(role)}): ${command}`, () => {
      const verdict = shellVerdict(command, { role })
      assert.equal(verdict.blocked, false, `unexpected block by ${verdict.hook}: ${verdict.stderr}`)
    })
  }
}

const SUBCOMMANDS = ['deploy', 'publish', 'login', 'secret', 'delete', 'rollback']
const REACH = [
  'wrangler',
  'bunx wrangler',
  'bun x wrangler',
  'bunx --bun wrangler',
  'npx wrangler',
  'npx --yes wrangler',
  'npx -y wrangler@latest'.replace('@latest', ''),
  'pnpm exec wrangler',
  'pnpm dlx wrangler',
  'yarn wrangler',
  'yarn dlx wrangler',
  'npm exec wrangler',
  'npm exec -- wrangler',
  './node_modules/.bin/wrangler',
  '.\\node_modules\\.bin\\wrangler.cmd',
  'node_modules/.bin/wrangler.exe',
  'node node_modules/wrangler/bin/wrangler.js',
  'WRANGLER_SEND_METRICS=false wrangler',
  'cd app && wrangler',
  'cd app; bunx wrangler',
  'sudo wrangler',
  'env CI=1 wrangler',
  'timeout 60 wrangler'
]

const MATRIX_ROLES = ['qa', 'general-purpose']
for (const reach of REACH) {
  for (const word of SUBCOMMANDS) refused(`${reach} ${word}`, MATRIX_ROLES)
  refused(`${reach} dev --remote`, MATRIX_ROLES)
}
for (const word of SUBCOMMANDS) refused(`wrangler ${word}`)
refused('wrangler dev --remote')

refused('wrangler pages deploy dist --project-name x')
refused('wrangler pages publish dist')
refused('wrangler d1 execute DB --remote --command "select 1"')
refused('wrangler d1 execute DB --remote=true --file x.sql')
refused('wrangler d1 migrations apply DB --remote')
refused('wrangler kv key delete k --binding KV')
refused('wrangler secret put TOKEN')
refused('wrangler d1 delete DB')
refused('wrangler pages secret put X')
refused('bash -c "wrangler deploy"')
refused('sh -c "cd app && bunx wrangler pages deploy dist"')
refused('bash -lc \'npx wrangler publish\'')
refused('powershell -Command "bunx wrangler deploy"')
refused('pwsh -NoProfile -Command "wrangler login"')
refused('echo ok; wrangler deploy')
refused('wrangler whoami && wrangler deploy')
refused('docker compose exec app wrangler deploy')

// The same through the PowerShell tool.
for (const command of ['wrangler deploy', 'bunx wrangler pages deploy dist', 'npx wrangler dev --remote']) {
  for (const role of ['backend', 'general-purpose']) {
    test(`refuses (${label(role, 'PowerShell')}): ${command}`, () => {
      const verdict = shellVerdict(command, { role, tool: 'PowerShell' })
      assert.equal(verdict.blocked, true)
      assert.equal(verdict.hook, 'block-destructive-bash.mjs', verdict.stderr)
    })
  }
}

// The interactive session: the hook lets these through to the `ask` entries of settings.json.
for (const command of [
  'wrangler deploy',
  'bunx wrangler pages deploy dist',
  'wrangler d1 migrations apply DB --remote',
  'wrangler secret put TOKEN'
]) {
  for (const tool of ['Bash', 'PowerShell']) {
    test(`leaves to settings.json (${label(undefined, tool)}): ${command}`, () => {
      const verdict = shellVerdict(command, { role: undefined, tool })
      assert.equal(verdict.blocked, false, `unexpected block by ${verdict.hook}: ${verdict.stderr}`)
    })
  }
}

// settings.json asks before each of them, for both shell tools.
test('settings.json asks before every wrangler command that reaches the platform', async () => {
  const { readFile } = await import('node:fs/promises')
  const settings = JSON.parse(
    await readFile(new URL('../../settings.json', import.meta.url), 'utf8')
  )
  for (const tool of ['Bash', 'PowerShell']) {
    for (const word of [...SUBCOMMANDS, '--remote']) {
      assert.ok(settings.permissions.ask.includes(`${tool}(*wrangler*${word}*)`), `${tool} ${word}`)
    }
  }
})

for (const command of [
  'wrangler pages dev dist',
  'wrangler pages dev dist --port 8788',
  'wrangler dev',
  'bunx wrangler dev',
  'bun x wrangler pages dev .',
  'npx wrangler dev --local',
  'wrangler types',
  'bunx wrangler types',
  'wrangler d1 migrations apply DB --local',
  'wrangler d1 execute DB --local --file x.sql',
  'wrangler d1 execute DB --local --command "delete from post where id = 1"',
  'wrangler d1 migrations create DB add_post',
  'wrangler d1 migrations create DB delete_post',
  'wrangler pages functions build',
  'wrangler --version',
  'wrangler -v',
  'wrangler --help',
  'wrangler pages deployment list',
  'git log --grep deploy',
  'git log --grep=wrangler',
  'grep -rn "wrangler deploy" docs',
  'echo wrangler deploy',
  'bun run deploy-docs',
  'bun run check',
  'bun run dev',
  'cat wrangler.jsonc',
  'ls app/functions'
]) {
  passes(command)
}
