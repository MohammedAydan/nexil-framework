import assert from 'node:assert/strict'
import { Miniflare } from 'miniflare'

const worker = `
  addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url)
    const isServer = requestUrl.searchParams.get('mode') === 'server'
    event.respondWith(new Response(isServer ? '<h1>Server</h1>' : '<h1>Static</h1>', {
      status: 200,
      headers: {
        'cache-control': isServer ? 'private, no-store' : 'public, immutable',
        'content-type': 'text/html; charset=utf-8'
      }
    }))
  })
`

const miniflare = new Miniflare({
  workers: [
    {
      config: {
        type: 'worker',
        name: 'nexis-edge-smoke',
        compatibilityDate: '2025-01-01',
        env: {},
      },
      legacy: { serviceWorkerScript: worker },
    },
  ],
})
try {
  const staticResponse = await miniflare.dispatchFetch('https://example.test/page')
  assert.equal(staticResponse.status, 200)
  assert.equal(staticResponse.headers.get('cache-control'), 'public, immutable')
  assert.equal(await staticResponse.text(), '<h1>Static</h1>')

  const serverResponse = await miniflare.dispatchFetch('https://example.test/page?mode=server')
  assert.equal(serverResponse.status, 200)
  assert.equal(serverResponse.headers.get('cache-control'), 'private, no-store')
  assert.equal(await serverResponse.text(), '<h1>Server</h1>')

  console.log('Miniflare workerd smoke passed: static and server cache contracts match')
} finally {
  await miniflare.dispose()
}
