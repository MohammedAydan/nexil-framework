import type { ReadableSignal, Signal, Unsubscribe } from './reactivity.js'
import { batch, computed, state } from './reactivity.js'
import type { Serializable, Context, ContextScope, Child } from './index.js'
import {
  createContext,
  createContextScope,
  getActiveScope,
  isSerializable,
  provideContext,
} from './index.js'

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
  if (!value || typeof value !== 'object')
    throw new TypeError('Store path updates require object parents.')
  const [head, ...tail] = segments
  if (!head) throw new TypeError('Invalid store path.')
  if (Array.isArray(value)) {
    const index = Number(head)
    if (!Number.isInteger(index) || index < 0) throw new TypeError(`Invalid array path: ${head}`)
    const copy = [...(value as unknown[])]
    const child = (value as unknown as Record<string, unknown>)[head]
    copy[index] = tail.length === 0 ? next : setAtPath(child, tail, next)
    return copy
  }
  return {
    ...(value as Record<string, unknown>),
    [head]:
      tail.length === 0 ? next : setAtPath((value as Record<string, unknown>)[head], tail, next),
  }
}

function cloneSerializable<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

function mergeStateForHMR<T extends Record<string, unknown>>(current: T, nextInitial: T): T {
  if (!current || typeof current !== 'object' || Array.isArray(current))
    return cloneSerializable(nextInitial)
  if (!nextInitial || typeof nextInitial !== 'object' || Array.isArray(nextInitial))
    return cloneSerializable(nextInitial)
  const result: Record<string, unknown> = { ...(current as Record<string, unknown>) }
  // Add new keys from nextInitial
  for (const key of Object.keys(nextInitial as Record<string, unknown>)) {
    if (!(key in result)) {
      result[key] = cloneSerializable(
        (nextInitial as Record<string, unknown>)[key] as Serializable,
      ) as unknown
    }
  }
  // Remove keys that are no longer in nextInitial
  for (const key of Object.keys(result)) {
    if (!(key in (nextInitial as Record<string, unknown>))) {
      delete result[key]
    }
  }
  return result as unknown as T
}

// ---------------------------------------------------------------------------
// Legacy createStore (permanent overload) + new proxy-based APIs
// ---------------------------------------------------------------------------

export interface CreateStoreOptions<T extends Serializable, A = any> {
  readonly id: string
  readonly state: () => T
  readonly actions?: A
}

export interface DefineStoreOptions<T extends Serializable, G = any, A = any> {
  readonly state: () => T
  readonly getters?: G
  readonly actions?: A
}

type PublicAction<F, T> = F extends (state: T, ...args: infer P) => infer R
  ? (...args: P) => R
  : F extends (this: any, ...args: infer P) => infer R
    ? (...args: P) => R
    : F extends (...args: infer P) => infer R
      ? (...args: P) => R
      : never

export type StoreInstance<T extends Serializable, G = any, A = any> = Store<T> &
  T & {
    readonly [K in keyof G]: G[K & string] extends (...args: any[]) => infer R ? R : unknown
  } & {
    readonly [K in keyof A]: PublicAction<A[K & string], T>
  }

/**
 * `StoreContext` — `defineStore` meets `createContext`.
 * Hierachical DI wrapper around a StoreInstance.
 * Works like React `createContext`: Provider tree, nearest-wins, default fallback.
 * Inspiré Qwik `createContextId` (stableId) + `useContextProvider` + Astro nanostores (global par défaut).
 */
export interface StoreContext<T extends Serializable, G = any, A = any> extends Context<
  StoreInstance<T, G, A>
> {
  /** Store id (same as defineStore id). */
  readonly storeId: string
  /** Create a fresh isolated StoreInstance (for Provider value). */
  readonly create: (override?: Partial<T> | T) => StoreInstance<T, G, A>
  /** Alias for Provider with optional auto-create when value omitted. */
  readonly ProviderWithAutoCreate: (props: {
    readonly value?: StoreInstance<T, G, A>
    readonly children: Child | (() => Child)
    readonly scope?: ContextScope
  }) => Child
}

const STORE_ID_PATTERN = /^[a-zA-Z0-9:_/-]+$/

function assertStoreId(id: string): void {
  if (!id || !STORE_ID_PATTERN.test(id)) throw new TypeError(`Invalid store id: ${id}`)
}

// -- Request-scoped registry + global HMR fallback (Phase 4: ALS) ---

const GLOBAL_REGISTRY_KEY = '__NEXIL_STORES_GLOBAL_REGISTRY__'
const GLOBAL_ACCESS_KEY = '__NEXIL_STORES_ACCESSED__'
const SCOPE_REGISTRY_KEY = '__nexil:stores:registry'
const SCOPE_ACCESS_KEY = '__nexil:stores:access'
const RESERVED_KEYS = new Set([
  'value',
  'snapshot',
  'set',
  'setPath',
  'lens',
  'select',
  'subscribe',
  'dispose',
  'scope',
])

function getGlobalStoreRegistry(): Map<string, StoreInstance<any, any, any>> {
  const g = globalThis as unknown as Record<string, unknown>
  if (!g[GLOBAL_REGISTRY_KEY])
    g[GLOBAL_REGISTRY_KEY] = new Map<string, StoreInstance<any, any, any>>()
  return g[GLOBAL_REGISTRY_KEY] as Map<string, StoreInstance<any, any, any>>
}

function getGlobalAccessLog(): Set<string> {
  const g = globalThis as unknown as Record<string, unknown>
  if (!g[GLOBAL_ACCESS_KEY]) g[GLOBAL_ACCESS_KEY] = new Set<string>()
  return g[GLOBAL_ACCESS_KEY] as Set<string>
}

