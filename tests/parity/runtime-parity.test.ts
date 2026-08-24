import { describe, expect, it } from 'vitest'
import {
  createCloudflareAdapter,
  createDenoAdapter,
  createNodeAdapter,
} from '../../packages/adapters/src/index'
import { element } from '../../packages/core/src/index'
import { renderRoute } from '../../packages/renderer/src/index'

async function handler(request: Request): Promise<Response> {
  const mode = new URL(request.url).searchParams.get('mode')
  const output = await renderRoute({
    key: new URL(request.url).pathname,
    mode: mode === 'server' ? { mode: 'server' } : { mode: 'static' },
    render: () => element('h1', {}, mode === 'server' ? 'Server' : 'Static'),
  })
  return new Response(output.html, {
    headers: { 'cache-control': output.cacheControl, 'content-type': 'text/html; charset=utf-8' },
  })
}

describe('runtime adapter parity', () => {
  it('returns identical status, headers, and HTML through all adapter contracts', async () => {
    const adapters = [
      createNodeAdapter(handler),
      createCloudflareAdapter(handler),
      createDenoAdapter(handler),
    ]
    const responses = await Promise.all(
      adapters.map(async (adapter) => {
        const response = await adapter.handle(new Request('https://example.test/page'))
        return {
          status: response.status,
          cache: response.headers.get('cache-control'),
          html: await response.text(),
        }
      }),
    )
    expect(responses).toEqual([
      { status: 200, cache: 'public, immutable', html: '<h1>Static</h1>' },
      { status: 200, cache: 'public, immutable', html: '<h1>Static</h1>' },
      { status: 200, cache: 'public, immutable', html: '<h1>Static</h1>' },
    ])
  })

  it('keeps server output private on every adapter contract', async () => {
    const adapters = [
      createNodeAdapter(handler),
      createCloudflareAdapter(handler),
      createDenoAdapter(handler),
    ]
    const caches = await Promise.all(
      adapters.map(async (adapter) =>
        (await adapter.handle(new Request('https://example.test/page?mode=server'))).headers.get(
          'cache-control',
        ),
      ),
    )
    expect(caches).toEqual(['private, no-store', 'private, no-store', 'private, no-store'])
  })
})
