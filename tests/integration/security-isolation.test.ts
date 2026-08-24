import { describe, expect, it } from 'vitest'
import { assertTrustedOrigin } from '../../packages/actions/src/index'
import { createDataContext, data, serializeCookie } from '../../packages/server/src/index'
import { element } from '../../packages/core/src/index'
import { renderToString } from '../../packages/renderer/src/index'

async function sessionFor(request: Request): Promise<string> {
  const context = createDataContext(request)
  return data(context, 'session', async () => request.headers.get('cookie') ?? 'anonymous')
}

describe('security and request isolation integration', () => {
  it('keeps 100 concurrent request contexts isolated', async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, async (_, index) => {
        const session = `session-${index}`
        const request = new Request('https://example.test/dashboard', {
          headers: { cookie: serializeCookie('session', session) },
        })
        return sessionFor(request)
      }),
    )
    expect(results).toEqual(
      Array.from(
        { length: 100 },
        (_, index) =>
          `session=${encodeURIComponent(`session-${index}`)}; Path=/; Secure; HttpOnly; SameSite=Lax`,
      ),
    )
  })

  it('rejects cross-origin action requests', () => {
    const request = new Request('https://example.test/action', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    })
    expect(() => assertTrustedOrigin(request)).toThrow()
  })

  it('uses secure cookie defaults and escapes rendered user input', () => {
    expect(serializeCookie('session', 'abc')).toMatch(/Secure; HttpOnly; SameSite=Lax/)
    expect(renderToString(element('p', {}, '<script>alert(1)</script>'))).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    )
  })
})
