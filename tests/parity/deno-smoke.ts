import { createDenoAdapter } from '../../packages/adapters/dist/index.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function handler(request: Request): Promise<Response> {
  const server = new URL(request.url).searchParams.get('mode') === 'server'
  return new Response(server ? '<h1>Server</h1>' : '<h1>Static</h1>', {
    headers: {
      'cache-control': server ? 'private, no-store' : 'public, immutable',
      'content-type': 'text/html; charset=utf-8',
    },
  })
}

const adapter = createDenoAdapter(handler)
const staticResponse = await adapter.handle(new Request('https://example.test/page'))
assert(staticResponse.status === 200, 'Deno static status mismatch')
assert(
  staticResponse.headers.get('cache-control') === 'public, immutable',
  'Deno static cache mismatch',
)
assert((await staticResponse.text()) === '<h1>Static</h1>', 'Deno static HTML mismatch')

const serverResponse = await adapter.handle(new Request('https://example.test/page?mode=server'))
assert(serverResponse.status === 200, 'Deno server status mismatch')
assert(
  serverResponse.headers.get('cache-control') === 'private, no-store',
  'Deno server cache mismatch',
)
assert((await serverResponse.text()) === '<h1>Server</h1>', 'Deno server HTML mismatch')

console.log('Deno runtime smoke passed: adapter and render contracts match')
