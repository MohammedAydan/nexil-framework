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
  readonly setPath: (path: string, value: unknown) => void
  readonly lens: <Selected = unknown>(path: string) => Signal<Selected>
  readonly select: <Selected>(selector: (value: T) => Selected) => ReadableSignal<Selected>
  readonly subscribe: (listener: () => void) => Unsubscribe
  readonly dispose: () => void
}

function pathSegments(path: string): string[] {
  if (!path || path.startsWith('.') || path.endsWith('.'))
    throw new TypeError('Invalid store path.')
  const segments = path.split('.')
  if (segments.some((segment) => !/^[A-Za-z_$][\w$]*$/.test(segment)))
    throw new TypeError(`Invalid store path: ${path}`)
  return segments
}

function getAtPath(value: unknown, segments: readonly string[]): unknown {
  let current = value
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function setAtPath(value: unknown, segments: readonly string[], next: unknown): unknown {
  if (segments.length === 0) return next
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Store path updates require object parents.')
  const [head, ...tail] = segments
  if (!head) throw new TypeError('Invalid store path.')
  return {
    ...(value as Record<string, unknown>),
    [head]:
      tail.length === 0 ? next : setAtPath((value as Record<string, unknown>)[head], tail, next),
  }
}

function cloneSerializable<T extends Serializable>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
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
  const set = (next: T | ((previous: T) => T)): void => {
    assertActive()
    const resolved = typeof next === 'function' ? (next as (previous: T) => T)(signal()) : next
    if (!isSerializable(resolved))
      throw new TypeError('Nexis store state must remain serializable.')
    signal.set(resolved)
  }
  const store: Store<T> = {
    scope,
    value: signal,
    snapshot: () => {
      assertActive()
      return cloneSerializable(signal())
    },
    set,
    setPath: (path, next) => {
      const segments = pathSegments(path)
      const updated = setAtPath(signal(), segments, next)
      set(updated as T)
    },
    lens: <Selected = unknown>(path: string) => {
      const segments = pathSegments(path)
      const selected = computed(() => getAtPath(signal(), segments) as Selected) as Signal<Selected>
      selected.setValue = (next) => store.setPath(path, next)
      selected.set = (next) => {
        const current = getAtPath(signal(), segments) as Selected
        selected.setValue(
          typeof next === 'function' ? (next as (previous: Selected) => Selected)(current) : next,
        )
      }
      selectors.add(selected as ReadableSignal<unknown>)
      return selected
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
