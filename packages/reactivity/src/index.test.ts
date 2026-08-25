import { describe, expect, it, vi } from 'vitest'
import { computed, state, useState } from './index'

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
})