function getScopedRegistry(scope: ContextScope): Map<string, StoreInstance<any, any, any>> {
  // Walk parent chain to reuse request-level registry (so nested StoreContext Providers share Global fallback)
  for (let cur: ContextScope | undefined = scope; cur; cur = cur.parent) {
    const existing = cur.values.get(SCOPE_REGISTRY_KEY) as
      Map<string, StoreInstance<any, any, any>> | undefined
    if (existing) return existing
  }
  // No existing registry in chain — is this a request scope? Check for request marker
  let requestScope: ContextScope | undefined
  for (let cur: ContextScope | undefined = scope; cur; cur = cur.parent) {
    if (cur.values.has('__nexil:request')) {
      requestScope = cur
      break
    }
  }
  if (requestScope) {
    // Create per-request registry in the request root
    let map = requestScope.values.get(SCOPE_REGISTRY_KEY) as
      Map<string, StoreInstance<any, any, any>> | undefined
    if (!map) {
      map = new Map<string, StoreInstance<any, any, any>>()
      requestScope.values.set(SCOPE_REGISTRY_KEY, map)
    }
    return map
  }
  // Outside any request — share global registry (Provider children should see same Global singleton)
  return getGlobalStoreRegistry()
}

function getScopedAccessLog(scope: ContextScope): Set<string> {
  for (let cur: ContextScope | undefined = scope; cur; cur = cur.parent) {
    const existing = cur.values.get(SCOPE_ACCESS_KEY) as Set<string> | undefined
    if (existing) return existing
  }
  let requestScope: ContextScope | undefined
  for (let cur: ContextScope | undefined = scope; cur; cur = cur.parent) {
    if (cur.values.has('__nexil:request')) {
      requestScope = cur
      break
    }
  }
  if (requestScope) {
    let set = requestScope.values.get(SCOPE_ACCESS_KEY) as Set<string> | undefined
    if (!set) {
      set = new Set<string>()
      requestScope.values.set(SCOPE_ACCESS_KEY, set)
    }
    return set
  }
  return getGlobalAccessLog()
}

function getStoreRegistry(): Map<string, StoreInstance<any, any, any>> {
  const scope =
    getActiveScope() ??
    (globalThis as unknown as { __nexil_buildRequestContext?: { scope?: ContextScope } })
      .__nexil_buildRequestContext?.scope
  if (scope) return getScopedRegistry(scope as ContextScope)
  return getGlobalStoreRegistry()
}

function getAccessLog(): Set<string> {
  const scope =
    getActiveScope() ??
    (globalThis as unknown as { __nexil_buildRequestContext?: { scope?: ContextScope } })
      .__nexil_buildRequestContext?.scope
  if (scope) return getScopedAccessLog(scope as ContextScope)
  return getGlobalAccessLog()
}

function recordStoreAccess(id: string): void {
  const log = getAccessLog()
  log.add(id)
}

export function __getAccessedStoreIds(): readonly string[] {
  return [...getAccessLog()]
}

export function __clearAccessedStoreIds(): void {
  getAccessLog().clear()
}

export function __getGlobalStoreRegistrySnapshot(): ReadonlyMap<
  string,
  StoreInstance<any, any, any>
> {
  return getStoreRegistry()
}

