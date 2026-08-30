import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createNodeAdapter } from '../../packages/nexil/dist/server/index.js'
import { element } from '../../packages/nexil/dist/index.js'
import { renderRoute } from '../../packages/nexil/dist/server/index.js'

async function handler(request) {
  const isServer = new URL(request.url).searchParams.get('mode') === 'server'
  const output = await renderRoute({
    key: new URL(request.url).pathname,
    mode: isServer ? { mode: 'server' } : { mode: 'static' },
    render: () => element('h1', {}, isServer ? 'Server' : 'Static'),
  })
  return new Response(output.html, {
    headers: {
      'cache-control': output.cacheControl,
      'content-type': 'text/html; charset=utf-8',
    },
  })
}

const adapter = createNodeAdapter(handler)
const server = createServer(async (request, response) => {
  try {
    const url = `http://127.0.0.1${request.url ?? '/'}`
    const result = await adapter.handle(new Request(url, { method: request.method }))
    response.writeHead(result.status, Object.fromEntries(result.headers.entries()))
    response.end(await result.text())
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(error instanceof Error ? error.message : String(error))
  }
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert.equal(typeof address, 'object')
const baseUrl = `http://127.0.0.1:${address.port}`
try {
  const staticResponse = await fetch(`${baseUrl}/page`)
  assert.equal(staticResponse.status, 200)
  assert.equal(staticResponse.headers.get('cache-control'), 'public, immutable')
  assert.equal(await staticResponse.text(), '<h1>Static</h1>')

  const serverResponse = await fetch(`${baseUrl}/page?mode=server`)
  assert.equal(serverResponse.status, 200)
  assert.equal(serverResponse.headers.get('cache-control'), 'private, no-store')
  assert.equal(await serverResponse.text(), '<h1>Server</h1>')

  console.log('Node HTTP smoke passed: adapter and render contracts match')
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}
