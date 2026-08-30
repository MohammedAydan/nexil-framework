import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequestContext, runWithScope, getActiveScope, __resetAlsForTest } from './index.js'
import {
  createStore,
  defineStore,
  __getStoresScriptTag,
  __clearAccessedStoreIds,
  __getAccessedStoreIds,
} from './state.js'

describe('edge runtime explicit scope (Cloudflare/Deno fallback)', () => {
  beforeEach(() => {
    // Simulate edge: disable ALS so explicit fallback is used (Cloudflare/Deno)
    __resetAlsForTest(true)
    // Clear any leftover explicit stack
    const g = globalThis as unknown as Record<string, unknown>
    g['__nexil:explicitScopeStack'] = []
    g['__nexil:stores:hydration'] = new Map()
    // Clear stores
    __clearAccessedStoreIds()
  })
  afterEach(() => {
    __resetAlsForTest(false)
    const g = globalThis as unknown as Record<string, unknown>
    g['__nexil:explicitScopeStack'] = []
    g['__nexil:stores:hydration'] = new Map()
    __clearAccessedStoreIds()
  })

  it('isolates stores per explicit scope without ALS (simulated edge)', async () => {
    const ctxA = createRequestContext(new Request('http://example.com/a'), 'req-a')
    const ctxB = createRequestContext(new Request('http://example.com/b'), 'req-b')

    const useAStore = defineStore('edge-a', { state: () => ({ count: 1 }) })
    const useBStore = defineStore('edge-b', { state: () => ({ count: 2 }) })

    // Simulate two concurrent edge requests using explicit runWithScope (no ALS)
    const [a, b] = await Promise.all([
      runWithScope(ctxA.scope, async () => {
        // Check that getActiveScope returns the explicit scope
        expect(getActiveScope()).toBe(ctxA.scope)
        const store = useAStore()
        expect(store.count).toBe(1)
        store.count = 10
        // Small async delay to interleave
        await new Promise((r) => setTimeout(r, 10))
        expect(getActiveScope()).toBe(ctxA.scope)
        expect(store.count).toBe(10)
        // Only edge-a should be in accessed for this scope
        const ids = __getAccessedStoreIds()
        expect(ids).toContain('edge-a')
        const tag = __getStoresScriptTag()
        expect(tag).toContain('edge-a')
        expect(tag).toContain('"count":10')
        return store.count
      }),
      runWithScope(ctxB.scope, async () => {
        expect(getActiveScope()).toBe(ctxB.scope)
        const store = useBStore()
        expect(store.count).toBe(2)
        store.count = 20
        await new Promise((r) => setTimeout(r, 5))
        expect(getActiveScope()).toBe(ctxB.scope)
        expect(store.count).toBe(20)
        const ids = __getAccessedStoreIds()
        expect(ids).toContain('edge-b')
        // Should not contain edge-a from other request
        expect(ids).not.toContain('edge-a')
        const tag = __getStoresScriptTag()
        expect(tag).toContain('edge-b')
        expect(tag).toContain('"count":20')
        return store.count
      }),
    ])

    expect(a).toBe(10)
    expect(b).toBe(20)

    // After both, scopes are popped, getActiveScope should be undefined (global)
    expect(getActiveScope()).toBeUndefined()
  })

  it('handles nested explicit scopes and sync', () => {
    const outer = createRequestContext(new Request('http://example.com/outer'), 'outer').scope
    const inner = createRequestContext(new Request('http://example.com/inner'), 'inner').scope

    const result = runWithScope(outer, () => {
      expect(getActiveScope()).toBe(outer)
      const innerResult = runWithScope(inner, () => {
        expect(getActiveScope()).toBe(inner)
        return 42
      })
      expect(innerResult).toBe(42)
      expect(getActiveScope()).toBe(outer)
      return 'outer-done'
    })
    expect(result).toBe('outer-done')
    expect(getActiveScope()).toBeUndefined()
  })

  it('preserves explicit scope across async await', async () => {
    const ctx = createRequestContext(new Request('http://example.com/async'), 'async').scope
    const val = await runWithScope(ctx, async () => {
      expect(getActiveScope()).toBe(ctx)
      await new Promise((r) => setTimeout(r, 5))
      expect(getActiveScope()).toBe(ctx)
      const store = defineStore('edge-async', { state: () => ({ count: 7 }) })()
      store.count = 99
      await new Promise((r) => setTimeout(r, 5))
      expect(getActiveScope()).toBe(ctx)
      expect(store.count).toBe(99)
      return store.count
    })
    expect(val).toBe(99)
    expect(getActiveScope()).toBeUndefined()
  })

  it('documents Cloudflare Workers pattern', async () => {
    // Simulate Cloudflare fetch handler
    async function handleFetch(request: Request) {
      const ctx = createRequestContext(request, `cf-${Date.now()}`)
      return runWithScope(ctx.scope, async () => {
        const useUserStore = defineStore('cf-user', { state: () => ({ count: 42 }) })
        const store = useUserStore()
        // Simulate SSR that accesses store
        const html = `<p>${store.count}</p>`
        const tag = __getStoresScriptTag()
        expect(tag).toContain('cf-user')
        expect(tag).toContain('"count":42')
        __clearAccessedStoreIds()
        return new Response(html + (tag ?? ''), { headers: { 'Content-Type': 'text/html' } })
      })
    }

    const res = await handleFetch(new Request('http://example.com/'))
    const text = await res.text()
    expect(text).toContain('42')
    expect(text).toContain('__NEXIL_STORES__')
  })

  it('documents Deno pattern (same as Cloudflare)', async () => {
    // Deno.serve handler
    async function denoHandler(req: Request) {
      const ctx = createRequestContext(req, `deno-${Date.now()}`)
      return runWithScope(ctx.scope, async () => {
        const useCartStore = defineStore('deno-cart', { state: () => ({ count: 7 }) })
        const store = useCartStore()
        expect(store.count).toBe(7)
        store.count = 8
        const tag = __getStoresScriptTag()
        expect(tag).toContain('deno-cart')
        __clearAccessedStoreIds()
        return new Response(String(store.count))
      })
    }
    const res = await denoHandler(new Request('http://example.com/deno'))
    expect(await res.text()).toBe('8')
  })
})
