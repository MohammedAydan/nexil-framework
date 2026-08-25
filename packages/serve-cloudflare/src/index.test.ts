import { describe, expect, it } from 'vitest'
import { createCloudflareHandler } from './index'

describe('Cloudflare edge handler', () => {
  it('serves assets and falls back to the Nexis handler on asset 404', async () => {
    const handler = createCloudflareHandler({
      assets: {
        fetch: (request) =>
          new Response(request.url.endsWith('.js') ? 'asset' : null, {
            status: request.url.endsWith('.js') ? 200 : 404,
          }),
      },
      handler: async () => new Response('route', { status: 200 }),
    })
    await expect((await handler(new Request('https://example.test/app.js'))).text()).resolves.toBe(
      'asset',
    )
    await expect((await handler(new Request('https://example.test/'))).text()).resolves.toBe(
      'route',
    )
  })

  it('returns a no-store 404 without a fallback handler', async () => {
    const handler = createCloudflareHandler({})
    const response = await handler(new Request('https://example.test/missing'))
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
