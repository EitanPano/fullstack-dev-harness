// The fail-closed contract: a hook that cannot read its input, or crashes after reading it,
// blocks (exit 2) instead of allowing.
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { BOUNDARIES_HOOK, DESTRUCTIVE_HOOK, SECRET_HOOK, runHookRaw } from './harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

for (const hook of [SECRET_HOOK, DESTRUCTIVE_HOOK, BOUNDARIES_HOOK]) {
  for (const [name, input] of [
    ['an empty payload', ''],
    ['invalid JSON', 'not json'],
    ['a non-object payload', '[]'],
    ['a payload without tool_input', '{"tool_name":"Bash"}'],
    ['a null tool_input', '{"tool_input":null}']
  ]) {
    test(`${hook} blocks ${name}`, () => {
      assert.equal(runHookRaw(hook, input).status, 2)
    })
  }
}

test('a hook that throws after parsing exits 2', () => {
  const result = runHookRaw(
    path.join(here, 'fixtures', 'throwing-hook.mjs'),
    '{"tool_name":"Bash","tool_input":{"command":"ls"}}'
  )
  assert.equal(result.status, 2)
  assert.match(result.stderr, /hook crashed/)
})

test('control: the same hook allows a harmless valid payload', () => {
  const result = runHookRaw(DESTRUCTIVE_HOOK, '{"tool_name":"Bash","tool_input":{"command":"ls"}}')
  assert.equal(result.status, 0)
})
