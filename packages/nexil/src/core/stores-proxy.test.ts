import { describe, expect, it } from 'vitest'
import { createStore, defineStore } from './index'

describe('createStore modular (state draft) — spec §8 A', () => {
  it('creates proxied store with actions receiving mutable draft', () => {
    type UserProfile = { id: string; name: string; email: string; role: string }
    type UserState = {
      profile: UserProfile | null
      isAuthenticated: boolean
      themePreference: 'light' | 'dark'
    }
    const initial: UserState = { profile: null, isAuthenticated: false, themePreference: 'light' }
    const actions = {
      setProfile(state: UserState, profile: UserProfile) {
        state.profile = profile
        state.isAuthenticated = true
      },
      logout(state: UserState) {
        state.profile = null
        state.isAuthenticated = false
      },
      toggleTheme(state: UserState) {
        state.themePreference = state.themePreference === 'light' ? 'dark' : 'light'
      },
    }
    const useUserStore = createStore({ id: 'user-modular', state: () => initial, actions })
    const store = useUserStore()
    expect(store.snapshot()).toEqual(initial)
    expect(store.profile).toBeNull()
    store.setProfile({ id: '1', name: 'Ahmad', email: 'a@b.com', role: 'admin' })
    expect(store.profile?.name).toBe('Ahmad')
    expect(store.isAuthenticated).toBe(true)
    store.toggleTheme()
    expect(store.themePreference).toBe('dark')
    store.logout()
    expect(store.profile).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('supports direct proxy writes and nested proxies', () => {
    const useStore = createStore({
      id: 'nested-direct',
      state: () => ({ user: { profile: { name: 'Ada' } }, count: 1 }),
      actions: {},
    })
    const store = useStore()
    expect(store.user.profile.name).toBe('Ada')
    store.user.profile.name = 'Eve'
    expect(store.snapshot().user.profile.name).toBe('Eve')
    expect(store.user.profile.name).toBe('Eve')
    // top-level direct
    store.count = 42
    expect(store.count).toBe(42)
  })

  it('batches multiple mutations inside one action to single notification', () => {
    let notifications = 0
    const useStore = createStore({
      id: 'batch-modular',
      state: () => ({ a: 1, b: 2 }),
      actions: {
        double(state: { a: number; b: number }) {
          state.a *= 2
          state.b *= 2
        },
      },
    })
    const store = useStore()
    store.subscribe(() => notifications++)
    store.double()
    expect(notifications).toBe(1)
    expect(store.snapshot()).toEqual({ a: 2, b: 4 })
  })

  it('enforces JSON serializability on create and mutation', () => {
    const useBad = createStore({
      id: 'serial-bad',
      state: () => ({ x: 1 }),
      actions: {},
    })
    const store = useBad() as unknown as { x: unknown }
    expect(() => {
      ;(store as unknown as Record<string, unknown>).x = (() => {}) as unknown as number
    }).toThrow(/serializable/)
    // direct non-serializable via draft
    const useStore2 = createStore({
      id: 'serial2',
      state: () => ({ x: 1 }),
      actions: {
        bad(state: { x: unknown }) {
          state.x = (() => {}) as unknown as number
        },
      },
    })
    const s2 = useStore2() as unknown as { bad: () => void }
    expect(() => s2.bad()).toThrow(/serializable/)
  })

  it('singleton hook returns same instance', () => {
    const useStore = createStore({ id: 'singleton-a', state: () => ({ v: 1 }), actions: {} })
    const a = useStore()
    const b = useStore()
    expect(a).toBe(b)
  })

  it('nested array mutations via proxy are batched and structural-sharing', () => {
    type S = { items: Array<{ id: string; quantity: number }> }
    const useStore = defineStore('array-proxy', {
      state: () => ({ items: [{ id: 'a', quantity: 1 }] }) as S,
      actions: {},
    })
    const store = useStore() as unknown as S & {
      subscribe: (fn: () => void) => () => void
      snapshot: () => S
    }
    let notifications = 0
    store.subscribe(() => notifications++)
    // direct push via proxy path — should batch to single notify
    ;(store.items as unknown as { push: (v: unknown) => void }).push({ id: 'b', quantity: 2 })
    expect(notifications).toBe(1)
    expect(store.snapshot().items).toHaveLength(2)
    // direct nested index mutation via proxy — single notify
    notifications = 0
    // @ts-ignore — testing proxy path for array index
    store.items[0].quantity = 5
    // Note: store.items[0] returns a path proxy, so quantity set goes via setAtPath with batch
    expect(notifications).toBe(1)
    expect(store.snapshot().items[0]!.quantity).toBe(5)
  })

  it('records accessed store ids for SSR serialization', async () => {
    const { __getAccessedStoreIds, __clearAccessedStoreIds } = await import('./index')
    __clearAccessedStoreIds()
    const useA = createStore({ id: 'access-a', state: () => ({ v: 1 }), actions: {} })
    const useB = defineStore('access-b', { state: () => ({ v: 2 }) })
    useA()
    useB()
    const ids = __getAccessedStoreIds()
    expect(ids).toContain('access-a')
    expect(ids).toContain('access-b')
    __clearAccessedStoreIds()
    expect(__getAccessedStoreIds()).toHaveLength(0)
  })

  it('warns on reserved state keys in dev', async () => {
    const warnings: string[] = []
    const origWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    const useStore = createStore({
      id: 'reserved-warn',
      state: () => ({ value: 1, snapshot: 2 }) as unknown as { value: number; snapshot: number },
      actions: {},
    })
    useStore()
    console.warn = origWarn
    expect(warnings.some((w) => w.includes('reserved key'))).toBe(true)
  })
})

describe('defineStore unified (this + getters) — spec §8 B', () => {
  it('supports getters and this-bound actions', () => {
    type CartItem = { id: string; title: string; price: number; quantity: number }
    type CartState = { items: CartItem[]; couponCode: string | null }
    const useCartStore = defineStore('cart-unified', {
      state: () => ({ items: [] as CartItem[], couponCode: null as string | null }),
      getters: {
        totalPrice: (state: CartState) =>
          state.items.reduce((sum: number, item: CartItem) => sum + item.price * item.quantity, 0),
        itemCount: (state: CartState) =>
          state.items.reduce((sum: number, item: CartItem) => sum + item.quantity, 0),
      },
      actions: {
        addItem(this: CartState, item: Omit<CartItem, 'quantity'>) {
          const existing = this.items.find((i: CartItem) => i.id === item.id)
          if (existing) existing.quantity += 1
          else this.items.push({ ...item, quantity: 1 })
        },
        removeItem(this: CartState, id: string) {
          this.items = this.items.filter((i: CartItem) => i.id !== id)
        },
        clearCart(this: CartState) {
          this.items = []
          this.couponCode = null
        },
      },
    })
    const cart = useCartStore()
    expect(cart.totalPrice).toBe(0)
    expect(cart.itemCount).toBe(0)
    cart.addItem({ id: '1', title: 'Book', price: 10 })
    expect(cart.itemCount).toBe(1)
    expect(cart.totalPrice).toBe(10)
    cart.addItem({ id: '1', title: 'Book', price: 10 })
    expect(cart.itemCount).toBe(2)
    expect(cart.totalPrice).toBe(20)
    cart.addItem({ id: '2', title: 'Pen', price: 5 })
    expect(cart.totalPrice).toBe(25)
    expect(cart.items.length).toBe(2)
    cart.removeItem('1')
    expect(cart.totalPrice).toBe(5)
    cart.clearCart()
    expect(cart.items.length).toBe(0)
    expect(cart.couponCode).toBeNull()
  })

  it('getters support this-style', () => {
    type S = { items: Array<{ price: number; quantity: number }> }
    const useStore = defineStore('getter-this', {
      state: () => ({ items: [{ price: 10, quantity: 2 }] }) as S,
      getters: {
        totalPrice(this: S) {
          return this.items.reduce(
            (s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity,
            0,
          )
        },
      },
      actions: {},
    })
    const store = useStore()
    expect(store.totalPrice).toBe(20)
    store.items = [{ price: 5, quantity: 1 }]
    expect(store.totalPrice).toBe(5)
  })

  it('exposes snapshot, subscribe, select, lens, setPath', () => {
    type IntroState = { nested: { value: number }; count: number }
    const useStore = defineStore('introspection', {
      state: () => ({ nested: { value: 1 }, count: 2 }) as IntroState,
      getters: { doubled: (s: IntroState) => s.count * 2 },
      actions: {
        inc(this: IntroState) {
          this.count += 1
        },
      },
    })
    const store = useStore()
    expect(store.snapshot().count).toBe(2)
    const snap = store.snapshot()
    snap.count = 999
    expect(store.count).toBe(2)
    // lens
    const lens = store.lens<number>('nested.value')
    expect(lens()).toBe(1)
    lens.set(42)
    expect(store.snapshot().nested.value).toBe(42)
    // select
    const doubled = store.select((s) => s.count * 2)
    expect(doubled()).toBe(4)
    store.inc()
    expect(doubled()).toBe(6)
    // subscribe
    let notified = false
    const unsub = store.subscribe(() => (notified = true))
    store.inc()
    expect(notified).toBe(true)
    unsub()
    // setPath
    store.setPath('nested.value', 100)
    expect(store.snapshot().nested.value).toBe(100)
    // dispose
    store.dispose()
    expect(() => store.snapshot()).toThrow(/disposed/)
  })
})

describe('array iteration via proxied store', () => {
  it('supports for...of, spread, and Array.from on proxied array', () => {
    type S = { items: number[] }
    const useStore = defineStore('array-iter', {
      state: () => ({ items: [1, 2, 3] }) as S,
      actions: {},
    })
    const store = useStore() as unknown as S & { snapshot: () => S }
    // for...of
    const collected: number[] = []
    for (const v of store.items as unknown as number[]) collected.push(v)
    expect(collected).toEqual([1, 2, 3])
    // spread
    expect([...(store.items as unknown as number[])]).toEqual([1, 2, 3])
    // Array.from
    expect(Array.from(store.items as unknown as Iterable<number>)).toEqual([1, 2, 3])
    // .map still works (via proxied array methods)
    expect((store.items as unknown as number[]).map((x) => x * 2)).toEqual([2, 4, 6])
  })
})

describe('store dispose removes from registry', () => {
  it('dispose removes store so next useStore creates fresh instance', async () => {
    const { __getAccessedStoreIds, __clearAccessedStoreIds } = await import('./index')
    __clearAccessedStoreIds()
    const useStore = defineStore('dispose-registry', {
      state: () => ({ count: 1 }),
      actions: {
        inc(this: { count: number }) {
          this.count += 1
        },
      },
    })
    const first = useStore() as unknown as {
      count: number
      inc: () => void
      snapshot: () => { count: number }
      dispose: () => void
    }
    expect(first.count).toBe(1)
    first.inc()
    expect(first.count).toBe(2)
    first.dispose()
    // Next call should create a fresh instance with initial count:1, not the disposed one
    const second = useStore() as unknown as { count: number; snapshot: () => { count: number } }
    expect(second).not.toBe(first as unknown)
    expect(second.count).toBe(1)
    expect(second.snapshot().count).toBe(1)
    // Disposed instance should throw on snapshot
    expect(() => first.snapshot()).toThrow(/disposed/)
  })
})

describe('direct sequential mutations (outside actions) — not automatically batched', () => {
  it('sequential top-level sets currently notify per mutation (use batch or actions to coalesce)', () => {
    const useStore = defineStore('seq-mutate', {
      state: () => ({ a: 1, b: 2 }),
      actions: {},
    })
    const store = useStore() as unknown as {
      a: number
      b: number
      subscribe: (fn: () => void) => () => void
    }
    let notifications = 0
    store.subscribe(() => notifications++)
    // Direct sequential mutations outside actions — each triggers a notification
    // This is expected; use `batch(() => { store.a=1; store.b=2 })` or an action to coalesce
    store.a = 10
    store.b = 20
    expect(notifications).toBe(2)
  })
})

describe('legacy createStore(initial, scope) still works', () => {
  it('legacy overload remains functional', async () => {
    const { createStore: legacyCreate } = await import('./index')
    const store = legacyCreate({ value: 1 })
    expect(store.snapshot().value).toBe(1)
    store.set({ value: 2 })
    expect(store.value().value).toBe(2)
  })
})
