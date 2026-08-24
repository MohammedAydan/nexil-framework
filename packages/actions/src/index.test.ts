import { describe, expect, it, vi } from 'vitest'
import { createDataContext } from '@nexis/server'
import { action, assertIdempotent, assertTrustedOrigin } from './index'

describe('server actions', () => {
  it('validates before authorizing and handling', async () => {
    const order: string[] = []
    const handler = action({
      validate: (input: unknown) => {
        order.push('validate')
        if (input !== 'ok') throw new Error('invalid')
        return input
      },
      authorize: () => order.push('authorize'),
      handle: () => {
        order.push('handle')
        return 'done'
      },
    })
    const context = { request: new Request('https://example.test/'), data: createDataContext(new Request('https://example.test/')) }
    await expect(handler.execute(context, 'ok')).resolves.toBe('done')
    expect(order).toEqual(['validate', 'authorize', 'handle'])
    await expect(handler.execute(context, 'bad')).rejects.toThrow('invalid')
    expect(order).toEqual(['validate', 'authorize', 'handle', 'validate'])
  })

  it('requires trusted origin for cross-origin state changes', () => {
    const request = new Request('https://example.test/action', { headers: { origin: 'https://evil.test' } })
    expect(() => assertTrustedOrigin(request)).toThrow()
  })

  it('rejects duplicate idempotency keys', async () => {
    const seen = new Set<string>()
    const store = { has: vi.fn(async (key: string) => seen.has(key)), put: vi.fn(async (key: string) => void seen.add(key)) }
    await expect(assertIdempotent(store, 'abcdefgh')).resolves.toBeUndefined()
    await expect(assertIdempotent(store, 'abcdefgh')).rejects.toMatchObject({ status: 409 })
  })
})
