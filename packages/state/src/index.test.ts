import { describe, expect, it } from 'vitest'
import { createStateRegistry, createStore } from './index'

describe('stores', () => {
  it('updates selectors when source state changes', () => {
    const store = createStore({ items: ['a'], total: 1 }, 'route')
    const count = store.select((value) => value.items.length)
    expect(count()).toBe(1)
    store.set((value) => ({ ...value, items: [...value.items, 'b'], total: 2 }))
    expect(count()).toBe(2)
  })

  it('returns an immutable serializable snapshot', () => {
    const store = createStore({ nested: { value: 1 } })
    const snapshot = store.snapshot()
    snapshot.nested.value = 2
    expect(store.snapshot().nested.value).toBe(1)
  })

  it('rejects non-serializable initial state and state updates', () => {
    expect(() => createStore({ fn: () => undefined } as never)).toThrow(/serializable/)
    const store = createStore({ value: 1 })
    expect(() => store.set({ fn: () => undefined } as never)).toThrow(/serializable/)
  })

  it('reuses stores by scope and key and blocks use after registry disposal', () => {
    const registry = createStateRegistry()
    const first = registry.getOrCreate('layout', 'nav', { open: false })
    const second = registry.getOrCreate('layout', 'nav', { open: true })
    expect(first).toBe(second)
    registry.dispose()
    expect(() => first.snapshot()).toThrow(/disposed/)
  })

  it('disposes selectors and the underlying signal together', () => {
    const store = createStore({ value: 1 })
    const selected = store.select((value) => value.value)
    store.dispose()
    expect(() => selected()).toThrow(/disposed/)
    expect(() => store.value()).toThrow(/disposed/)
  })
})
