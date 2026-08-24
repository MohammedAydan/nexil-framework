import { describe, expect, it } from 'vitest'
import { adapterCapabilities, createCloudflareAdapter, createDenoAdapter, createNodeAdapter } from './index'

describe('edge adapters', () => {
  it('delegate to the same Web Standard handler', async () => {
    const handler = async (request: Request) => new Response(new URL(request.url).pathname)
    const request = new Request('https://example.test/health')
    const adapters = [createNodeAdapter(handler), createCloudflareAdapter(handler), createDenoAdapter(handler)]
    expect(await Promise.all(adapters.map((adapter) => adapter.handle(request).then((response) => response.text())))).toEqual([
      '/health',
      '/health',
      '/health',
    ])
  })

  it('documents capability differences without changing the handler contract', () => {
    expect(adapterCapabilities.cloudflare.filesystem).toBe(false)
    expect(adapterCapabilities.node.streaming).toBe(true)
    expect(adapterCapabilities.deno.webCrypto).toBe(true)
  })
})
