import { createDenoAdapter } from '@nexil/adapters'
import type { NexilHandler } from '@nexil/adapters'

export interface DenoAsset {
  readonly body: BodyInit
  readonly contentType: string
}

export interface DenoServerOptions {
  readonly handler?: NexilHandler
  readonly assets?: Readonly<Record<string, DenoAsset>>
}

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'

function localPath(request: Request): string {
  return new URL(request.url).pathname
}

export function createDenoHandler(options: DenoServerOptions): NexilHandler {
  const fallback = options.handler
  return async (request) => {
    const pathname = localPath(request)
    const asset = options.assets?.[pathname]
    if (asset) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' },
        })
      }
      return new Response(request.method === 'HEAD' ? null : asset.body, {
        status: 200,
        headers: {
          'content-type': asset.contentType,
          'cache-control': IMMUTABLE_CACHE,
          'x-content-type-options': 'nosniff',
        },
      })
    }
    if (fallback) return fallback(request)
    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
}

export function createDenoAdapterHandler(options: DenoServerOptions): NexilHandler {
  const adapter = createDenoAdapter(createDenoHandler(options))
  return adapter.handle
}

type DenoServe = (
  handler: NexilHandler,
  options?: { readonly port?: number; readonly hostname?: string },
) => unknown

export function serveDeno(
  handler: NexilHandler,
  options: { readonly port?: number; readonly host?: string; readonly serve?: DenoServe } = {},
): unknown {
  const runtimeServe = options.serve ?? (globalThis as { Deno?: { serve?: DenoServe } }).Deno?.serve
  if (typeof runtimeServe !== 'function')
    throw new Error('Deno.serve is unavailable in this runtime.')
  return runtimeServe(handler, { port: options.port ?? 8000, hostname: options.host ?? '0.0.0.0' })
}
