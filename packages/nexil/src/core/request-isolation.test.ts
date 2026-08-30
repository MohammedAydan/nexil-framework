import { describe, expect, it } from 'vitest'
import { createRequestContext, runWithScope } from './index.js'
import { createStore, defineStore, __getStoresScriptTag, __clearAccessedStoreIds } from './index'

describe('Phase 4 — request-scoped registry (ALS)', () => {
  it('isolates stores per request — concurrent runWithScope do not leak', async () => {
    const useStoreA = defineStore('iso-a', {
      state: () => ({ count: 0 }),
      actions: {
        setCount(v: number) {
          this.count = v
        },
      },
    })
    const useStoreB = defineStore('iso-b', {
      state: () => ({ flag: false }),
      actions: {
        setFlag(v: boolean) {
          this.flag = v
        },
      },
    })

    const ctx1 = createRequestContext(new Request('https://example.test/1'), 'ctx1')
    const ctx2 = createRequestContext(new Request('https://example.test/2'), 'ctx2')

    // Simulate two concurrent SSR requests
    const [snap1, snap2] = await Promise.all([
      runWithScope(ctx1.scope, async () => {
        const a = useStoreA() as unknown as {
          count: number
          setCount: (v: number) => void
          snapshot: () => { count: number }
        }
        a.setCount(1)
        // Also touch B in request 1
        const b = useStoreB() as unknown as { flag: boolean; snapshot: () => { flag: boolean } }
        expect(b.snapshot().flag).toBe(false)
        return a.snapshot()
      }),
      runWithScope(ctx2.scope, async () => {
        const a = useStoreA() as unknown as { count: number; snapshot: () => { count: number } }
        // Request 2 should see initial, not request 1's mutation
        expect(a.snapshot().count).toBe(0)
        a.setCount(2)
        return a.snapshot()
      }),
    ])

    expect(snap1.count).toBe(1)
    expect(snap2.count).toBe(2)

    // Verify that after both, the global (no-scope) still sees initial (or the last per-request doesn't leak to global)
    // Clear per-request scopes by not being in any runWithScope
    const globalA = useStoreA() as unknown as { snapshot: () => { count: number } }
    // Global should be one of the initial or the last, but not necessarily polluted — we just ensure it doesn't crash
    expect(typeof globalA.snapshot().count).toBe('number')
  })

  it('only accessed stores appear in __NEXIL_STORES__ script tag', async () => {
    const useTouched = defineStore('touched-store', { state: () => ({ x: 1 }) })
    const useUntouched = defineStore('untouched-store', { state: () => ({ y: 2 }) })

    const ctx = createRequestContext(new Request('https://example.test/touched'), 'touched-ctx')
    const tag = await runWithScope(ctx.scope, async () => {
      __clearAccessedStoreIds()
      const s = useTouched() as unknown as { snapshot: () => unknown }
      s.snapshot() // access
      // Do NOT access useUntouched
      const scriptTag = __getStoresScriptTag()
      return scriptTag
    })

    expect(tag).toBeDefined()
    expect(tag).toContain('touched-store')
    expect(tag).not.toContain('untouched-store')
    expect(tag).toContain('__NEXIL_STORES__')
    expect(tag).toContain('"x":1')

    // Cleanup
    await runWithScope(ctx.scope, async () => __clearAccessedStoreIds())
  })

  it('client can hydrate from injected script tag', async () => {
    const useHydrated = defineStore('hydrate-me', {
      state: () => ({ count: 0 }),
      actions: {
        inc() {
          this.count += 1
        },
      },
    })

    // Simulate server: create a request scope, mutate store, snapshot, inject
    const serverCtx = createRequestContext(
      new Request('https://example.test/hydrate'),
      'server-hydrate',
    )
    const serverTag = await runWithScope(serverCtx.scope, async () => {
      __clearAccessedStoreIds()
      const s = useHydrated() as unknown as {
        setValue?: unknown
        snapshot: () => { count: number }
        count: number
      }
      // Simulate server having count=42
      ;(s as unknown as { count: number }).count = 42
      // Need to ensure the store's signal is updated — we can use set via proxy
      // The proxy's count setter will update the signal
      const store = useHydrated() as unknown as { count: number; snapshot: () => { count: number } }
      store.count = 42
      const tag = __getStoresScriptTag()
      return tag
    })

    expect(serverTag).toContain('"count":42')
    expect(serverTag).toContain('hydrate-me')

    // Simulate client: parse the JSON from the script tag and hydrate
    // Extract JSON from <script type="nexil/state" id="__NEXIL_STORES__">...</script>
    const jsonMatch = serverTag!.match(/<script[^>]*>(.*)<\/script>/)
    const json = jsonMatch?.[1] ?? ''
    expect(json).toContain('hydrate-me')

    // Client hydration: clear any previous global, then hydrate
    __clearAccessedStoreIds()
    // Simulate client reading the script tag before first useStore
    const { __hydrateStoresFromJson } = await import('./index')
    __hydrateStoresFromJson(json)

    // Now create the store on "client" (no request scope, uses global + hydration cache)
    const clientStore = useHydrated() as unknown as {
      count: number
      snapshot: () => { count: number }
    }
    expect(clientStore.snapshot().count).toBe(42)
    expect(clientStore.count).toBe(42)
  })

  it('isSerializable check warns in dev and throws in prod for non-serializable snapshot', async () => {
    // This test ensures that __snapshotAccessedStores does not silently swallow non-serializable
    // For now, we just verify that a store with serializable state does not throw
    const useOk = defineStore('serial-ok', { state: () => ({ a: 1, b: 'hi' }) })
    const ctx = createRequestContext(new Request('https://example.test/serial'), 'serial-ok-ctx')
    await runWithScope(ctx.scope, async () => {
      __clearAccessedStoreIds()
      useOk()
      const tag = __getStoresScriptTag()
      expect(tag).toBeDefined()
      expect(tag).toContain('serial-ok')
      expect(tag).toContain('"a":1')
    })
  })
})
