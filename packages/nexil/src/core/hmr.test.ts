import { describe, it, expect } from 'vitest'
import { defineStore, createStore } from './state.js'

describe('HMR shape merge', () => {
  it('preserves live state when adding a new key', () => {
    const useA = defineStore('hmr-add', {
      state: () => ({ count: 5 }),
      actions: {
        inc() {
          this.count += 1
        },
      },
    })
    const store = useA()
    store.inc()
    expect(store.count).toBe(6)
    // Simulate HMR: re-define same id with new shape adding `name`
    const useA2 = defineStore('hmr-add', {
      state: () => ({ count: 0, name: 'Ada' }),
      getters: { doubled: (s) => s.count * 2 },
      actions: {
        inc() {
          this.count += 1
        },
        setName(n: string) {
          ;(this as any).name = n
        },
      },
    })
    const store2 = useA2()
    // Should be same instance (signal preserved)
    expect(store2).toBe(store)
    // Existing count preserved (6), new key gets initial
    expect((store2 as any).count).toBe(6)
    expect((store2 as any).name).toBe('Ada')
    expect((store2 as any).doubled).toBe(12)
    // New action works
    ;(store2 as any).setName('Eve')
    expect((store2 as any).name).toBe('Eve')
    store.dispose()
  })

  it('preserves live state when removing a key', () => {
    const useB = defineStore('hmr-remove', {
      state: () => ({ count: 5, name: 'Ada', extra: 1 }),
    })
    const store = useB()
    expect((store as any).name).toBe('Ada')
    expect((store as any).extra).toBe(1)
    // Mutate count
    ;(store as any).count = 10
    // HMR: new shape without `extra` and `name`
    const useB2 = defineStore('hmr-remove', {
      state: () => ({ count: 0 }),
    })
    const store2 = useB2()
    expect(store2).toBe(store)
    expect((store2 as any).count).toBe(10) // preserved
    expect((store2 as any).name).toBeUndefined()
    expect((store2 as any).extra).toBeUndefined()
    store.dispose()
  })

  it('updates actions/getters without touching state when only logic changes', () => {
    const useC = defineStore('hmr-logic', {
      state: () => ({ count: 5 }),
      getters: { doubled: (s) => s.count * 2 },
      actions: {
        inc() {
          this.count += 1
        },
      },
    })
    const store = useC()
    expect(store.doubled).toBe(10)
    store.inc()
    expect(store.count).toBe(6)
    // HMR: same shape, new getter and new action
    const useC2 = defineStore('hmr-logic', {
      state: () => ({ count: 0 }), // same shape, different initial (should be ignored, live preserved)
      getters: { doubled: (s) => s.count * 3, tripled: (s) => s.count * 3 },
      actions: {
        inc() {
          this.count += 10
        },
        dec() {
          this.count -= 1
        },
      },
    })
    const store2 = useC2()
    expect(store2).toBe(store)
    expect(store2.count).toBe(6) // preserved, not reset to 0
    expect((store2 as any).doubled).toBe(18) // new getter (count*3)
    expect((store2 as any).tripled).toBe(18)
    ;(store2 as any).inc()
    expect(store2.count).toBe(16) // new inc adds 10
    ;(store2 as any).dec()
    expect(store2.count).toBe(15)
    store.dispose()
  })

  it('handles modular createStore shape merge', () => {
    const useM = createStore({
      id: 'hmr-modular',
      state: () => ({ count: 5 }),
      actions: {
        inc(state: { count: number }) {
          state.count += 1
        },
      },
    })
    const store = useM()
    store.inc()
    expect((store as any).count).toBe(6)
    const useM2 = createStore({
      id: 'hmr-modular',
      state: () => ({ count: 0, name: 'Ada' }),
      actions: {
        inc(state: { count: number; name: string }) {
          state.count += 1
        },
        setName(state: { count: number; name: string }, n: string) {
          state.name = n
        },
      },
    })
    const store2 = useM2()
    expect(store2).toBe(store)
    expect((store2 as any).count).toBe(6)
    expect((store2 as any).name).toBe('Ada')
    ;(store2 as any).setName('Eve')
    expect((store2 as any).name).toBe('Eve')
    store.dispose()
  })
})

describe('StoreInstance typing', () => {
  it('infers state, getters, actions correctly', () => {
    const useTyped = defineStore('typed-test', {
      state: () => ({ count: 0, name: 'a' }),
      getters: {
        doubled: (s) => s.count * 2,
        greeting: (s) => `hi ${s.name}`,
      },
      actions: {
        inc() {
          this.count += 1
        },
        setCount(n: number) {
          this.count = n
        },
        setName(name: string) {
          this.name = name
        },
      },
    })
    const store = useTyped()
    // These should be correctly typed (we verify at runtime and via expectTypeOf if available)
    expect(typeof store.count).toBe('number')
    expect(typeof store.name).toBe('string')
    expect(typeof store.doubled).toBe('number')
    expect(typeof store.greeting).toBe('string')
    expect(typeof store.inc).toBe('function')
    expect(typeof store.setCount).toBe('function')
    // Check that actions have correct arity (no state param) — wrapped actions use rest params, so length is 0, but they accept correct args
    expect(store.inc.length).toBe(0)
    // setCount is wrapped with rest params, so length is 0 in JS, but type-level it is (n: number) => void
    expect(typeof store.setCount).toBe('function')
    // Call actions and verify they work with correct params
    store.setCount(5)
    expect(store.count).toBe(5)
    expect(store.doubled).toBe(10)
    store.setName('Bob')
    expect(store.name).toBe('Bob')
    expect(store.greeting).toBe('hi Bob')
    store.dispose()
  })

  it('infers modular createStore actions without state param', () => {
    const useMod = createStore({
      id: 'typed-modular',
      state: () => ({ count: 0 }),
      actions: {
        inc(state: { count: number }) {
          state.count += 1
        },
        setCount(state: { count: number }, n: number) {
          state.count = n
        },
      },
    })
    const store = useMod()
    expect(typeof store.count).toBe('number')
    expect(typeof store.inc).toBe('function')
    expect(store.inc.length).toBe(0) // state param is hidden
    store.inc()
    expect(store.count).toBe(1)
    store.setCount(10)
    expect(store.count).toBe(10)
    store.dispose()
  })
})
