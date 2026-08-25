import { describe, expect, it } from 'vitest'
import { createDevServer, nodeRequest } from './index'

describe('dev server', () => {
  it('delegates requests and advances revisions on invalidation', async () => {
    const server = createDevServer(async () => new Response('ok'))
    expect(server.revision()).toBe(0)
    expect(await (await server.handle(new Request('https://example.test/'))).text()).toBe('ok')
    expect(server.invalidate()).toBe(1)
    expect(server.invalidate()).toBe(2)
    expect(server.revision()).toBe(2)
  })

  it('honors forwarded origin headers only when the proxy is explicitly trusted', async () => {
    const previous = process.env.NEXIS_TRUST_PROXY
    const request = {
      headers: {
        host: 'internal.test:5173',
        'x-forwarded-host': 'public.test',
        'x-forwarded-proto': 'https',
      },
      method: 'POST',
      url: '/__nexis/actions/labs/submit',
      async *[Symbol.asyncIterator]() {},
    } as any

    try {
      delete process.env.NEXIS_TRUST_PROXY
      expect((await nodeRequest(request)).url).toBe(
        'http://internal.test:5173/__nexis/actions/labs/submit',
      )

      process.env.NEXIS_TRUST_PROXY = '1'
      expect((await nodeRequest(request)).url).toBe(
        'https://public.test/__nexis/actions/labs/submit',
      )
    } finally {
      if (previous === undefined) delete process.env.NEXIS_TRUST_PROXY
      else process.env.NEXIS_TRUST_PROXY = previous
    }
  })
})
