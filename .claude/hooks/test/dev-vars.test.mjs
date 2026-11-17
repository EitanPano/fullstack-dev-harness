// `.dev.vars` is wrangler's local secret file: a secret name in every spelling `.env` has.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fileVerdict, shellVerdict } from './harness.mjs'

const SECRET = [
  '.dev.vars',
  'app/.dev.vars',
  '.dev.vars.production',
  'app/.dev.vars.staging',
  '.DEV.VARS',
  '.dev.vars.local'
]

for (const name of SECRET) {
  for (const tool of ['Read', 'Edit', 'Write']) {
    test(`${tool} refuses ${name}`, () => {
      const verdict = fileVerdict(tool, name)
      assert.equal(verdict.blocked, true, 'expected a block')
      assert.equal(verdict.hook, 'block-secret-file-access.mjs', verdict.stderr)
    })
  }
  for (const command of [
    `cat ${name}`,
    `type ${name.replaceAll('/', '\\')}`,
    `Get-Content ${name}`,
    `head -n 2 ${name}`,
    `cat < ${name}`,
    `echo x > ${name}`,
    `bash -c "cat ${name}"`,
    `source ${name}`,
    `node -e "require('fs').readFileSync('${name}')"`
  ]) {
    test(`refuses: ${command}`, () => {
      const verdict = shellVerdict(command)
      assert.equal(verdict.blocked, true, 'expected a block')
      assert.equal(verdict.hook, 'block-secret-file-access.mjs', verdict.stderr)
    })
  }
}

test('a glob over dev vars files is refused', () => {
  assert.equal(shellVerdict('cat .dev.vars*').blocked, true)
  assert.equal(fileVerdict('Read', 'app/.dev.vars.*').blocked, true)
})

for (const name of ['.dev.vars.example', 'app/.dev.vars.example', '.DEV.VARS.EXAMPLE']) {
  test(`${name} is allowed`, () => {
    assert.equal(fileVerdict('Read', name).blocked, false)
    assert.equal(shellVerdict(`cat ${name}`).blocked, false)
  })
}

test('other names stay allowed', () => {
  for (const name of ['dev.vars', 'devvars', 'src/dev-vars.ts', '.dev.variables']) {
    assert.equal(fileVerdict('Read', name).blocked, false, name)
  }
})
