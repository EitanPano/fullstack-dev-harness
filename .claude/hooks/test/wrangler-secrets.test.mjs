// wrangler's own credentials and the `.dev.vars` family: secret like `.aws/` and `.env`, while
// the project's `.wrangler/state` and `.wrangler/tmp` stay readable. Links join the write programs.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fileVerdict, shellVerdict } from './harness.mjs'

const CREDENTIALS = [
  '~/.wrangler/config/default.toml',
  '/home/x/.wrangler/config/default.toml',
  'C:/Users/x/AppData/Roaming/xdg.config/.wrangler/config/default.toml',
  'C:\\Users\\x\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml',
  '.wrangler/config',
  'app/.wrangler/config/'
]
for (const name of CREDENTIALS) {
  test(`Read refuses ${name}`, () => {
    const verdict = fileVerdict('Read', name)
    assert.equal(verdict.blocked, true, 'expected a block')
    assert.equal(verdict.hook, 'block-secret-file-access.mjs', verdict.stderr)
  })
  test(`a shell read refuses ${name}`, () => {
    const verdict = shellVerdict(`cat ${name.replaceAll('\\', '/')}`)
    assert.equal(verdict.blocked, true, 'expected a block')
    assert.equal(verdict.hook, 'block-secret-file-access.mjs', verdict.stderr)
  })
}

for (const name of ['.wrangler/state/v3/d1/x.sqlite', 'app/.wrangler/tmp/bundle/index.js']) {
  test(`${name} stays readable`, () => {
    assert.equal(fileVerdict('Read', name).blocked, false)
    assert.equal(shellVerdict(`cat ${name}`).blocked, false)
  })
}

for (const name of ['.dev.vars~', '.dev.vars-old', '.dev.vars.bak', 'app/.dev.vars~']) {
  test(`${name} is a secret name`, () => {
    assert.equal(fileVerdict('Read', name).blocked, true)
    assert.equal(shellVerdict(`cat ${name}`).blocked, true)
  })
}
for (const name of ['.dev.vars.example', '.dev.vars.sample', '.dev.vars.template']) {
  test(`${name} stays allowed`, () => {
    assert.equal(fileVerdict('Read', name).blocked, false)
    assert.equal(shellVerdict(`cat ${name}`).blocked, false)
  })
}

test('settings.json denies the wrangler credentials and the named dev vars variants', async () => {
  const { readFile } = await import('node:fs/promises')
  const settings = JSON.parse(
    await readFile(new URL('../../settings.json', import.meta.url), 'utf8')
  )
  for (const entry of [
    'Read(~/.wrangler/config/**)',
    'Read(**/.wrangler/config/**)',
    'Read(**/.dev.vars.local)',
    'Read(**/.dev.vars.preview)',
    'Read(**/.dev.vars.production)'
  ]) {
    assert.ok(settings.permissions.deny.includes(entry), entry)
  }
})

for (const command of [
  'cmd /c mklink /J backend\\x .claude\\hooks',
  'mklink /D backend\\x .claude',
  'fsutil hardlink create backend\\c.yaml .fullstack\\catalog.yaml',
  'fsutil fsinfo drives'
]) {
  test(`refuses a link program for backend: ${command}`, () => {
    const verdict = shellVerdict(command, { role: 'backend' })
    assert.equal(verdict.blocked, true, 'expected a block')
    assert.equal(verdict.hook, 'enforce-agent-boundaries.mjs', verdict.stderr)
  })
}
