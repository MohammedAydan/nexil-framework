export type NexilHandler = (request: Request) => Response | Promise<Response>

export interface NexilAdapter {
  readonly name: 'node' | 'cloudflare' | 'deno'
  readonly handle: NexilHandler
}

function createAdapter(name: NexilAdapter['name'], handler: NexilHandler): NexilAdapter {
  return Object.freeze({ name, handle: handler })
}

export function createNodeAdapter(handler: NexilHandler): NexilAdapter {
  return createAdapter('node', handler)
}

export function createCloudflareAdapter(handler: NexilHandler): NexilAdapter {
  return createAdapter('cloudflare', handler)
}

export function createDenoAdapter(handler: NexilHandler): NexilAdapter {
  return createAdapter('deno', handler)
}

export const adapterCapabilities = {
  node: { filesystem: true, streaming: true, webCrypto: true },
  cloudflare: { filesystem: false, streaming: true, webCrypto: true },
  deno: { filesystem: true, streaming: true, webCrypto: true },
} as const