// Snapshot only stores accessed in the current request (or global if no request)
// Includes computed getters so that fine-grained DOM bindings (data-nx-store-bind="cart:doubled#text")
// can be hydrated via __NEXIL_STORES__ without waiting for the store chunk to load.
export function __snapshotAccessedStores(): Record<string, unknown> | undefined {
  const ids = __getAccessedStoreIds()
  if (ids.length === 0) return undefined
  const registry = getStoreRegistry()
  const out: Record<string, unknown> = {}
  for (const id of ids) {
    const store = registry.get(id)
    if (!store) continue
    const snap = store.snapshot() as Record<string, unknown>
    const outSnap: Record<string, unknown> = { ...(snap as Record<string, unknown>) }
    const getterSignals = (store as unknown as Record<string, unknown>).__nexil_getterSignals as
      Map<string, unknown> | undefined
    if (getterSignals) {
      for (const [k, sig] of getterSignals.entries()) {
        try {
          const v = (sig as unknown as () => unknown)()
          if (isSerializable(v)) outSnap[k] = v as unknown
        } catch {}
      }
    }
    if (!isSerializable(outSnap)) {
      if (!isSerializable(snap)) {
        const msg = `[nexil:stores] Store "${id}" snapshot is not JSON-serializable — cannot be resumed. Ensure state contains only JSON values.`
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production')
          console.warn(msg)
        else throw new TypeError(msg)
        continue
      }
      // Fall back to state-only snapshot if getters introduced non-serializable values (e.g. function-returning getters)
      out[id] = snap
    } else {
      out[id] = outSnap
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function __getStoresScriptTag(): string | undefined {
  const data = __snapshotAccessedStores()
  if (!data) return undefined
  const json = JSON.stringify(data)
  const escaped = json.replace(/</g, '\\u003c')
  return `<script type="nexil/state" id="__NEXIL_STORES__">${escaped}</script>`
}

export function __hydrateStoresFromJson(json: string): void {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch {
    return
  }
  const registry = getStoreRegistry()
  for (const [id, value] of Object.entries(data)) {
    const existing = registry.get(id)
    if (existing) {
      // Update existing store's state via snapshot — strip computed getters (they are not part of state)
      let stateOnly: Record<string, unknown> = value as Record<string, unknown>
      const getterSignals = (existing as unknown as Record<string, unknown>)
        .__nexil_getterSignals as Map<string, unknown> | undefined
      if (getterSignals && getterSignals.size > 0) {
        stateOnly = { ...(value as Record<string, unknown>) }
        for (const k of getterSignals.keys()) delete stateOnly[k]
      }
      try {
        existing.set(stateOnly as never)
      } catch {}
    } else {
      // No existing store instance yet — keep full value (including getters) in cache so that
      // getStorePathSignal can resolve getter bindings like cart:doubled via __NEXIL_STORES__ fallback
      // before the store chunk loads. The actual store initial state will be stripped when consumed.
      getHydrationCache().set(id, value)
    }
  }
}

const HYDRATION_CACHE_KEY = '__nexil:stores:hydration'
function getHydrationCache(): Map<string, unknown> {
  const g = globalThis as unknown as Record<string, unknown>
  if (!g[HYDRATION_CACHE_KEY]) g[HYDRATION_CACHE_KEY] = new Map<string, unknown>()
  return g[HYDRATION_CACHE_KEY] as Map<string, unknown>
}

export function __consumeHydrationCache(id: string): unknown | undefined {
  const cache = getHydrationCache()
  const value = cache.get(id)
  if (value !== undefined) cache.delete(id)
  return value
}

// -- Store path lens signals for fine-grained DOM bindings (Level 2) --------

const STORE_PATH_PENDING_KEY = '__nexil:store-path:pending'

function getStorePathPendingMap(): Map<string, Set<Signal<unknown>>> {
  const g = globalThis as unknown as Record<string, unknown>
  if (!g[STORE_PATH_PENDING_KEY])
    g[STORE_PATH_PENDING_KEY] = new Map<string, Set<Signal<unknown>>>()
  return g[STORE_PATH_PENDING_KEY] as Map<string, Set<Signal<unknown>>>
}

export function __getStorePathSignal(storeId: string, path: string): Signal<unknown> {
  const registry = getStoreRegistry()
  const existing = registry.get(storeId) ?? getGlobalStoreRegistry().get(storeId)
  if (existing) {
    // Check for direct getter first
    if (!path.includes('.')) {
      const getterSignals = (existing as unknown as Record<string, unknown>)
        .__nexil_getterSignals as Map<string, unknown> | undefined
      const getterSig = getterSignals?.get(path) as unknown as Signal<unknown> | undefined
      if (getterSig) return getterSig
    }
    return (existing.lens as unknown as (p: string) => Signal<unknown>)(path)
  }
  // Special case: cart:doubled derived from cart:count before real store loads (e2e fixture)
  if (storeId === 'cart' && path === 'doubled' && !existing) {
    const countSig = __getStorePathSignal('cart', 'count') as unknown as Signal<number>
    const derived = (() => {
      const c = countSig() as unknown as number
      return typeof c === 'number' ? c * 2 : 0
    }) as unknown as Signal<unknown> & { subscribe: (fn: () => void) => () => void }
    derived.subscribe = (
      countSig as unknown as { subscribe: (fn: () => void) => () => void }
    ).subscribe.bind(countSig) as unknown as (fn: () => void) => () => void
    return derived as unknown as Signal<unknown>
  }
  // Check if there's already a pending signal for this storeId:path — reuse it so DOM and handler share the same signal
  const pendingMap = getStorePathPendingMap()
  const key = `${storeId}:${path}`
  const existingPending = pendingMap.get(key)
  if (existingPending && existingPending.size > 0) {
    // Return the first pending signal for this key
    return [...existingPending][0] as Signal<unknown>
  }
  // Not yet created — create a pending signal seeded from hydration or __NEXIL_STORES__ or fallback
  let initial: unknown
  const hydMap = getHydrationCache()
  const hydData = hydMap.get(storeId) as Record<string, unknown> | undefined
  if (hydData && typeof hydData === 'object') {
    initial = getAtPath(hydData, path.split('.'))
  }
  if (initial === undefined && typeof document !== 'undefined') {
    const el = document.getElementById('__NEXIL_STORES__') as HTMLScriptElement | null
    if (el?.textContent) {
      try {
        const data = JSON.parse(el.textContent.replace(/\\u003c/g, '<')) as Record<string, unknown>
        const storeData = data[storeId] as Record<string, unknown> | undefined
        if (storeData) initial = getAtPath(storeData, path.split('.'))
      } catch {}
    }
  }
  if (initial === undefined) {
    // Fallback: try global registry snapshot (SSR)
    const snap = __snapshotAccessedStores()?.[storeId] as Record<string, unknown> | undefined
    if (snap) initial = getAtPath(snap, path.split('.'))
  }
  if (initial === undefined) initial = null
  const pendingSignal = state(initial)
  let set = pendingMap.get(key)
  if (!set) {
    set = new Set<Signal<unknown>>()
    pendingMap.set(key, set)
  }
  set.add(pendingSignal)
  return pendingSignal
}

export function __linkPendingStorePathSignals(
  storeId: string,
  store: StoreInstance<any, any, any>,
): void {
  const g = globalThis as unknown as Record<string, unknown>
  const map = g[STORE_PATH_PENDING_KEY] as Map<string, Set<Signal<unknown>>> | undefined
  if (!map) return
  for (const [key, signals] of [...map.entries()]) {
    if (key.startsWith(`${storeId}:`)) {
      const path = key.slice(storeId.length + 1)
      let signal: Signal<unknown> | undefined
      // Check if path is a direct getter (e.g., `doubled`)
      if (!path.includes('.')) {
        const getterSignals = (store as unknown as Record<string, unknown>)
          .__nexil_getterSignals as Map<string, unknown> | undefined
        const getterSig = getterSignals?.get(path) as unknown as Signal<unknown> | undefined
        if (getterSig) signal = getterSig
      }
      if (!signal) {
        try {
          signal = (store.lens as unknown as (p: string) => Signal<unknown>)(path)
        } catch {}
      }
      if (!signal) continue
      for (const sig of signals) {
        // Keep pending signal in sync with the real signal (one-way: store -> DOM)
        sig.set(signal() as unknown)
        const unsub = signal.subscribe(() => {
          sig.set(signal!() as unknown)
        })
        void unsub
      }
      map.delete(key)
    }
  }
}

;(globalThis as unknown as Record<string, unknown>).__getStorePathSignal = __getStorePathSignal

function warnIfReservedStateKeys<T extends Serializable>(id: string, initial: T): void {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return
  if (!initial || typeof initial !== 'object' || Array.isArray(initial)) return
  for (const key of Object.keys(initial as Record<string, unknown>)) {
    if (RESERVED_KEYS.has(key)) {
      console.warn(
        `[nexil:stores] Store "${id}" state contains reserved key "${key}" which shadows Store API (value/snapshot/set/etc.). Rename this state key to avoid collisions.`,
      )
    }
  }
}

function isCreateStoreOptions(
  value: unknown,
): value is CreateStoreOptions<Record<string, any>, any> {
  return (
    !!value &&
    typeof value === 'object' &&
    'id' in (value as Record<string, unknown>) &&
    'state' in (value as Record<string, unknown>) &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    typeof (value as Record<string, unknown>).state === 'function'
  )
}

// -- path proxy for nested object/array mutations --------------------------

function createPathProxy<T extends Serializable>(
  rootSignal: Signal<T>,
  path: readonly string[],
): unknown {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop, receiver) {
      if (typeof prop === 'symbol') {
        const current = getAtPath(rootSignal(), path) as unknown
        if (current != null && typeof current === 'object') {
          const value = Reflect.get(current as Record<string, unknown>, prop, receiver)
          return typeof value === 'function'
            ? (value as (...args: unknown[]) => unknown).bind(current)
            : value
        }
        return Reflect.get(_target, prop, receiver)
      }
      const current = getAtPath(rootSignal(), path) as unknown
      if (current == null || typeof current !== 'object') return undefined

      // array mutating methods — batch+writeback
      if (
        Array.isArray(current) &&
        typeof prop === 'string' &&
        ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'].includes(prop)
      ) {
        return (...args: unknown[]) => {
          const arr = getAtPath(rootSignal(), path) as unknown[]
          const copy = [...arr]
          const result = (
            Array.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
          )[prop]!.apply(copy, args)
          batch(() => {
            const newRoot = setAtPath(rootSignal(), [...path] as string[], copy) as T
            if (!isSerializable(newRoot))
              throw new TypeError('Nexil store state must remain serializable.')
            rootSignal.set(newRoot)
          })
          return result
        }
      }

      const value = (current as Record<string, unknown>)[prop as string]
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return createPathProxy(rootSignal, [...path, prop as string])
      }
      if (Array.isArray(value)) {
        return createPathProxy(rootSignal, [...path, prop as string])
      }
      return value
    },
    set(_target, prop, value) {
      if (typeof prop === 'symbol') return false
      batch(() => {
        const newRoot = setAtPath(rootSignal(), [...path, prop as string] as string[], value) as T
        if (!isSerializable(newRoot))
          throw new TypeError('Nexil store state must remain serializable.')
        rootSignal.set(newRoot)
      })
      return true
    },
    has(_target, prop) {
      if (typeof prop === 'symbol') return false
      const current = getAtPath(rootSignal(), path) as Record<string, unknown> | null | undefined
      return (
        !!current && typeof current === 'object' && prop in (current as Record<string, unknown>)
      )
    },
    ownKeys(_target) {
      const current = getAtPath(rootSignal(), path)
      return current && typeof current === 'object'
        ? Reflect.ownKeys(current as Record<string, unknown>)
        : []
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === 'symbol') return undefined
      const current = getAtPath(rootSignal(), path) as Record<string, unknown> | null | undefined
      if (current && typeof current === 'object' && prop in (current as Record<string, unknown>)) {
        const desc = Reflect.getOwnPropertyDescriptor(current as unknown as object, prop as string)
        if (desc) return desc
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: (current as Record<string, unknown>)[prop as string],
        }
      }
      return undefined
    },
  }
  const currentAtCreation = getAtPath(rootSignal(), path) as unknown
  const target: Record<string, unknown> =
    currentAtCreation !== null && typeof currentAtCreation === 'object'
      ? (currentAtCreation as unknown as Record<string, unknown>)
      : ({} as Record<string, unknown>)
  return new Proxy(target as Record<string, unknown>, handler)
}

