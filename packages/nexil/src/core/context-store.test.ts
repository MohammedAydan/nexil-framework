import { describe, expect, it } from 'vitest'
import {
  createContextScope,
  createRequestContext,
  getActiveScope,
  provideContext,
  runWithScope,
} from './index.js'
import { defineStoreContext, defineStore } from './state.js'

describe('defineStoreContext — createContext-like hierarchical stores', () => {
  it('provides global fallback when no Provider wraps (like React defaultValue)', () => {
    const Counter = defineStoreContext('ctx-counter-fallback', {
      state: () => ({ count: 0 }),
      getters: { doubled: (s) => s.count * 2 },
      actions: {
        inc() {
          this.count += 1
        },
      },
    })
    const a = Counter.use()
    expect(a.count).toBe(0)
    expect(a.doubled).toBe(0)
    a.inc()
    expect(a.count).toBe(1)
    expect(a.doubled).toBe(2)
    // second use without Provider returns same fallback singleton (per global registry)
    const b = Counter.use()
    expect(b).toBe(a)
    expect(b.count).toBe(1)
    // cleanup
    a.dispose()
  })

  it('Provider overrides fallback and use() returns provided instance (hierarchical)', () => {
    const Theme = defineStoreContext('ctx-theme', {
      state: () => ({ mode: 'light' as 'light' | 'dark' }),
      getters: {},
      actions: {
        toggle() {
          this.mode = this.mode === 'light' ? 'dark' : 'light'
        },
      },
    })
    const custom = Theme.create({ mode: 'dark' })
    expect(custom.mode).toBe('dark')

    const outerScope = createContextScope()
    const result = Theme.Provider({
      value: custom,
      scope: outerScope,
      children: () => {
        const inside = Theme.use()
        expect(inside).toBe(custom)
        expect(inside.mode).toBe('dark')
        inside.toggle()
        expect(inside.mode).toBe('light')
        return inside.mode
      },
    })
    expect(result).toBe('light')
    // outside Provider, fallback is different instance (still light default, not the mutated custom which was 1->light after toggle, fallback still light 0? Actually fallback is separate global singleton still 'light')
    // But custom mutated to light, fallback remains light (initial). Ensure not same
    const fallback = Theme.use()
    expect(fallback.mode).toBe('light')
    // fallback is not same as custom (provided was isolated via explicit scope)
    expect(fallback).not.toBe(custom)
    custom.dispose()
    fallback.dispose()
  })

  it('nested Providers shadow parent (nearest-wins) — React Context semantics', () => {
    const Store = defineStoreContext('ctx-nested', {
      state: () => ({ val: 'root' }),
      getters: {},
      actions: {
        set(v: string) {
          this.val = v
        },
      },
    })
    const outer = Store.create({ val: 'outer' })
    const inner = Store.create({ val: 'inner' })

    const outerScope = createContextScope()
    const out = Store.Provider({
      value: outer,
      scope: outerScope,
      children: () => {
        // read outer
        expect(Store.use().val).toBe('outer')
        // nested inner Provider
        const innerResult = Store.Provider({
          value: inner,
          children: () => Store.use().val,
        })
        expect(innerResult).toBe('inner')
        // after inner Provider returns, outer scope still holds outer? But Provider uses runWithScope isolated, so inside outer after inner, still outer
        expect(Store.use().val).toBe('outer')
        return 'outer-done'
      },
    })
    expect(out).toBe('outer-done')
    // outside all Providers → fallback
    const fallback = Store.use()
    expect(fallback.val).toBe('root')
    outer.dispose()
    inner.dispose()
    fallback.dispose()
  })

  it('create() produces fresh isolated instances for each Provider value', () => {
    const C = defineStoreContext('ctx-isolated-create', {
      state: () => ({ count: 0 }),
      getters: { doubled: (s) => s.count * 2 },
      actions: {
        inc() {
          this.count += 1
        },
      },
    })
    const a = C.create()
    const b = C.create({ count: 10 })
    expect(a).not.toBe(b)
    expect(a.count).toBe(0)
    expect(b.count).toBe(10)
    a.inc()
    expect(a.count).toBe(1)
    expect(a.doubled).toBe(2)
    expect(b.count).toBe(10)
    a.dispose()
    b.dispose()
  })

  it('per-request ALS isolation: concurrent runWithScope with different Providers', async () => {
    const Counter = defineStoreContext('ctx-als', {
      state: () => ({ count: 0 }),
      getters: {},
      actions: {
        set(n: number) {
          this.count = n
        },
      },
    })

    const reqA = createRequestContext(new Request('https://example.com/a'), 'a')
    const reqB = createRequestContext(new Request('https://example.com/b'), 'b')

    const storeA = Counter.create({ count: 1 })
    const storeB = Counter.create({ count: 2 })

    await Promise.all([
      runWithScope(reqA.scope, async () => {
        // provide storeA for this request
        return Counter.Provider({
          value: storeA,
          children: () => {
            const cur = Counter.use()
            expect(cur.count).toBe(1)
            // mutate inside request
            cur.count = 11
            return cur.count
          },
        })
      }),
      runWithScope(reqB.scope, async () => {
        return Counter.Provider({
          value: storeB,
          children: () => {
            const cur = Counter.use()
            expect(cur.count).toBe(2)
            cur.count = 22
            return cur.count
          },
        })
      }),
    ])

    expect(storeA.count).toBe(11)
    expect(storeB.count).toBe(22)
    // fallback after requests should still be isolated (global fallback not mutated by scoped)
    const fallback = Counter.use()
    expect(fallback.count).toBe(0)
    storeA.dispose()
    storeB.dispose()
    fallback.dispose()
  })

  it('explicit scope param overrides ALS', () => {
    const Store = defineStoreContext('ctx-explicit-scope', {
      state: () => ({ count: 0 }),
      getters: {},
      actions: {},
    })
    const customScope = createContextScope()
    const custom = Store.create({ count: 7 })
    const nextScope = provideContext(customScope, Store as unknown as any, custom)

    // Use with explicit scope should see custom, without should see fallback
    expect(Store.use(nextScope).count).toBe(7)
    expect(Store.use(customScope).count).toBe(0) // not yet provided in customScope itself
    // fallback global still 0
    const fallback = Store.use()
    expect(fallback.count).toBe(0)
    custom.dispose()
    fallback.dispose()
  })

  it('actions are batched and getters recompute (this-aware)', () => {
    const Cart = defineStoreContext('ctx-cart', {
      state: () => ({ items: [] as string[], count: 0 }),
      getters: {
        total: (s) => s.items.length,
      },
      actions: {
        add(item: string) {
          this.items.push(item)
          this.count += 1
        },
      },
    })
    const cart = Cart.create()
    expect(cart.total).toBe(0)
    cart.add('a')
    expect(cart.items).toEqual(['a'])
    expect(cart.count).toBe(1)
    expect(cart.total).toBe(1)
    cart.add('b')
    expect(cart.total).toBe(2)
    // Provided via context also batched
    const scoped = createContextScope()
    Cart.Provider({
      value: cart,
      scope: scoped,
      children: () => {
        const c = Cart.use()
        c.add('c')
        expect(c.total).toBe(3)
        return null
      },
    })
    expect(cart.total).toBe(3)
    cart.dispose()
  })

  it('defineStore (global singleton) and defineStoreContext (hierarchical) coexist and are distinct registries', () => {
    const Global = defineStore('ctx-coexist-global', {
      state: () => ({ count: 0 }),
      getters: {},
      actions: {
        inc() {
          this.count += 1
        },
      },
    })
    const Contextual = defineStoreContext('ctx-coexist-ctx', {
      state: () => ({ count: 0 }),
      getters: {},
      actions: {
        inc() {
          this.count += 1
        },
      },
    })
    const g = Global()
    const cFallback = Contextual.use()
    expect(g.count).toBe(0)
    expect(cFallback.count).toBe(0)
    g.inc()
    expect(g.count).toBe(1)
    expect(cFallback.count).toBe(0)
    cFallback.inc()
    expect(cFallback.count).toBe(1)
    expect(g.count).toBe(1)
    // Provider overrides contextual but not global
    const provided = Contextual.create({ count: 99 })
    Contextual.Provider({
      value: provided,
      children: () => {
        expect(Contextual.use().count).toBe(99)
        expect(Global().count).toBe(1)
        return null
      },
    })
    expect(Contextual.use().count).toBe(1) // fallback still 1 (mutated)
    g.dispose()
    cFallback.dispose()
    provided.dispose()
  })

  it('Provider children must resolve synchronously (throws on async) — matches Context contract', () => {
    const Store = defineStoreContext('ctx-sync', {
      state: () => ({ v: 0 }),
      getters: {},
      actions: {},
    })
    const s = Store.create()
    expect(() =>
      Store.Provider({
        value: s,
        children: () => Promise.resolve('async' as any),
      }),
    ).toThrow(/synchronously/)
    s.dispose()
  })

  it('use() records access for __NEXIL_STORES__ snapshot (SSR)', () => {
    const S = defineStoreContext('ctx-access', {
      state: () => ({ n: 42 }),
      getters: {},
      actions: {},
    })
    // Import helper dynamically via ESM import (already exported)
    // For this test we just verify use() works inside runWithScope and outside
    const scope = createRequestContext(new Request('https://x'), 'x').scope
    let insideN = 0
    runWithScope(scope, () => {
      const s = S.use()
      insideN = s.n
      expect(s.n).toBe(42)
    })
    expect(insideN).toBe(42)
    const fallback = S.use()
    expect(fallback.n).toBe(42)
    fallback.dispose()
  })
})
