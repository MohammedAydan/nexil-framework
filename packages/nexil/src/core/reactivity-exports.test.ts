import { describe, expect, it } from 'vitest'
import { computed, createRoot, effect, onCleanup, state, untrack, watch } from './index'

describe('core reactivity surface', () => {
  it('re-exports the full reactive toolkit', () => {
    const source = state(1)
    const derived = computed(() => source() + 1)
    expect(derived.value).toBe(2)
    source.set(4)
    expect(derived.value).toBe(5)

    const changes: number[] = []
    const stopWatching = watch(
      () => source(),
      (value) => changes.push(value),
    )
    source.set(6)
    stopWatching()
    expect(changes).toEqual([6])

    expect(untrack(() => source())).toBe(6)

    let cleanedUp = false
    createRoot((dispose) => {
      onCleanup(() => {
        cleanedUp = true
      })
      dispose()
    })
    expect(cleanedUp).toBe(true)

    let latest = 0
    const stopEffect = effect(() => {
      latest = source()
    })
    expect(latest).toBe(6)
    source.set(8)
    expect(latest).toBe(8)
    stopEffect()
  })
})