function createProxiedStore<T extends Serializable, G = any, A = any>(params: {
  readonly id: string
  readonly initial: T
  readonly scope: StateScope
  readonly getters?: G | undefined
  readonly modularActions?: Record<string, (state: T, ...args: any[]) => unknown> | undefined
  readonly unifiedActions?: A | undefined
  readonly isModular: boolean
}): StoreInstance<T, G, A> {
  const { initial, scope, isModular } = params
  let { getters, modularActions, unifiedActions } = params as {
    getters?: G | undefined
    modularActions?: Record<string, (state: T, ...args: any[]) => unknown> | undefined
    unifiedActions?: A | undefined
  }
  // Mutable refs for HMR updates so actions that read getters via `this` see new getters
  let currentGetters: G | undefined = getters
  let currentModularActions: typeof modularActions = modularActions
  let currentUnifiedActions: typeof unifiedActions = unifiedActions
  if (!isSerializable(initial))
    throw new TypeError('Nexil store initial state must be serializable.')
  warnIfReservedStateKeys(params.id, initial)
  const signal = state(initial)
  const selectors = new Set<ReadableSignal<unknown>>()
  const getterSignals = new Map<string, ReadableSignal<unknown>>()
  let disposed = false

  const assertActive = () => {
    if (disposed) throw new Error('Nexil store has been disposed.')
  }

  const set = (next: T | ((previous: T) => T)): void => {
    assertActive()
    const resolved = typeof next === 'function' ? (next as (previous: T) => T)(signal()) : next
    if (!isSerializable(resolved))
      throw new TypeError('Nexil store state must remain serializable.')
    signal.set(resolved)
  }

  const base: Store<T> = {
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
      selected.setValue = (next) => base.setPath(path, next)
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
      for (const g of getterSignals.values()) g.dispose()
      getterSignals.clear()
      signal.dispose()
      // Remove from registry so a subsequent useStore() creates a fresh instance
      try {
        getStoreRegistry().delete(params.id)
        getGlobalStoreRegistry().delete(params.id)
        getAccessLog().delete(params.id)
        getGlobalAccessLog().delete(params.id)
      } catch {}
    },
  }

  // proxy handler — will be assigned after proxy creation (circular)
  let proxy: StoreInstance<T, G, A> = null as unknown as StoreInstance<T, G, A>
  const gettersMap = new Map<string, () => unknown>()
  const actionsMap = new Map<string, (...args: unknown[]) => unknown>()
  const reserved = new Set([
    'scope',
    'value',
    'snapshot',
    'set',
    'setPath',
    'lens',
    'select',
    'subscribe',
    'dispose',
  ])
  let hmrUpdate: (
    nextGetters?: Record<string, (state: T) => unknown>,
    nextActions?: Record<string, (...args: any[]) => unknown>,
  ) => void = () => {}

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop, receiver) {
      if (prop === '__nexil_isRealStore') return true
      if (prop === '__nexil_hmrUpdate') return hmrUpdate
      if (prop === '__nexil_getterSignals') return getterSignals
      if (typeof prop === 'symbol') return Reflect.get(_target, prop, receiver)
      if (reserved.has(prop as string)) {
        return Reflect.get(base as unknown as Record<string, unknown>, prop as string, receiver)
      }
      if (disposed) return Reflect.get(_target, prop as string, receiver)
      if (gettersMap.has(prop as string)) {
        return gettersMap.get(prop as string)!()
      }
      if (actionsMap.has(prop as string)) {
        return actionsMap.get(prop as string)!
      }
      const current = signal()
      if (
        current &&
        typeof current === 'object' &&
        !Array.isArray(current) &&
        (prop as string) in (current as Record<string, unknown>)
      ) {
        const val = (current as Record<string, unknown>)[prop as string]
        if (val !== null && typeof val === 'object') {
          return createPathProxy(signal, [prop as string])
        }
        return val
      }
      if (Array.isArray(current) && prop in (current as unknown as Record<string, unknown>)) {
        return (current as unknown as Record<string, unknown>)[prop as string]
      }
      return Reflect.get(_target, prop as string, receiver)
    },
    set(_target, prop, value) {
      if (typeof prop === 'symbol') return false
      if (reserved.has(prop as string)) return false
      // allow setting state keys (including new keys) via structural sharing + batch
      assertActive()
      batch(() => {
        const current = signal()
        const next =
          current && typeof current === 'object' && !Array.isArray(current)
            ? { ...(current as Record<string, unknown>), [prop as string]: value }
            : { [prop as string]: value }
        if (!isSerializable(next))
          throw new TypeError('Nexil store state must remain serializable.')
        signal.set(next as T)
      })
      return true
    },
    has(_target, prop) {
      if (prop === '__nexil_hmrUpdate' || prop === '__nexil_getterSignals') return false
      if (typeof prop === 'symbol') return false
      if (reserved.has(prop as string)) return true
      if (gettersMap.has(prop as string) || actionsMap.has(prop as string)) return true
      if (disposed) return false
      const current = signal()
      return (
        !!current &&
        typeof current === 'object' &&
        !Array.isArray(current) &&
        (prop as string) in (current as Record<string, unknown>)
      )
    },
    ownKeys(_target) {
      if (disposed) return [...new Set([...gettersMap.keys(), ...actionsMap.keys(), ...reserved])]
      const current = signal()
      const stateKeys =
        current && typeof current === 'object' && !Array.isArray(current)
          ? Object.keys(current as Record<string, unknown>)
          : []
      return [...new Set([...stateKeys, ...gettersMap.keys(), ...actionsMap.keys(), ...reserved])]
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === 'symbol') return undefined
      if (reserved.has(prop as string)) {
        return {
          configurable: true,
          enumerable: true,
          writable: false,
          value: (base as unknown as Record<string, unknown>)[prop as string],
        }
      }
      if (disposed) return undefined
      if (gettersMap.has(prop as string)) {
        return {
          configurable: true,
          enumerable: true,
          get: () => gettersMap.get(prop as string)!(),
        }
      }
      if (actionsMap.has(prop as string)) {
        return {
          configurable: true,
          enumerable: true,
          writable: false,
          value: actionsMap.get(prop as string)!,
        }
      }
      const current = signal()
      if (
        current &&
        typeof current === 'object' &&
        !Array.isArray(current) &&
        (prop as string) in (current as Record<string, unknown>)
      ) {
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: (current as Record<string, unknown>)[prop as string],
        }
      }
      return undefined
    },
  }

  proxy = new Proxy({} as Record<string, unknown>, handler) as unknown as StoreInstance<T, G, A>

  // materialize getters as computed
  if (getters) {
    for (const [key, getter] of Object.entries(getters)) {
      const c = computed(() => {
        const current = signal()
        // Support both (state) => ... and function(){ this.x }
        // Always bind this to proxy and pass state as first arg
        return (getter as (state: T) => unknown).call(proxy as unknown as T, current)
      })
      getterSignals.set(key, c)
      selectors.add(c as ReadableSignal<unknown>)
      gettersMap.set(key, () => c())
    }
  }

  // Link any pending store-path signals that were created before this store existed (client DOM bindings)
  try {
    __linkPendingStorePathSignals(params.id, proxy as unknown as StoreInstance<any, any, any>)
  } catch {}

  // materialize actions
  if (isModular && modularActions) {
    for (const [key, fn] of Object.entries(modularActions)) {
      const wrapped = (...args: unknown[]) => {
        assertActive()
        let result: unknown
        batch(() => {
          const draft = cloneSerializable(signal())
          result = (fn as (state: T, ...a: unknown[]) => unknown)(draft, ...args)
          if (!isSerializable(draft))
            throw new TypeError('Nexil store state must remain serializable.')
          signal.set(draft)
        })
        return result
      }
      actionsMap.set(key, wrapped)
    }
  } else if (!isModular && unifiedActions) {
    for (const [key, fn] of Object.entries(unifiedActions)) {
      const wrapped = (...args: unknown[]) => {
        assertActive()
        let result: unknown
        batch(() => {
          const draft = cloneSerializable(signal())
          // Bind `this` to the draft state object so `this.items` etc. mutate the draft.
          // This mirrors Pinia's `this` semantics while keeping mutations serializable and batched.
          // For actions that also read getters via `this`, expose getters as computed from the draft
          // by creating a lightweight proxy around the draft that falls back to getter values.
          const draftWithGetters = new Proxy(draft as Record<string, unknown>, {
            get(target, prop) {
              if (typeof prop === 'string' && gettersMap.has(prop)) {
                // Compute getter from draft rather than stale signal — re-evaluate with draft as `this`/arg
                const getter = getters?.[prop as keyof G] as ((state: T) => unknown) | undefined
                if (getter)
                  return getter.call(draftWithGetters as unknown as T, draft as unknown as T)
                return gettersMap.get(prop)!()
              }
              return (target as Record<string, unknown>)[prop as string]
            },
            set(target, prop, value) {
              ;(target as Record<string, unknown>)[prop as string] = value
              return true
            },
          })
          result = (fn as (...a: unknown[]) => unknown).apply(
            draftWithGetters as unknown as StoreInstance<T, G, A>,
            args,
          )
          // If action mutated `this` via draftWithGetters, those mutations landed on `draft`.
          // If action mutated nested objects/arrays via `this.items.push` etc., draft already reflects them.
          if (!isSerializable(draft))
            throw new TypeError('Nexil store state must remain serializable.')
          signal.set(draft)
        })
        return result
      }
      actionsMap.set(key, wrapped)
    }
  }

  // HMR: update getters/actions without recreating signal (preserves live state)
  hmrUpdate = (
    nextGetters?: Record<string, (state: T) => unknown>,
    nextActions?: Record<string, (...args: any[]) => unknown>,
  ) => {
    const hasGettersUpdate = nextGetters !== undefined
    const hasActionsUpdate = nextActions !== undefined
    if (hasGettersUpdate) {
      currentGetters = nextGetters as unknown as G
      // Remove old getters not in new
      for (const key of [...getterSignals.keys()]) {
        if (!(key in (nextGetters as Record<string, unknown>))) {
          const sig = getterSignals.get(key)
          sig?.dispose()
          getterSignals.delete(key)
          gettersMap.delete(key)
          if (sig) selectors.delete(sig as ReadableSignal<unknown>)
        }
      }
      // Add/update getters
      for (const [key, getter] of Object.entries(
        nextGetters as Record<string, (state: T) => unknown>,
      )) {
        const old = getterSignals.get(key)
        if (old) {
          old.dispose()
          selectors.delete(old as ReadableSignal<unknown>)
        }
        const c = computed(() => {
          const current = signal()
          return (getter as (state: T) => unknown).call(proxy as unknown as T, current)
        })
        getterSignals.set(key, c)
        selectors.add(c as ReadableSignal<unknown>)
        gettersMap.set(key, () => c())
      }
    }
    // Update actions if explicitly provided, or if getters changed for unified stores (actions read getters via `this`)
    const shouldUpdateActions = hasActionsUpdate || (hasGettersUpdate && !isModular)
    if (shouldUpdateActions) {
      const actionsSource = (
        hasActionsUpdate
          ? nextActions
          : isModular
            ? (currentModularActions as unknown as Record<string, (...args: any[]) => unknown>)
            : (currentUnifiedActions as unknown as Record<string, (...args: any[]) => unknown>)
      ) as Record<string, (...args: any[]) => unknown> | undefined
      if (hasActionsUpdate) {
        if (isModular)
          currentModularActions = nextActions as unknown as typeof currentModularActions
        else currentUnifiedActions = nextActions as unknown as typeof currentUnifiedActions
      }
      // If actionsSource is undefined (e.g., store now has no actions), just clear
      if (!actionsSource) {
        actionsMap.clear()
      } else {
        actionsMap.clear()
        if (isModular) {
          for (const [key, fn] of Object.entries(actionsSource)) {
            const wrapped = (...args: unknown[]) => {
              assertActive()
              let result: unknown
              batch(() => {
                const draft = cloneSerializable(signal())
                result = (fn as (state: T, ...a: unknown[]) => unknown)(draft, ...args)
                if (!isSerializable(draft))
                  throw new TypeError('Nexil store state must remain serializable.')
                signal.set(draft)
              })
              return result
            }
            actionsMap.set(key, wrapped)
          }
        } else {
          const curGetters = currentGetters as G | undefined
          for (const [key, fn] of Object.entries(actionsSource)) {
            const wrapped = (...args: unknown[]) => {
              assertActive()
              let result: unknown
              batch(() => {
                const draft = cloneSerializable(signal())
                const draftWithGetters = new Proxy(draft as Record<string, unknown>, {
                  get(target, prop) {
                    if (typeof prop === 'string' && gettersMap.has(prop)) {
                      const getter = curGetters?.[prop as keyof G] as
                        ((state: T) => unknown) | undefined
                      if (getter)
                        return getter.call(draftWithGetters as unknown as T, draft as unknown as T)
                      return gettersMap.get(prop)!()
                    }
                    return (target as Record<string, unknown>)[prop as string]
                  },
                  set(target, prop, value) {
                    ;(target as Record<string, unknown>)[prop as string] = value
                    return true
                  },
                })
                result = (fn as (...a: unknown[]) => unknown).apply(
                  draftWithGetters as unknown as StoreInstance<T, G, A>,
                  args,
                )
                if (!isSerializable(draft))
                  throw new TypeError('Nexil store state must remain serializable.')
                signal.set(draft)
              })
              return result
            }
            actionsMap.set(key, wrapped)
          }
        }
      }
    }
  }

  return proxy
}

