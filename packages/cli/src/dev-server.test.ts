import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { createDevServer, nodeRequest } from './dev-server.js'

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
    const previous = process.env.NEXIL_TRUST_PROXY
    const request = Readable.from([]) as IncomingMessage
    Object.assign(request, {
      headers: {
        host: 'internal.test:5173',
        'x-forwarded-host': 'public.test',
        'x-forwarded-proto': 'https',
      },
      method: 'POST',
      url: '/__nexil/actions/labs/submit',
    })

    try {
      delete process.env.NEXIL_TRUST_PROXY
      expect((await nodeRequest(request)).url).toBe(
        'http://internal.test:5173/__nexil/actions/labs/submit',
      )

      process.env.NEXIL_TRUST_PROXY = '1'
      expect((await nodeRequest(request)).url).toBe(
        'https://public.test/__nexil/actions/labs/submit',
      )
    } finally {
      if (previous === undefined) delete process.env.NEXIL_TRUST_PROXY
      else process.env.NEXIL_TRUST_PROXY = previous
    }
  })

  it('injects /nexil-navigation.js in dev SSR middleware when route contains Link markup', async () => {
    const { nexilSSRPlugin } = await import('./dev-server.js')
    const plugin = nexilSSRPlugin(process.cwd())
    let middleware: ((req: unknown, res: unknown, next: () => void) => Promise<void>) | undefined
    const fakeServer = {
      watcher: {
        on: () => {},
      },
      middlewares: {
        use: (fn: typeof middleware) => {
          middleware = fn
        },
      },
      ssrLoadModule: async () => ({
        default: () => ({
          kind: 'element',
          tag: 'main',
          props: {},
          children: [
            {
              kind: 'element',
              tag: 'a',
              props: { href: '/about', 'data-nx-link': 'push' },
              children: ['About'],
            },
          ],
        }),
      }),
      ssrFixStacktrace: () => {},
      transformIndexHtml: async (_url: string, html: string) => html,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(plugin as any).configureServer(fakeServer)
    expect(middleware).toBeDefined()
  })
})
