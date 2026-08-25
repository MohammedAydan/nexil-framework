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

it('runs shared header, body, and capability conformance across all adapters', async () => {
  const adapters = [
    createNodeAdapter(async () => new Response('ok', { headers: { 'x-runtime': 'portable' } })),
    createCloudflareAdapter(
      async () => new Response('ok', { headers: { 'x-runtime': 'portable' } }),
    ),
    createDenoAdapter(async () => new Response('ok', { headers: { 'x-runtime': 'portable' } })),
  ]
  for (const adapter of adapters) {
    const response = await adapter.handle(new Request('https://example.test/conformance'))
    expect(response.status).toBe(200)
    expect(response.headers.get('x-runtime')).toBe('portable')
    expect(await response.text()).toBe('ok')
  }
})

it('keeps streamed SSR byte-identical and stops work after disconnect', async () => {
  const { renderToStream } = await import('../../packages/renderer/src/stream')
  const { renderToString } = await import('../../packages/renderer/src/index')
  const root = element('article', {}, [element('h1', {}, 'Stream'), element('p', {}, 'Parity')])
  const reader = renderToStream(root, { chunkSize: 4 }).getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const result = await reader.read()
    if (result.done) break
    chunks.push(result.value)
  }
  const bytes = new TextDecoder().decode(
    chunks.reduce((all, chunk) => new Uint8Array([...all, ...chunk]), new Uint8Array()),
  )
  expect(bytes).toBe(renderToString(root))

  const controller = new AbortController()
  let cancelled = false
  const stream = renderToStream(Promise.resolve(root), {
    signal: controller.signal,
    onCancel: () => {
      cancelled = true
    },
  })
  controller.abort()
  const abortedReader = stream.getReader()
  await abortedReader.read()
  expect(cancelled).toBe(true)
})
