import { describe, expect, it, vi } from 'vitest'
import { batch, computed, effect, state, useState } from './index'

describe('state', () => {
  it('reads and updates values', () => {
    const count = state(0)
    count.set((value) => value + 1)
    expect(count()).toBe(1)
  })

  it('does not notify for equal values', () => {
    const count = state(0)
    const listener = vi.fn()
    count.subscribe(listener)
    count.set(0)
    expect(listener).not.toHaveBeenCalled()
  })

  it('batches multiple writes into one computed notification', () => {
    const first = state(1)
    const second = state(1)
    const sum = computed(() => first() + second())
    const listener = vi.fn()
    sum.subscribe(listener)
    batch(() => {
      first.set(2)
      second.set(2)
    })
    expect(sum.value).toBe(4)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('supports explicit function-valued assignment', () => {
    const callback = state<() => string>(() => 'before')
    const next = () => 'after'
    callback.setValue(next)
    expect(callback.value).toBe(next)
  })
})

describe('useState', () => {
  it('returns a signal and a setter tuple', () => {
    const [count, setCount] = useState(1)
    setCount((value) => value + 2)
    expect(count()).toBe(3)
  })
})

describe('computed', () => {
  it('updates when a dependency changes', () => {
    const count = state(2)
    const doubled = computed(() => count() * 2)
    expect(doubled()).toBe(4)
    count.set(3)
    expect(doubled()).toBe(6)
  })

  it('notifies subscribers only when the derived value changes', () => {
    const first = state(1)
    const second = state(1)
    const sum = computed(() => first() + second())
    const listener = vi.fn()
    sum.subscribe(listener)
    first.set(2)
    second.set(0)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stops tracking dependencies after disposal', () => {
    const source = state(1)
    const derived = computed(() => source() * 2)
    const listener = vi.fn()
    derived.subscribe(listener)
    derived.dispose()
    source.set(2)
    expect(listener).not.toHaveBeenCalled()
  })

  it('fails fast when a computed dependency cycle is evaluated', () => {
    const source = state(0)
    let read: () => number = () => source()
    const derived = computed(() => read())
    read = () => derived() + source()
    expect(() => source.set(1)).toThrow('computed dependency cycle')
  })

  it('stays reactive when created inside an effect that later re-runs', () => {
    const source = state(1)
    const seen: number[] = []
    let derived!: ReturnType<typeof computed<number>>
    const stop = effect(() => {
      derived = computed(() => source() * 2)
      seen.push(derived.value)
    })
    source.set(3)
    expect(derived.value).toBe(6)
    expect(seen).toEqual([2, 6])
    stop()
  })

  it('keeps its own subscriptions independent of the parent effect lifecycle', () => {
    const source = state(5)
    let derived!: ReturnType<typeof computed<number>>
    const stop = effect(() => {
      derived = computed(() => source() + 1)
      void derived.value
    })
    stop()
    source.set(10)
    expect(derived.value).toBe(11)
  })
})
