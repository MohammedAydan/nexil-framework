import { describe, expect, it } from 'vitest'
import { createDenoHandler } from './index'

describe('Deno edge handler', () => {
  it('serves immutable assets and supports HEAD', async () => {
    const handler = createDenoHandler({
      assets: { '/app.js': { body: 'export default 1', contentType: 'text/javascript' } },
    })
    const response = await handler(new Request('https://example.test/app.js'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('immutable')
    expect(await response.text()).toContain('export default 1')
    const head = await handler(new Request('https://example.test/app.js', { method: 'HEAD' }))
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('delegates routes and returns a safe 404 when no handler exists', async () => {
    const delegated = createDenoHandler({ handler: async () => new Response('route') })
    expect(await (await delegated(new Request('https://example.test/'))).text()).toBe('route')
    const missing = await createDenoHandler({})(new Request('https://example.test/missing'))
    expect(missing.status).toBe(404)
  })
})
