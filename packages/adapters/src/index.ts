export type NexisHandler = (request: Request) => Response | Promise<Response>

export interface NexisAdapter {
  readonly name: 'node' | 'cloudflare' | 'deno'
  readonly handle: NexisHandler
}

function createAdapter(name: NexisAdapter['name'], handler: NexisHandler): NexisAdapter {
  return Object.freeze({ name, handle: handler })
}

export function createNodeAdapter(handler: NexisHandler): NexisAdapter {
  return createAdapter('node', handler)
}

export function createCloudflareAdapter(handler: NexisHandler): NexisAdapter {
  return createAdapter('cloudflare', handler)
}

export function createDenoAdapter(handler: NexisHandler): NexisAdapter {
  return createAdapter('deno', handler)
}

export const adapterCapabilities = {
  node: { filesystem: true, streaming: true, webCrypto: true },
  cloudflare: { filesystem: false, streaming: true, webCrypto: true },
  deno: { filesystem: true, streaming: true, webCrypto: true },
} as const
