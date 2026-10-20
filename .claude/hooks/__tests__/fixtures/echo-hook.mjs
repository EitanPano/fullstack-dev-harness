// Minimal hook used only by guardrail.test.mjs: exercises the shared fail-closed
// contract with no rule logic of its own. Allows anything it can parse.
import { allow, readPayload } from '../../lib/guardrail.mjs'

await readPayload()
allow()
