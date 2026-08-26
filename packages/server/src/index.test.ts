import { describe, expect, it, vi } from 'vitest'
import {
  createDataContext,
  createSecurityHeaders,
  data,
  defineLoader,
  getCookie,
  parseCookies,
  notFound,
  serializeCookie,
} from './index'

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

  it('parses and decodes request cookies', () => {
    const request = new Request('https://example.test/', {
      headers: { cookie: 'session=hello%20world; theme=dark' },
    })
    expect(parseCookies(request)).toEqual({ session: 'hello world', theme: 'dark' })
    expect(getCookie(request, 'session')).toBe('hello world')
  })

  it('preserves typed loader functions', async () => {
    const loader = defineLoader(async ({ params }) => ({ id: params.id }))
    const result = await loader({
      request: new Request('https://example.test/'),
      params: { id: '42' },
      data: createDataContext(new Request('https://example.test/')),
    })
    expect(result).toEqual({ id: '42' })
  })

  it('keeps malformed cookie encodings lossless', () => {
    expect(parseCookies('safe=value; malformed=%E0%A4%A')).toEqual({
      safe: 'value',
      malformed: '%E0%A4%A',
    })
  })

  it('returns a standards-compatible 404 response', async () => {
    const response = notFound('Missing route')
    expect(response.status).toBe(404)
    await expect(response.text()).resolves.toBe('Missing route')
  })
})
