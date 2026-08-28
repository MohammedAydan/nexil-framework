import { createCloudflareAdapter } from '@nexis/adapters'
import type { NexisHandler } from '@nexis/adapters'

export interface CloudflareAssets {
  readonly fetch: (request: Request) => Response | Promise<Response>
}

export interface CloudflareServerOptions {
  readonly handler?: NexisHandler
  readonly assets?: CloudflareAssets
}

export interface CloudflareExecutionContext {
  readonly waitUntil?: (promise: Promise<unknown>) => void
}

export function createCloudflareHandler(options: CloudflareServerOptions): NexisHandler {
  const handler = options.handler
  const assets = options.assets
  return async (request) => {
    if (assets) {
      const asset = await assets.fetch(request)
      if (asset.status !== 404 || !handler) return asset
    }
    if (handler) return handler(request)
    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
}

export function createCloudflareAdapterHandler(options: CloudflareServerOptions): NexisHandler {
  const adapter = createCloudflareAdapter(async (request) => {
    if (options.assets) {
      const asset = await options.assets.fetch(request)
      if (asset.status !== 404 || !options.handler) return asset
    }
    return options.handler
      ? options.handler(request)
      : new Response('Not Found', {
          status: 404,
          headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
        })
  })
  return adapter.handle
}

export function withCloudflareContext(
  handler: NexisHandler,
  context: CloudflareExecutionContext,
): NexisHandler {
  return async (request) => {
    const response = await handler(request)
    context.waitUntil?.(Promise.resolve())
    return response
  }
}
