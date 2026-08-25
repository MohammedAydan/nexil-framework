import type { ReadableSignal, Signal, Unsubscribe } from '@mohammedaydan/reactivity'
import { computed, state } from '@mohammedaydan/reactivity'
import type { Serializable } from '@mohammedaydan/core'
import { isSerializable } from '@mohammedaydan/core'

export type StateScope = 'local' | 'shared' | 'route' | 'layout' | 'global'

export interface Store<T extends Serializable> {
  readonly scope: StateScope
  readonly value: Signal<T>
  readonly snapshot: () => T
  readonly set: (next: T | ((previous: T) => T)) => void
  readonly select: <Selected>(selector: (value: T) => Selected) => ReadableSignal<Selected>
  readonly subscribe: (listener: () => void) => Unsubscribe
  readonly dispose: () => void
}

export function createStore<T extends Serializable>(
  initial: T,
  scope: StateScope = 'local',
): Store<T> {
  if (!isSerializable(initial))
    throw new TypeError('Nexis store initial state must be serializable.')
  const signal = state(initial)
  const selectors = new Set<ReadableSignal<unknown>>()
  let disposed = false

  const assertActive = () => {
    if (disposed) throw new Error('Nexis store has been disposed.')
  }
  const store: Store<T> = {
    scope,
    value: signal,
    snapshot: () => {
      assertActive()
      return JSON.parse(JSON.stringify(signal())) as T
    },
    set: (next) => {
      assertActive()
      const resolved = typeof next === 'function' ? (next as (previous: T) => T)(signal()) : next
      if (!isSerializable(resolved))
        throw new TypeError('Nexis store state must remain serializable.')
      signal.set(resolved)
    },
    select: <Selected>(selector: (value: T) => Selected) => {
      assertActive()
      const selected = computed(() => selector(signal()))
      selectors.add(selected as ReadableSignal<unknown>)
      return selected
    },
    subscribe: (listener) => {
      assertActive()
      return signal.subscribe(listener)
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      for (const selected of selectors) selected.dispose()
      selectors.clear()
      signal.dispose()
    },
  }
  return store
}

export interface StateRegistry {
  readonly getOrCreate: <T extends Serializable>(
    scope: StateScope,
    key: string,
    initial: T,
  ) => Store<T>
  readonly dispose: () => void
}

export function createStateRegistry(): StateRegistry {
  const stores = new Map<string, Store<Serializable>>()
  return {
    getOrCreate: <T extends Serializable>(scope: StateScope, key: string, initial: T) => {
      if (!/^[a-zA-Z0-9:_-]+$/.test(key)) throw new TypeError('Invalid state store key.')
      const id = `${scope}:${key}`
      const existing = stores.get(id)
      if (existing) return existing as unknown as Store<T>
      const created = createStore(initial, scope) as unknown as Store<Serializable>
      stores.set(id, created)
      return created as unknown as Store<T>
    },
    dispose: () => {
      for (const store of stores.values()) store.dispose()
      stores.clear()
    },
  }
}
