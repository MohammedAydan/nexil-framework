import { describe, expect, it, vi } from 'vitest'
import { createDataContext, createSecurityHeaders, data, serializeCookie } from './index'

describe('request-scoped data', () => {
  it('deduplicates concurrent requests with the same key within one request', async () => {
    const context = createDataContext(new Request('https://example.test/'))
    const loader = vi.fn(async () => 'value')
    const [first, second] = await Promise.all([
      data(context, 'product:1', loader),
      data(context, 'product:1', loader),
    ])
    expect(first).toBe('value')
    expect(second).toBe('value')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('does not deduplicate across request contexts', async () => {
    const firstContext = createDataContext(new Request('https://example.test/one'))
    const secondContext = createDataContext(new Request('https://example.test/two'))
    const loader = vi.fn(async () => Math.random())
    await data(firstContext, 'same', loader)
    await data(secondContext, 'same', loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })
})

describe('secure response primitives', () => {
  it('defaults cookies to Secure, HttpOnly, and Lax', () => {
    expect(serializeCookie('session', 'value')).toContain('Secure; HttpOnly; SameSite=Lax')
  })

  it('rejects header injection values', () => {
    expect(() => serializeCookie('session', 'a\r\nb')).toThrow(/cookie value/)
  })

  it('creates restrictive baseline security headers', () => {
    const headers = createSecurityHeaders('abc123')
    expect(headers.get('Content-Security-Policy')).toContain("object-src 'none'")
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})
