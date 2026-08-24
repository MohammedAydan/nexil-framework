/**
 * Deno runtime verification for the Nexis GA release.
 *
 * Executed by Deno itself (not Playwright/Node):
 *   deno run --allow-read --allow-env tests/e2e/deno-runtime.spec.ts
 * (--allow-env is required because the vite-plugin barrel imports vite, which
 * probes environment variables such as CI at import time.)
 *
 * It exercises the compiled artifacts exactly as an edge consumer would:
 * adapters (request/response contracts), renderer (render modes), and the
 * resumability bootstrap contract that production pages depend on.
 */
import { createDenoAdapter } from '../../packages/adapters/dist/index.js'
import { renderRoute, renderToString, escapeHtml } from '../../packages/renderer/dist/index.js'
import { RESUMABILITY_BOOTSTRAP } from '../../packages/vite-plugin/dist/bootstrap.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

let passed = 0
async function test(name: string, body: () => Promise<void> | void): Promise<void> {
  await body()
  passed++
  console.log(`  ok ${name}`)
}

await test('deno adapter serves web-standard requests', async () => {
  const adapter = createDenoAdapter((request) => {
    const mode = new URL(request.url).searchParams.get('mode')
    return new Response(`<h1>${mode ?? 'static'}</h1>`, {
      headers: {
        'cache-control': mode === 'server' ? 'private, no-store' : 'public, immutable',
        'content-type': 'text/html; charset=utf-8',
      },
    })
  })
  const response = await adapter.handle(new Request('https://example.test/page'))
  assert(response.status === 200, `expected 200, received ${response.status}`)
  assert(response.headers.get('cache-control') === 'public, immutable', 'static cache mismatch')
  assert((await response.text()) === '<h1>static</h1>', 'static body mismatch')

  const dynamic = await adapter.handle(new Request('https://example.test/page?mode=server'))
  assert(dynamic.headers.get('cache-control') === 'private, no-store', 'server cache mismatch')
})

await test('renderRoute static mode emits immutable HTML', async () => {
  const output = await renderRoute({ key: 'home', render: () => '<h1>Home</h1>' })
  assert(output.mode === 'static', 'expected static mode')
  assert(output.cacheControl === 'public, immutable', 'expected immutable caching')
  assert(output.html.includes('Home'), 'rendered HTML mismatch')
})

await test('renderRoute server mode forbids shared caching', async () => {
  const output = await renderRoute({
    key: 'account',
    mode: { mode: 'server' },
    render: async () => 'private payload',
  })
  assert(output.cacheControl === 'private, no-store', 'server responses must be no-store')
})

await test('renderRoute isr requires a cache and honors revalidate', async () => {
  let renders = 0
  let clock = 0
  const store = new Map<string, { html: string; expiresAt: number }>()
  const cache = {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: { html: string; expiresAt: number }) => {
      store.set(key, value)
    },
  }
  const render = (): Promise<string> => {
    renders++
    return Promise.resolve(`fresh ${renders}`)
  }
  const first = await renderRoute({
    key: 'feed',
    mode: { mode: 'isr', revalidate: 10 },
    render,
    cache,
    now: () => clock,
  })
  assert(first.stale === false && renders === 1, 'first ISR render must be fresh')
  const second = await renderRoute({
    key: 'feed',
    mode: { mode: 'isr', revalidate: 10 },
    render,
    cache,
    now: () => clock,
  })
  assert(second.html === 'fresh 1' && renders === 1, 'ISR must serve cached HTML inside window')
  clock += 11_000
  const revalidated = await renderRoute({
    key: 'feed',
    mode: { mode: 'isr', revalidate: 10 },
    render,
    cache,
    now: () => clock,
  })
  assert(revalidated.stale === true && renders === 2, 'stale-while-revalidate contract violated')
})

await test('renderer escapes untrusted text', () => {
  assert(escapeHtml('<script>') === '&lt;script&gt;', 'escaping broken')
  const html = renderToString('<img src=x onerror=alert(1)>')
  assert(!html.includes('<img'), 'raw markup must not pass through text rendering')
})

await test('resumability bootstrap loads chunks from stable absolute URLs', () => {
  assert(RESUMABILITY_BOOTSTRAP.includes("import('/nexis-chunks/'"), 'chunk base URL drifted')
  assert(
    RESUMABILITY_BOOTSTRAP.includes("querySelectorAll('[data-nx-on-click]')"),
    'bootstrap selector drifted',
  )
})

console.log(`Deno runtime spec passed: ${passed} checks`)