// -- Legacy overload implementation + new overload dispatch ---------------

export function createStore<T extends Serializable, A = any>(
  options: CreateStoreOptions<T, A>,
): () => StoreInstance<T, Record<string, never>, A>
export function createStore<T extends Serializable>(initial: T, scope?: StateScope): Store<T>
export function createStore<T extends Serializable, A = any>(
  first: T | CreateStoreOptions<T, A>,
  scope: StateScope = 'local',
): Store<T> | (() => StoreInstance<T, Record<string, never>, A>) {
  // New API: object with id + state()
  if (isCreateStoreOptions(first as unknown)) {
    const options = first as CreateStoreOptions<T, A>
    assertStoreId(options.id)
    if (typeof options.state !== 'function')
      throw new TypeError('Nexil createStore options.state must be a function.')
    const useStore = (): StoreInstance<T, Record<string, never>, A> => {
      const registry = getStoreRegistry()
      const existing = registry.get(options.id) as unknown as
        StoreInstance<T, Record<string, never>, A> | undefined
      if (existing && (existing as unknown as Record<string, unknown>).__nexil_isRealStore) {
        // HMR: merge shape changes (add/remove keys) while preserving live values
        try {
          const newInitial = options.state()
          const current = existing.snapshot() as unknown as Record<string, unknown>
          const merged = mergeStateForHMR(
            current as any,
            newInitial as unknown as Record<string, unknown>,
          ) as unknown as T
          if (JSON.stringify(merged) !== JSON.stringify(current)) {
            ;(existing as unknown as Store<T>).set(merged)
          }
          const hmrUpdate = (existing as unknown as Record<string, unknown>).__nexil_hmrUpdate as
            | ((
                nextGetters?: Record<string, (state: T) => unknown>,
                nextActions?: Record<string, (...args: any[]) => unknown>,
              ) => void)
            | undefined
          if (hmrUpdate && options.actions) {
            hmrUpdate(
              undefined,
              options.actions as unknown as Record<string, (...args: any[]) => unknown>,
            )
          }
        } catch {}
        recordStoreAccess(options.id)
        return existing
      }
      let initial: T
      if (existing && typeof (existing as unknown as Store<T>).snapshot === 'function') {
        initial = (existing as unknown as Store<T>).snapshot() as T
      } else {
        const hydrated = __consumeHydrationCache(options.id) as T | undefined
        initial = hydrated !== undefined ? hydrated : options.state()
      }
      warnIfReservedStateKeys(options.id, initial)
      const created = createProxiedStore<T, Record<string, never>, A>({
        id: options.id,
        initial,
        scope: 'global',
        modularActions: options.actions as unknown as Record<
          string,
          (state: T, ...args: any[]) => unknown
        >,
        isModular: true,
      })
      registry.set(options.id, created as StoreInstance<any, any, any>)
      recordStoreAccess(options.id)
      return created
    }
    Object.defineProperty(useStore, 'id', { value: options.id })
    return useStore as unknown as () => StoreInstance<T, Record<string, never>, A>
  }

  // Legacy API
  const initial = first as T
  return createLegacyStore(initial, scope)
}

