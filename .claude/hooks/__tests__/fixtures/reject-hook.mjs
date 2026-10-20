// Fixture: leaves a promise rejection unhandled after the payload was read. Pins that the
// rejection path also exits 2.
import { readPayload } from '../../lib/guardrail.mjs'

await readPayload()
Promise.reject(new Error('late rejection from fixture'))
await new Promise(resolve => setTimeout(resolve, 50))
