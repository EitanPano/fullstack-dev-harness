// Fixture: throws after the payload was read. Pins that a bug in a hook's own logic exits 2
// with a "hook crashed" message instead of exiting 1 (which Claude Code treats as allow).
import { readPayload } from '../../lib/guardrail.mjs'

await readPayload()
throw new Error('boom from fixture')
