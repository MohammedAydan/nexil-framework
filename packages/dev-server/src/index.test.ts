import { describe, expect, it } from 'vitest'
import { createDevServer } from './index'

describe('dev server', () => {
  it('delegates requests and advances revisions on invalidation', async () => {
    const server = createDevServer(async () => new Response('ok'))
    expect(server.revision()).toBe(0)
    expect(await (await server.handle(new Request('https://example.test/'))).text()).toBe('ok')
    expect(server.invalidate()).toBe(1)
    expect(server.invalidate()).toBe(2)
    expect(server.revision()).toBe(2)
  })
})