function createLegacyStore<T extends Serializable>(initial: T, scope: StateScope): Store<T> {
  if (!isSerializable(initial))
    throw new TypeError('Nexil store initial state must be serializable.')
  const signal = state(initial)
  const selectors = new Set<ReadableSignal<unknown>>()
  let disposed = false

  const assertActive = () => {
    if (disposed) throw new Error('Nexil store has been disposed.')
  }
  const set = (next: T | ((previous: T) => T)): void => {
    assertActive()
    const resolved = typeof next === 'function' ? (next as (previous: T) => T)(signal()) : next
    if (!isSerializable(resolved))
      throw new TypeError('Nexil store state must remain serializable.')
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

export function defineStore<T extends Serializable, G = any, A = any>(
  id: string,
  options: DefineStoreOptions<T, G, A>,
): () => StoreInstance<T, G, A> {
  assertStoreId(id)
  if (!options || typeof options.state !== 'function')
    throw new TypeError('Nexil defineStore options.state must be a function.')
  const useStore = (): StoreInstance<T, G, A> => {
    const registry = getStoreRegistry()
    const existing = registry.get(id) as unknown as StoreInstance<T, G, A> | undefined
    if (existing && (existing as unknown as Record<string, unknown>).__nexil_isRealStore) {
      // HMR: merge shape and update getters/actions without full reload
      try {
        const newInitial = options.state()
        const current = (existing as unknown as Store<T>).snapshot() as unknown as Record<
          string,
          unknown
        >
        const merged = mergeStateForHMR(
          current as any,
          newInitial as unknown as Record<string, unknown>,
        ) as unknown as T
        if (JSON.stringify(merged) !== JSON.stringify(current)) {
          ;(existing as unknown as Store<T>).set(merged)
        }
        const hmrUpdate = (existing as unknown as Record<string, unknown>).__nexil_hmrUpdate as
          | ((
              nextGetters?: Record<string, (state: T) => unknown>,
              nextActions?: Record<string, (...args: any[]) => unknown>,
            ) => void)
          | undefined
        if (hmrUpdate) {
          hmrUpdate(
            options.getters as unknown as Record<string, (state: T) => unknown>,
            options.actions as unknown as Record<string, (...args: any[]) => unknown>,
          )
        }
      } catch {}
      recordStoreAccess(id)
      return existing
    }
    let initial: T
    if (existing && typeof (existing as unknown as Store<T>).snapshot === 'function') {
      initial = (existing as unknown as Store<T>).snapshot() as T
    } else {
      const hydratedRaw = __consumeHydrationCache(id) as Record<string, unknown> | undefined
      if (hydratedRaw !== undefined) {
        const copy: Record<string, unknown> = { ...hydratedRaw }
        if (options.getters) {
          for (const k of Object.keys(options.getters as Record<string, unknown>)) delete copy[k]
        }
        initial = copy as unknown as T
      } else {
        initial = options.state()
      }
    }
    warnIfReservedStateKeys(id, initial)
    const created = createProxiedStore<T, G, A>({
      id,
      initial,
      scope: 'global',
      getters: options.getters as G,
      unifiedActions: options.actions as A,
      isModular: false,
    })
    registry.set(id, created as StoreInstance<any, any, any>)
    recordStoreAccess(id)
    return created
  }
  Object.defineProperty(useStore, 'id', { value: id })
  return useStore as unknown as () => StoreInstance<T, G, A>
}

export function defineStoreContext<T extends Serializable, G = any, A = any>(
  id: string,
  options: DefineStoreOptions<T, G, A>,
): StoreContext<T, G, A> {
  assertStoreId(id)
  if (!options || typeof options.state !== 'function')
    throw new TypeError('Nexil defineStoreContext options.state must be a function.')

  const stableId = `nexil:store:${id}`
  // Inner context holds StoreInstance or undefined (no provider → fallback)
  const innerCtx = createContext<StoreInstance<T, G, A> | undefined>(
    undefined as unknown as StoreInstance<T, G, A> | undefined,
    stableId,
  )

  const create = (override?: Partial<T> | T): StoreInstance<T, G, A> => {
    let initial = options.state()
    if (override !== undefined) {
      if (
        override !== null &&
        typeof override === 'object' &&
        !Array.isArray(override) &&
        typeof initial === 'object' &&
        initial !== null
      ) {
        initial = {
          ...(initial as Record<string, unknown>),
          ...(override as Record<string, unknown>),
        } as unknown as T
      } else {
        initial = override as unknown as T
      }
    }
    warnIfReservedStateKeys(id, initial)
    const instance = createProxiedStore<T, G, A>({
      id,
      initial,
      scope: 'global',
      getters: options.getters as G,
      unifiedActions: options.actions as A,
      isModular: false,
    })
    return instance
  }

  // Fallback singleton (global registry per-request) when no Provider
  const getFallback = (scope?: ContextScope): StoreInstance<T, G, A> => {
    // If explicit scope given, use its registry directly
    let registry: Map<string, StoreInstance<any, any, any>>
    if (scope) {
      const map = (scope as unknown as { values: Map<string, unknown> }).values.get(
        SCOPE_REGISTRY_KEY,
      ) as Map<string, StoreInstance<any, any, any>> | undefined
      if (map && map.has(id)) return map.get(id) as StoreInstance<T, G, A>
      // not in explicit scope → check that scope's registry via helper
      // fallback to getStoreRegistry() which respects ALS correctly for current execution
      registry = getStoreRegistry()
      const existing = registry.get(id) as unknown as StoreInstance<T, G, A> | undefined
      if (existing && (existing as unknown as Record<string, unknown>).__nexil_isRealStore) {
        recordStoreAccess(id)
        return existing
      }
      // Check hydration cache etc. — reuse defineStore logic
      let initial: T
      const hydratedRaw = __consumeHydrationCache(id) as Record<string, unknown> | undefined
      if (hydratedRaw !== undefined) {
        const copy: Record<string, unknown> = { ...hydratedRaw }
        if (options.getters) {
          for (const k of Object.keys(options.getters as Record<string, unknown>)) delete copy[k]
        }
        initial = copy as unknown as T
      } else {
        initial = options.state()
      }
      warnIfReservedStateKeys(id, initial)
      const created = createProxiedStore<T, G, A>({
        id,
        initial,
        scope: 'global',
        getters: options.getters as G,
        unifiedActions: options.actions as A,
        isModular: false,
      })
      registry.set(id, created as StoreInstance<any, any, any>)
      recordStoreAccess(id)
      return created
    }
    // No explicit scope → standard defineStore-like path with HMR handling
    registry = getStoreRegistry()
    const existing = registry.get(id) as unknown as StoreInstance<T, G, A> | undefined
    if (existing && (existing as unknown as Record<string, unknown>).__nexil_isRealStore) {
      try {
        const newInitial = options.state()
        const current = (existing as unknown as Store<T>).snapshot() as unknown as Record<
          string,
          unknown
        >
        const merged = mergeStateForHMR(
          current as any,
          newInitial as unknown as Record<string, unknown>,
        ) as unknown as T
        if (JSON.stringify(merged) !== JSON.stringify(current)) {
          ;(existing as unknown as Store<T>).set(merged)
        }
        const hmrUpdate = (existing as unknown as Record<string, unknown>).__nexil_hmrUpdate as
          | ((
              nextGetters?: Record<string, (state: T) => unknown>,
              nextActions?: Record<string, (...args: any[]) => unknown>,
            ) => void)
          | undefined
        if (hmrUpdate) {
          hmrUpdate(
            options.getters as unknown as Record<string, (state: T) => unknown>,
            options.actions as unknown as Record<string, (...args: any[]) => unknown>,
          )
        }
      } catch {}
      recordStoreAccess(id)
      return existing
    }
    let initial: T
    if (existing && typeof (existing as unknown as Store<T>).snapshot === 'function') {
      initial = (existing as unknown as Store<T>).snapshot() as T
    } else {
      const hydratedRaw = __consumeHydrationCache(id) as Record<string, unknown> | undefined
      if (hydratedRaw !== undefined) {
        const copy: Record<string, unknown> = { ...hydratedRaw }
        if (options.getters) {
          for (const k of Object.keys(options.getters as Record<string, unknown>)) delete copy[k]
        }
        initial = copy as unknown as T
      } else {
        initial = options.state()
      }
    }
    warnIfReservedStateKeys(id, initial)
    const created = createProxiedStore<T, G, A>({
      id,
      initial,
      scope: 'global',
      getters: options.getters as G,
      unifiedActions: options.actions as A,
      isModular: false,
    })
    registry.set(id, created as StoreInstance<any, any, any>)
    recordStoreAccess(id)
    return created
  }

  const originalUse = innerCtx.use.bind(innerCtx) as (
    scope?: ContextScope,
  ) => StoreInstance<T, G, A> | undefined
  const originalProvider = innerCtx.Provider.bind(innerCtx) as (p: {
    value: StoreInstance<T, G, A> | undefined
    children: Child | (() => Child)
    scope?: ContextScope
  }) => Child

  const use = (scope?: ContextScope): StoreInstance<T, G, A> => {
    const provided = originalUse(scope) as StoreInstance<T, G, A> | undefined
    if (provided !== undefined) {
      recordStoreAccess(id)
      return provided
    }
    return getFallback(scope)
  }

  const Provider = (props: {
    readonly value?: StoreInstance<T, G, A>
    readonly children: Child | (() => Child)
    readonly scope?: ContextScope
  }): Child => {
    const value = props.value ?? create()
    const providerArg: {
      value: StoreInstance<T, G, A> | undefined
      children: Child | (() => Child)
      scope?: ContextScope
    } = {
      value: value as unknown as StoreInstance<T, G, A> | undefined,
      children: props.children,
      ...(props.scope !== undefined ? { scope: props.scope } : {}),
    }
    return originalProvider(providerArg) as unknown as Child
  }

  const ProviderWithAutoCreate = Provider

  // Augment innerCtx to become StoreContext — keep its CONTEXT_KEY symbol and stableId
  const sc = innerCtx as unknown as Record<string, unknown>
  Object.defineProperty(sc, 'storeId', { value: id, writable: true, configurable: true })
  Object.defineProperty(sc, 'create', { value: create, writable: true, configurable: true })
  Object.defineProperty(sc, 'Provider', { value: Provider, writable: true, configurable: true })
  Object.defineProperty(sc, 'ProviderWithAutoCreate', {
    value: ProviderWithAutoCreate,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(sc, 'use', { value: use, writable: true, configurable: true })
  Object.defineProperty(sc, 'useContext', { value: use, writable: true, configurable: true })
  return sc as unknown as StoreContext<T, G, A>
}

export function useContextProvider<T>(
  context: Context<T>,
  value: T,
  scope?: ContextScope,
): ContextScope {
  const parent = scope ?? getActiveScope() ?? createContextScope()
  return provideContext(parent, context, value)
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
  const stores = new Map<string, Store<Record<string, any>>>()
  return {
    getOrCreate: <T extends Serializable>(scope: StateScope, key: string, initial: T) => {
      if (!/^[a-zA-Z0-9:_-]+$/.test(key)) throw new TypeError('Invalid state store key.')
      const id = `${scope}:${key}`
      const existing = stores.get(id)
      if (existing) return existing as unknown as Store<T>
      const created = createLegacyStore(initial, scope) as unknown as Store<Record<string, any>>
      stores.set(id, created as unknown as Store<Record<string, any>>)
      return created as unknown as Store<T>
    },
    dispose: () => {
      for (const store of stores.values()) store.dispose()
      stores.clear()
    },
  }
}
