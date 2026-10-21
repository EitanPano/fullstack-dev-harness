import { afterEach, describe, expect, it } from 'bun:test'

import { drain, publish, subscribe } from '../../src/services/event'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

describe('event', () => {
  it('delivers the typed payload to a subscriber', async () => {
    const seen: string[] = []
    cleanups.push(
      subscribe('user.registered', ({ userId }) => {
        seen.push(userId)
      }),
    )

    await publish('user.registered', { userId: 'u1' })
    await drain()

    expect(seen).toEqual(['u1'])
  })

  it('does not let a throwing subscriber block another', async () => {
    let ran = false
    cleanups.push(
      subscribe('user.registered', () => {
        throw new Error('boom')
      }),
      subscribe('user.registered', () => {
        ran = true
      }),
    )

    await publish('user.registered', { userId: 'u2' })
    await drain()

    expect(ran).toBe(true)
  })

  it('stops delivering after unsubscribe', async () => {
    let calls = 0
    const unsubscribe = subscribe('user.registered', () => {
      calls += 1
    })

    unsubscribe()
    await publish('user.registered', { userId: 'u3' })
    await drain()

    expect(calls).toBe(0)
  })
})
