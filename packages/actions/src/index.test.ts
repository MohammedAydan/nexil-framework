import { describe, expect, it, vi } from 'vitest'
import { createDataContext } from '@nexil/server'
import {
  action,
  assertIdempotent,
  assertTrustedOrigin,
  createMemoryIdempotencyStore,
  handleActionRequest,
} from './index'

describe('server actions', () => {
  it('validates before authorizing and handling', async () => {
    const order: string[] = []
    const handler = action({
      validate: (input: unknown) => {
        order.push('validate')
        if (input !== 'ok') throw new Error('invalid')
        return input
      },
      authorize: () => {
        order.push('authorize')
      },
      handle: () => {
        order.push('handle')
        return 'done'
      },
    })
    const context = {
      request: new Request('https://example.test/'),
      data: createDataContext(new Request('https://example.test/')),
    }
    await expect(handler.execute(context, 'ok')).resolves.toBe('done')
    expect(order).toEqual(['validate', 'authorize', 'handle'])
    await expect(handler.execute(context, 'bad')).rejects.toThrow('invalid')
    expect(order).toEqual(['validate', 'authorize', 'handle', 'validate'])
  })

  it('supports the concise validate-handle-authorize form', async () => {
    const context = {
      request: new Request('https://example.test/'),
      data: createDataContext(new Request('https://example.test/')),
    }
    const handler = action(
      (input: unknown) => String(input).trim(),
      (_context, input) => input.toUpperCase(),
    )
    await expect(handler.execute(context, ' nexil ')).resolves.toBe('NEXIL')
  })

  it('requires trusted origin for cross-origin state changes', () => {
    const request = new Request('https://example.test/action', {
      headers: { origin: 'https://evil.test' },
    })
    expect(() => assertTrustedOrigin(request)).toThrow()
  })

  it('rejects duplicate idempotency keys', async () => {
    const seen = new Set<string>()
    const store = {
      has: vi.fn(async (key: string) => seen.has(key)),
      put: vi.fn(async (key: string) => void seen.add(key)),
    }
    await expect(assertIdempotent(store, 'abcdefgh')).resolves.toBeUndefined()
    await expect(assertIdempotent(store, 'abcdefgh')).rejects.toMatchObject({ status: 409 })
  })
})

describe('action transport', () => {
  it('handles JSON and form submissions with a typed envelope', async () => {
    const submit = action({
      validate: (input: unknown) => {
        if (
          !input ||
          typeof input !== 'object' ||
          typeof (input as { name?: unknown }).name !== 'string'
        )
          throw new TypeError('Name required')
        return input as { name: string }
      },
      handle: (_context, input) => `queued:${input.name}`,
    })
    const json = await handleActionRequest(
      new Request('https://example.test/__nexil/actions/labs/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://example.test' },
        body: JSON.stringify({ name: 'Ada' }),
      }),
      submit,
    )
    expect(json.status).toBe(200)
    await expect(json.json()).resolves.toEqual({ ok: true, data: 'queued:Ada' })

    const form = new URLSearchParams({ name: 'Grace' })
    const formResponse = await handleActionRequest(
      new Request('https://example.test/action', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      }),
      submit,
    )
    expect(formResponse.status).toBe(200)
    await expect(formResponse.json()).resolves.toEqual({ ok: true, data: 'queued:Grace' })
  })

  it('rejects invalid input, untrusted origins, duplicate keys, and unsupported methods', async () => {
    const store = createMemoryIdempotencyStore()
    const submit = action({
      validate: (input: unknown) => {
        if (!input || typeof input !== 'object' || !('name' in input))
          throw new TypeError('Name required')
        return input as { name: string }
      },
      handle: (_context, input) => input.name,
    })
    const invalid = await handleActionRequest(
      new Request('https://example.test/action', { method: 'POST', body: JSON.stringify({}) }),
      submit,
    )
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ ok: false, errors: ['Name required'] })

    const origin = await handleActionRequest(
      new Request('https://example.test/action', {
        method: 'POST',
        headers: { origin: 'https://evil.test', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Ada' }),
      }),
      submit,
    )
    expect(origin.status).toBe(403)

    const first = await handleActionRequest(
      new Request('https://example.test/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'abcdefgh' },
        body: JSON.stringify({ name: 'Ada' }),
      }),
      submit,
      { idempotency: store },
    )
    expect(first.status).toBe(200)
    const replay = await handleActionRequest(
      new Request('https://example.test/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'abcdefgh' },
        body: JSON.stringify({ name: 'Ada' }),
      }),
      submit,
      { idempotency: store },
    )
    expect(replay.status).toBe(409)

    const method = await handleActionRequest(new Request('https://example.test/action'), submit)
    expect(method.status).toBe(405)
  })
})
