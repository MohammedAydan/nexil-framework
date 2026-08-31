# State Types Guide — The Correct Way to Write and Use State in Nexil

> **Source of truth:** `packages/nexil/src/core/reactivity.ts:14-26`, `packages/nexil/src/core/state.ts:7-19,92-128`, `packages/nexil/src/core/index.ts:1-8,85-98`, `packages/nexil/src/client/index.ts:847-891` and `docs/en/07-state-and-reactivity.md` + `docs/en/25-nexil-stores.md`. Every pattern below compiles against `0.2.1` (`package.json:3` `"version": "0.2.1"`). When in doubt, read the `src/*.ts` files — not this document.

> **Consolidated packages (v0.2.1):** ` @nexil/core` (engine), `@nexil/vite-plugin`, `@nexil/cli`, `create-nexil`. Old split packages `@nexil/reactivity` / `@nexil/state` are now re-exported by `@nexil/core`.

---

## 1. Mental Model — Three Layers, One Rule (0.2.1)

```
@nexil/core/reactivity   primitives   state<T> / computed<T> / resource<T> / effect / batch
        ↓ depends on Serializable
@nexil/core/state        ownership    Store<T> + StoreInstance<T,G,A> + StateRegistry + proxy
        ↓ re-exported by
@nexil/core              composition  For / Show / Context<T> + re-exports of reactivity + css/media/og-image
        ↓ compiled by
@nexil/vite-plugin       resumability  JSON-literal initial → data-nx-scope → lazy chunk + $stores/* discovery
```

**Single rule:** _If state crosses a browser boundary (initial HTML, lazy handler, global store, SSR payload), it MUST be `Serializable`._ Everything else is a type error at creation time via `isSerializable()` — `packages/nexil/src/core/index.ts:63` and `packages/nexil/src/core/state.ts:60-73`.

```text
Browser boundary = data-nx-scope (handler capture) + __NEXIL_STORES__ (SSR) + __NEXIL_STATE__ + resumability payload
```

---

## 2. Foundation Types

### 2.1 `Serializable` — `packages/nexil/src/core/index.ts:1-8`

```ts
export type Serializable =
  | string
  | number // only finite — NaN / Infinity rejected at runtime
  | boolean
  | null
  | undefined // allowed in object values; stripped by JSON in transit
  | Serializable[]
  | { readonly [key: string]: Serializable }
```

Rejects: functions, class instances (`Date`, `Map`, `Set`), prototypes other than `Object.prototype | null`, circular references, `symbol`.

```ts
import { isSerializable } from '@nexil/core' // re-exported from core/index.ts:63

isSerializable({ count: 1, items: ['a', null] }) // true
isSerializable({ fn: () => {} }) // false — functions not serializable
isSerializable(new Date()) // false — Date prototype !== Object.prototype
isSerializable({ nested: { value: undefined } }) // true (undefined value allowed)
isSerializable(NaN) // false — Number.isFinite guard
```

> **Ideal:** Define your domain state as a plain `type`/`interface` whose fields are all `Serializable`. Need a `Date`? Store `string` (ISO `toISOString()`) and parse at read time. Need `Map`? Store `Record<string, Serializable>`.

**Runtime guard:** `isSerializable(value, seen = new WeakSet())` — `packages/nexil/src/core/index.ts:63-83` checks `null/string/boolean → true`, `number → Number.isFinite`, `object → prototype === Object.prototype | null`, `WeakSet` cycle guard, recursive `Object.values`.

### 2.2 `Signal<T>` vs `ReadableSignal<T>` — `packages/nexil/src/core/reactivity.ts:14-26`

```ts
export interface ReadableSignal<T> {
  (): T // callable read + dependency tracking
  get(): T // alias for ()
  readonly value: T // getter — never assign
  subscribe(listener: () => void): Unsubscribe // 14-20
  dispose(): void
}
export interface Signal<T> extends ReadableSignal<T> {
  set(next: T | ((previous: T) => T)): void // functional updater 22-25
  setValue(next: T): void // direct write, no function overload
}
export interface SignalOptions<T> {
  readonly equals?: (previous: T, next: T) => boolean // default: Object.is 9-12
}
export type Unsubscribe = () => void // 2
```

**Write correctly:**

```ts
import { state, useState, computed } from '@nexil/core' // or '@nexil/core/reactivity'

const count = state<number>(0) // explicit generic when inference widens
const theme = state<'light' | 'dark'>('light')
const profile = state<{ name: string; age: number }>({ name: 'Ada', age: 36 })

const [query, setQuery] = useState<string>('') // tuple — value is Signal<T>

const tags = state<string[]>(['a'], {
  equals: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
})

// ❌ count.value = 1 — readonly getter, compile error
count.set(1)
count.set((prev) => prev + 1)
count.setValue(1)
```

| Method           | Signature            | When                              |
| ---------------- | -------------------- | --------------------------------- |
| `set(next)`      | `T \| ((prev:T)=>T)` | Functional update or you allow it |
| `setValue(next)` | `T`                  | Must store a function _as value_  |

```ts
const cb = state<() => string>(() => 'before')
cb.setValue(() => 'after') // ✅ stores function
cb.set(() => 'after') // ❌ calls updater, not store
// see packages/nexil/src/core/reactivity.test.ts:33
```

Internals `reactivity.ts:33-69`: `activeCollector`, `activeScope`, `batchDepth`, `pendingNotifications`, `evaluatingComputeds` (cycle detection), `track(signal)` + `registerCleanup`.

### 2.3 `computed<T>` and `Resource<T>` — `packages/nexil/src/core/reactivity.ts:27-31,124-242`

```ts
const price = state(100)
const quantity = state(2)
const total = computed(() => price() * quantity()) // ReadableSignal<number> 124-192
const label = computed(() => `${count()} items`) // pure, lazy, memoized

import { resource } from '@nexil/core'
const profile = resource(() => fetchProfile(userId())) // 198-242
profile() // T | undefined
profile.loading() // ReadableSignal<boolean>
profile.error() // ReadableSignal<Error | null>
await profile.refetch() // race-safe via requestId generation token
```

```ts
export interface Resource<T> extends ReadableSignal<T | undefined> {
  readonly loading: ReadableSignal<boolean> // 27-31
  readonly error: ReadableSignal<Error | null>
  refetch(): Promise<void>
}
```

Rules:

- `computed` **pure, synchronous** — no writes, no `Date.now()`/`Math.random()` inside. Cycle throws. Internally `state<T|undefined>` + `schedule` via `pendingNotifications`, `activeCollector` swapping, `registerCleanup(read.dispose)`.
- `resource` loader invoked **immediately** on creation (and each `refetch`). Wrap in `createRoot` if it must be scoped. `loading`/`error` are separate `state`s.

### 2.4 `Store<T>` — `packages/nexil/src/core/state.ts:7-19`

```ts
export type StateScope = 'local' | 'shared' | 'route' | 'layout' | 'global' // 7

export interface Store<T extends Serializable> {
  // 9-19
  readonly scope: StateScope
  readonly value: Signal<T> // root Signal — single source of truth
  readonly snapshot: () => T // cloneSerializable via structuredClone || JSON (60-63)
  readonly set: (next: T | ((previous: T) => T)) => void
  readonly setPath: (path: string, value: unknown) => void // path "user.profile.name"
  readonly lens: <Selected = unknown>(path: string) => Signal<Selected> // writable focused Signal
  readonly select: <Selected>(selector: (value: T) => Selected) => ReadableSignal<Selected> // derived
  readonly subscribe: (listener: () => void) => Unsubscribe
  readonly dispose: () => void
}
```

Helpers `state.ts:21-58`:

- `pathSegments(path)` validates `^[A-Za-z_$][\w$]*$` per segment, rejects leading/trailing `.`
- `getAtPath` / `setAtPath` immutable structural sharing; arrays `[...copy]`, index validated `Number.isInteger`
- `cloneSerializable` → `structuredClone` fallback `JSON.parse(JSON.stringify)`
- `mergeStateForHMR` (0.2.1, 65-86) shallow top-level merge for HMR — adds new keys via clone, removes deleted

### 2.5 `CreateStoreOptions` / `DefineStoreOptions` / `StoreInstance` — `state.ts:92-128`

```ts
export interface CreateStoreOptions<
  T extends Serializable,
  A extends Record<string, (state: T, ...args: any[]) => unknown> = Record<string, never>,
> { // 92-99
  readonly id: string // validated STORE_ID_PATTERN /^[a-zA-Z0-9:_/-]+$/ 130-134
  readonly state: () => T // factory, not value — ensures fresh per-store
  readonly actions?: A // (state: T, ...args) => unknown — will be wrapped with batch
}

export interface DefineStoreOptions<
  T extends Serializable,
  G extends Record<string, (state: T) => unknown> = Record<string, never>,
  A extends Record<string, (this: any, ...args: any[]) => unknown> = Record<string, never>,
> { // 101-109
  readonly state: () => T
  readonly getters?: G // (state: T) => unknown — become computed ReadableSignals
  readonly actions?: A // (this: StoreInstance, ...args) => unknown — this is proxied store
}

type PublicAction<F, T> = /* strips first state/this param */ // 111-118

export type StoreInstance<
  T extends Serializable,
  G extends Record<string, (state: T) => unknown> = Record<string, never>,
  A extends Record<string, (...args: any[]) => unknown> = Record<string, never>,
> = Store<T> &
  T & { // 119-128 — proxied direct access: store.count, store.items
    readonly [K in keyof G]: G[K & string] extends (state: T) => infer R ? R : unknown
  } & {
    readonly [K in keyof A]: PublicAction<A[K & string], T>
  }
```

Two APIs:

```ts
// Modular (file-split, preferred for large stores) — id + factory
export function createStore<T, A>(options: CreateStoreOptions<T, A>): () => StoreInstance<T, {}, A>
export function createStore<T>(initial: T, scope?: StateScope): Store<T> // legacy 945-956 (keeps scope param)

// Unified (single file, this-aware) — most ergonomic 0.2.1
export function defineStore<T, G, A>(
  id: string,
  options: DefineStoreOptions<T, G, A>,
): () => StoreInstance<T, G, A> // 1085-1089
```

Example:

```ts
// stores/counter.ts — unified
import { defineStore } from '@nexil/core' // re-exported from state.ts

export const useCounter = defineStore('counter', {
  state: () => ({ count: 0, mode: 'resumable' as const }),
  getters: {
    doubled: (s) => s.count * 2, // become store.doubled (ReadableSignal)
  },
  actions: {
    inc() {
      this.count++
    }, // this is StoreInstance — proxied, batched, serializable-checked
    setMode(mode: 'resumable' | 'static') {
      this.mode = mode
    },
  },
})
const counter = useCounter() // StoreInstance<{count:number}, {doubled:number}, {inc():void}>
counter.count // 0 — via Proxy get
counter.doubled // 0 — getter
counter.inc()
```

```ts
// stores/cart — modular split
// types/cart.ts: type CartState = { items: CartItem[]; total: number }
// actions/cart.ts: export const actions = { add(state: CartState, item: CartItem) { return { ...state, items: [...state.items, item] } } }
// store.ts: import { createStore } from '@nexil/core'; export const useCart = createStore<CartState, typeof actions>({ id: 'cart', state: () => ({items:[],total:0}), actions })
```

`StoreInstance` is `Store<T> & T` — direct property access `store.count` is proxied to `getAtPath`/`setAtPath` with `set` + `isSerializable` guard and `RESERVED_KEYS` check (`value`, `snapshot`, `set`, `setPath`, `lens`, `select`, `subscribe`, `dispose`, `scope` — `state.ts:152,395-405` dev warn if initial contains them).

### 2.6 `StateRegistry` — `state.ts:1146-1172`

```ts
export interface StateRegistry {
  // 1146-1153
  readonly getOrCreate: <T extends Serializable>(
    scope: StateScope,
    key: string,
    initial: T,
  ) => Store<T>
  readonly dispose: () => void
}
export function createStateRegistry(): StateRegistry // 1155-1172 — Map<`${scope}:${key}`, Store>
```

Scope handling 0.2.1: `getStoreRegistry()` / `getAccessLog()` are **ALS-aware** — `getActiveScope() ?? globalThis.__nexil_buildRequestContext?.scope ?? global` (`state.ts:186-202`). Per-request registry via `ContextScope` (`__nexil:stores:registry` / `__nexil:stores:access`), not a module singleton. Previous `StateScope` param on `createStore` is now legacy — new stores hardcode `scope:'global'` internally and lifetime is governed by registry + `ContextScope`.

```ts
import { createStateRegistry } from '@nexil/core'
const registry = createStateRegistry()
const cart = registry.getOrCreate('shared', 'cart', { items: [], total: 0 })
const prefs = registry.getOrCreate('global', 'preferences', { theme: 'light' as const })
registry.dispose() // disposes all stores it created
```

Keys validated `STORE_ID_PATTERN` `/^[a-zA-Z0-9:_/-]+$/` for `id` and `/^[A-Za-z_$][\w$]*$/` per path segment.

---

## 3. Writing State Types Correctly

### 3.1 Define a Domain Type First

```ts
// types/cart.ts
export type CartItem = {
  readonly id: string
  readonly title: string
  readonly qty: number
  readonly price: number
}
export type CartState = {
  readonly items: readonly CartItem[]
  readonly total: number
  readonly currency: 'USD' | 'EUR'
}

// stores/cart.ts
import { defineStore } from '@nexil/core'
import type { CartState } from '../types/cart'

export const useCart = defineStore('cart', {
  state: () => ({ items: [], total: 0, currency: 'USD' }) as CartState,
  getters: { itemCount: (s) => s.items.length },
  actions: {
    add(item: CartItem) {
      this.items = [...this.items, item]
    },
  },
})
// ✅ one canonical CartState reused by store, selectors, loader, validation
// ✅ readonly fields — stores enforce immutable updates via proxy set + isSerializable
```

### 3.2 Prefer Explicit Generics on Boundaries

```ts
const t1 = state('light') // Signal<string> — widened
const t2 = state<'light' | 'dark'>('light') // ✅ locked union
const t3 = defineStore('prefs', { state: () => ({ theme: 'light' as const }), getters: {} }) // theme is 'light' literal, add generic to lock union

type LoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: string[] }
  | { readonly status: 'error'; readonly message: string }
const loader = state<LoadState>({ status: 'idle' })
```

### 3.3 Choosing a Scope

| Scope             | Lifetime                                                 | Ideal for                    | Example key      |
| ----------------- | -------------------------------------------------------- | ---------------------------- | ---------------- |
| `local` (default) | 1 component instance                                     | Toggle, input draft          | N/A              |
| `shared`          | Shared owner (registry)                                  | Cart seen by header + drawer | `cart`           |
| `route`           | Current route                                            | Search results               | `search:results` |
| `layout`          | Layout subtree                                           | Locale, section nav          | `locale`         |
| `global`          | Browser document until reload; survives Link outlet swap | Theme, anonymous cart        | `preferences`    |

```ts
const menu = state(false) // local — no registry

const registry = createStateRegistry()
const results = registry.getOrCreate('route', 'search-results', { items: [], query: '' })
const prefs = registry.getOrCreate('global', 'preferences', { theme: 'light' as const })
// dispose with owner: registry.dispose() or store.dispose()
```

> Never make everything `global`. Prefer `route`/`layout`.

### 3.4 Updates — `set`, `setPath`, `lens`, `select`, Proxy

```ts
type UserState = { readonly user: { readonly profile: { readonly name: string } }; readonly count: number }
const store = useUser() // StoreInstance<UserState>

store.count++ // ✅ proxied — triggers set + isSerializable + batch
store.set((prev) => ({ ...prev, count: prev.count + 1 })) // whole-state
store.setPath('user.profile.name', 'Eve') // deep path, immutable clone, validated segments
store.user.profile.name = 'Eve' // ✅ same as setPath via Proxy set trap

const name: Signal<string> = store.lens<string>('user.profile.name') // writable focused Signal
name.set('Noor'); store.snapshot().user.profile.name // 'NOOR'

const itemCount: ReadableSignal<number> = store.select((s) => s.count) // computed, disposed with store
const copy = store.snapshot() // cloneSerializable — detached, safe for SSR
copy.user.profile.name = 'Hacked' // does not affect store

store.push?. // array methods are proxied: push/pop/shift/unshift/splice/sort/reverse are batched via batch+setAtPath (state.ts:420-508)
```

`lens`/`select`/`setPath` all validate paths; `getAtPath`/`setAtPath` do structural sharing.

### 3.5 Signals Captured by Lazy Handlers (`onClick$`) — JSON-Literal Rule

```ts
export default component(() => {
  const count = state(0)          // ✅ literal — serialized to nexil-state.js + data-nx-scope
  const items = state(load())     // ❌ unsupported — build warns, click will not materialize
  return <button onClick$={() => count.set(count() + 1)}>{count()}</button>
})
```

Multiple handlers closing over same `state(0)` share one live `ScopeSignal` in browser keyed by `createScopeId('signal', source)` (`packages/nexil/src/client/index.ts:893`). `nexil-state.js` is public — never secrets.

Limit `MAX_RESUME_DEPTH = 8`, `MAX_RESUME_PAYLOAD_BYTES = 32*1024` (`client/index.ts:5-7`). Compiler serializes only `ScopeRef` kinds `value|signal|store|action|ctx|unsupported` (`client/index.ts:847`).

> **Real-browser findings (0.2.1, `tests/e2e/state-verification.spec.ts`):**
>
> - `String(signal())` inside JSX is **not** an automatic binding — the compiler only lowers bare `signal()` or `store.path`. Use `{signal()}` directly or `bindText$={signal}`. `String(signal())` will render static and never update.
> - `batch(() => ...)` inside an `onClick$` handler is **not** resumable (bare `import { batch }` in the lazy chunk cannot be resolved). Use sequential `set` calls; the runtime already coalesces via `pendingNotifications`.
> - Local `computed(() => local() * 2)` is **not** resumable as an automatic text binding — its initial cannot be statically extracted. Prefer store getters (`defineStore({ getters: { doubled: s => s.count*2 } })`) which are resumable via `data-nx-store-bind`, or keep derived values as `state` and update them manually in the handler (`count.set(n); doubled.set(n*2)`).
> - `resource(() => ...)` for local scope is not resumable for the same reason; use plain `state` with manual `setTimeout`/`fetch` inside an `onClick$` handler.
> - Store hooks may be `useCounter` **or** `useCounterStore` (0.2.1 fixes a regex that previously required the `Store` suffix). `$stores/counter` virtual is resolved via `useCounter`.
> - `Context.Provider` JSX children are evaluated **before** the Provider sets the scope. For SSR to see the provided value, pass children as a function: `Ctx.Provider({ value: "dark", children: () => <span>{Ctx.use()}</span> })`. Plain `<Ctx.Provider value="dark"><span>{Ctx.use()}</span></Ctx.Provider>` will read the default.

### 3.6 Context — Explicit Shared Ownership (0.2.1 ALS + Explicit Stack)

```ts
import { createContext, createContextScope, provideContext, state } from '@nexil/core'

const Theme = createContext(state<'light' | 'dark'>('light'), 'app:theme')

export function ThemeSection() {
  const theme = state<'light' | 'dark'>('dark')
  return Theme.Provider({ value: theme, children: () => <button onClick$={() => Theme.use().set('light')}>Use light</button> })
}

// SSR/request isolation — explicit scope, never singleton
import { createRequestContext, runWithScope } from '@nexil/core'
export async function handleRequest(request: Request) {
  const ctx = createRequestContext(request) // ctx.scope is request-owned
  return runWithScope(ctx.scope, async () => {
    const userScope = provideContext(ctx.scope, CurrentUser, { id: 'u_42' })
    const user = CurrentUser.use(userScope)
    // or Provider with explicit scope:
    // return CurrentUser.Provider({ scope: ctx.scope, value: { id: 'u_42' }, children: () => ... })
  })
}
```

Rules `core/index.ts:157-169, 171-226`:

- `Provider` children must resolve **synchronously** — async throws (`deepResolve` 299-329).
- For async work, carry scope explicitly via `withContext(scope, ctx, value, render)` or `provideContext` + `runWithScope`.
- 0.2.1 `getActiveScope()` = `als.getStore() ?? getExplicitScope()` (`getExplicitStack` at `globalThis.__nexil:explicitScopeStack`), `runWithScope` pushes/pops with `Promise.finally` for Cloudflare/Deno (tested `edge-isolation.test.ts`).
- Context values not serialized automatically; use `global` store if browser persistence needed.

### 3.7 Effects, Watch, Batch, Untrack, Lifecycle — `packages/nexil/src/core/reactivity.ts:264-323`

```ts
import { state, computed, effect, watch, batch, untrack, createRoot, onCleanup } from '@nexil/core'

const count = state(0)
const stop = effect(() => {
  document.title = `Count: ${count()}`
}) // side effects only
// stop() disposes; auto-disposed when its createRoot owner disposes

watch(
  () => count(),
  (value, prev) => console.log(prev, '→', value),
) // 289-301 Object.is diff, initialized flag

batch(() => {
  firstName.set('Sarah')
  lastName.set('Ali')
}) // one notification 244-252

const price = state(100)
const derived = computed(() => untrack(() => price()) * 2) // 254-262 won't re-run on price

const { dispose } = (() => {
  let dispose!: () => void
  createRoot((d) => {
    dispose = d
    const s = state(1)
    effect(() => console.log(s()))
    onCleanup(() => console.log('root cleaned')) // 321-323
    return null
  })
  return { dispose }
})()
```

> Never create module-level `effect` depending on route/user state. Always inside `createRoot` per request/component.

### 3.8 Fine-Grained Bindings — `client/index.ts:264-344,473-644`

```ts
export default component(() => {
  const count = state(0)
  const disabled = state(false)
  return (
    <section>
      <output>{count()}</output> {/* auto-lowered when compiler can prove target */}
      <button bindDisabled$={disabled}>Save</button>
      <p bindText$={computed(() => `${count()} items`)}>0 items</p>
      {/* store-path bindings (Level 2) — new 0.2.1 */}
      <p bindText$={store.lens('user.profile.name')}>Ada</p>
      <span data-nx-store-bind="cart:items.length#text">0</span>
    </section>
  )
})
```

Directives (`bindText$`, `bindValue$`, `bindChecked$`, `bindDisabled$`, `bindHidden$`, `bindClass$`, `bindStyle$`, `bindHref$`, `bindSrc$`, `bindAriaLabel$`) → `data-nx-bind="nx:signal:<id>#<target>"` or `data-nx-store-bind="storeId:path#target"` (`client/index.ts:473`). Runtime `bindReadableSignalToDOM` / `bindStorePathBindings` installs one `effect` per binding.

Store-path signals: `__getStorePathSignal` / `__linkPendingStorePathSignals` share pending `Map<string,Set<Signal>>` at `__nexil:store-path:pending` (`state.ts:302-391`), with `__nexil_getterSignals` and hydration seeding from `__NEXIL_STORES__` DOM.

---

## 4. File Organization — Where State Types Live (0.2.1)

```
src/
├── types/
│   ├── cart.ts            # CartState, CartItem — pure Serializable
│   └── preferences.ts     # PreferenceState
├── stores/
│   ├── cart/              # modular — preferred for large stores (discovery: src/stores/*/store.ts wins)
│   │   ├── types.ts
│   │   ├── actions.ts     # (state: CartState, item: CartItem) => CartState
│   │   └── store.ts       # createStore<CartState, typeof actions>({ id: 'cart', state: () => initial, actions })
│   ├── counter.ts         # unified — defineStore('counter', { state: () => ..., getters: {}, actions: { inc() { this.count++ } } })
│   └── registry.ts        # createStateRegistry() singleton + typed helpers
├── routes/
│   ├── products/index.tsx # registry.getOrCreate('route', 'search-results', ...)
│   └── _layout.tsx        # layout-scoped + Context.Provider
└── components/
    └── article-filter.tsx # local state via state() / useState()
```

Discovery (0.2.1, `packages/vite-plugin/src/stores.ts`):

- Scans `src/stores/` — modular `store.ts` wins over unified file.
- Generates `virtual:nexil-stores` + `$stores/*` aliases via `resolveId/load`, writes `.nexil/stores.d.ts`.
- `transform.ts` wraps actions with `batch` via `wrapActionsWithBatch` (Babel `@babel/parser` + `magic-string`).

Typed registry helper:

```ts
// stores/registry.ts
import { createStateRegistry } from '@nexil/core'
import type { CartState } from '../types/cart'

const registry = createStateRegistry()
export const getCartStore = () =>
  registry.getOrCreate<CartState>('shared', 'cart', { items: [], total: 0, currency: 'USD' })
export const getPrefsStore = () =>
  registry.getOrCreate<PreferenceState>('global', 'preferences', { theme: 'light' })
// caller gets Store<CartState> — no casts
```

---

## 5. SSR & Security — Isolation Checklist (0.2.1)

- **Never** store request-private data in module singleton `state`/`createStore`. Create per `createRequestContext` + `runWithScope` (or render owner).
- **Never** put secrets in `global` store or handler-captured signal — `nexil-state.js` + `__NEXIL_STORES__` are public (`<script type="nexil/state" id="__NEXIL_STORES__">` via `__getStoresScriptTag` 245-251 with `replace(/</g,'\\u003c')`).
- **Always** dispose `registry.dispose()` / `store.dispose()` / `effect` when owner unmounts or request ends.
- **Always** validate at boundary: `isSerializable()` before `set()`, Zod/Valibot before hydration.
- **ALS + explicit stack:** `getActiveScope()` → `als.getStore() ?? getExplicitScope()`; for Cloudflare/Deno (no `AsyncLocalStorage`) you **must** `await runWithScope(scope, ...)` — fire-and-forget leaks (`plans/nexil-stores/review.md`).
- **Per-request registry:** `getStoreRegistry()` checks `ContextScope` `__nexil:stores:registry` then `globalThis.__nexil_buildRequestContext` then `globalThis` (`state.ts:186-202`). SSR records only accessed stores (`__snapshotAccessedStores` 225-243, warns in dev else throws if not serializable).

---

## 6. Anti-Patterns — What Not To Do

| Anti-pattern                                                           | Why it fails                                             | Fix                                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `state(new Date())`                                                    | `Date` prototype fails `isSerializable` — throws         | `state('2026-08-29T00:00:00Z')` + parse                                 |
| `defineStore('x', { state: () => ({ fn: () => {} }) })`                | Function rejected `state.ts:60`                          | Store data only; functions in module scope                              |
| `s.value = 1`                                                          | `value` is readonly getter                               | `s.set(1)` / `s.setValue(1)` / `s.count++` via Proxy                    |
| `computed(() => { count.set(1); return count() })`                     | Cycle — throws                                           | Never write inside computed                                             |
| Module-level `effect(() => routeSignal())`                             | No owner → leaks across requests                         | `createRoot` per request/component                                      |
| `store.setPath('user..name','x')`                                      | `/^[\w$]+$/` per segment — throws                        | `'user.profile.name'`                                                   |
| Everything in `global`                                                 | Coupling + no disposal + persists across Link            | `local`/`route`/`layout` default                                        |
| `state(load())` captured by `onClick$`                                 | Not JSON literal → `unsupported`                         | `resource(() => load())`                                                |
| `store.select(() => Date.now())`                                       | Impure — breaks memoization                              | Pure `(value) => value.items.length`                                    |
| State key named `value`                                                | Shadows `Store.value` — dev warn `RESERVED_KEYS`         | Rename key (e.g., `amount`)                                             |
| `String(signal())` in JSX                                              | Not a direct binding — compiler skips `String()` wrapper | Use `{signal()}` or `bindText$={signal}`                                |
| `batch(() => ...)` inside `onClick$`                                   | Bare import in lazy chunk not resolved                   | Use sequential `set` calls                                              |
| `<Ctx.Provider><span>{Ctx.use()}</span></Ctx.Provider>`                | Child evaluated before scope is set                      | Use `Ctx.Provider({ value, children: () => <span>{Ctx.use()}</span> })` |
| Deep `mergeStateForHMR` expectation                                    | HMR shallow top-level only (`state.ts:65-86`)            | Replace whole nested object on shape change                             |
| Fire-and-forget `runWithScope(scope, async () => ...)` without `await` | Explicit stack leak                                      | `await runWithScope(...)`                                               |

---

## 7. End-to-End Examples (0.2.1)

### 7.1 Local Component State — `examples/nexil-workbench/src/components/article-filter.tsx:1-16`

```ts
import { computed, state } from '@nexil/core'
export function ArticleFilter() {
  const active = state(false)
  const inactive = computed(() => !active())
  return (
    <section aria-labelledby="filter-title">
      <h2 id="filter-title">Filter articles</h2>
      <button aria-pressed={active()} onClick$={() => active.set(!active())}>Toggle release-ready</button>
      <p bindHidden$={active}>Showing every article.</p>
      <p bindHidden$={inactive}>Showing release-ready.</p>
    </section>
  )
}
```

### 7.2 Unified Store with Getters/Actions — `packages/nexil/src/core/stores-proxy.test.ts:30-80`

```ts
import { defineStore } from '@nexil/core'

export const useCounter = defineStore('counter', {
  state: () => ({ count: 0, items: [] as string[] }),
  getters: {
    doubled: (s) => s.count * 2, // becomes StoreInstance.doubled (ReadableSignal)
    totalPrice: function () {
      return this.items.length * 10
    }, // this-aware also supported
  },
  actions: {
    inc() {
      this.count++
    }, // this is proxied, batched, isSerializable-checked
    addItem(item: string) {
      this.items = [...this.items, item]
    },
  },
})
const c = useCounter()
c.inc()
c.doubled // 2
c.lens<number>('count').set(5)
```

### 7.3 Shared Store via Registry

```ts
import { createStateRegistry } from '@nexil/core'
const registry = createStateRegistry()
export const getCart = () => registry.getOrCreate('shared', 'cart', { items: [], total: 0 })
// getCart().select(s => s.total), getCart().lens('total'), getCart().snapshot()
```

### 7.4 Route-Scoped + Batch — `examples/nexil-showcase/src/routes/labs.tsx:23`

```ts
import { createStateRegistry } from '@nexil/core'
import { batch, computed, state } from '@nexil/core'

const registry = createStateRegistry()
const labStore = registry.getOrCreate('route', 'lab-counter', {
  clicks: 0,
  mode: 'resumable' as const,
})
const local = state(3)
const derived = computed(() => local() * 3)
batch(() => {
  local.set(4)
  local.set(5)
}) // one notification
labStore.select((s) => s.clicks)
```

### 7.5 Global Browser Store (Survives Link)

```ts
import { defineStore } from '@nexil/core'
export const usePrefs = defineStore('preferences', {
  state: () => ({ theme: 'light' as const, reducedMotion: false }),
  getters: {},
  actions: {},
})
// via registry for stable identity across HMR:
import { createStateRegistry } from '@nexil/core'
const registry = createStateRegistry()
export const prefs = registry.getOrCreate('global', 'showcase-preferences', {
  theme: 'deep-sea' as const,
  reducedMotion: false,
})
```

### 7.6 Async Resource

```ts
import { resource } from '@nexil/core'
type User = { readonly id: string; readonly name: string }
const user = resource<User>(() => fetch(`/api/user/${id()}`).then((r) => r.json()))
user.loading()
user.error()
user()
await user.refetch()
```

### 7.7 SSR Edge Isolation (0.2.1)

```ts
import { createRequestContext, runWithScope, createStateRegistry } from '@nexil/core'

export async function handleEdge(request: Request) {
  const ctx = createRequestContext(request)
  return runWithScope(ctx.scope, async () => {
    const registry = createStateRegistry() // per-request via ctx.scope
    const store = registry.getOrCreate('global', 'prefs', { theme: 'light' as const })
    store.theme = 'dark' // isolated to this request
    await new Promise((r) => setTimeout(r, 5))
    // concurrent edge-a / edge-b remain isolated — see edge-isolation.test.ts
    return new Response('ok')
  })
}
```

---

## 8. TypeScript Tips for State Authors

```ts
type CartState = ReturnType<typeof cartStore.snapshot> // derive without duplicating
const initial = { theme: 'light', reducedMotion: false } satisfies PreferenceState

type Brand<K, T> = K & { readonly __brand: T }
type UserId = Brand<string, 'UserId'>
type AppState = { readonly currentUserId: UserId | null }

type SignalValue<S> = S extends { (): infer V } ? V : never
type CountValue = SignalValue<typeof count> // number

// StoreInstance direct access is typed: store.count is number, not unknown
// If you see unknown, add generic to lens/select: store.lens<number>('count'), store.select<number>(s => s.count)
```

---

## 9. Quick Reference — Import Map (0.2.1 Consolidated)

| What                                                                                                                                   | Import from                                                 | Type              |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------- |
| `Serializable`, `isSerializable`                                                                                                       | `@nexil/core` (re-export `core/index.ts:1`)                 | type + guard      |
| `state`, `useState`, `computed`, `effect`, `watch`, `batch`, `untrack`, `createRoot`, `onCleanup`, `resource`                          | `@nexil/core` (or `core/reactivity.ts`)                     | functions         |
| `Signal<T>`, `ReadableSignal<T>`, `Resource<T>`, `SignalOptions<T>`, `Unsubscribe`                                                     | `@nexil/core`                                               | types             |
| `Store<T>`, `StoreInstance<T,G,A>`, `StateRegistry`, `StateScope`, `CreateStoreOptions`, `DefineStoreOptions`                          | `@nexil/core` (re-export `core/state.ts`)                   | types             |
| `createStore` (legacy `initial,scope` + `id,state,actions`), `defineStore`, `createStateRegistry`                                      | `@nexil/core`                                               | functions         |
| `createContext`, `createContextScope`, `provideContext`, `withContext`, `Context<T>`, `ContextScope`, `getActiveScope`, `runWithScope` | `@nexil/core`                                               | functions + types |
| `For`, `Show`, `ErrorBoundary`, `Suspense`, `Form`, `SubmitButton`                                                                     | `@nexil/core`                                               | components        |
| `RESUMABILITY_BOOTSTRAP`, `bootstrapResumability`                                                                                      | `@nexil/core/client` (or via `@nexil/core`)                 | constants         |
| `$stores/*`, `virtual:nexil-stores`                                                                                                    | vite-plugin discovery (auto)                                | virtual           |
| `__getStoresScriptTag`, `__snapshotAccessedStores`, `hydrateNexilStoresFromDocument`                                                   | internal SSR/client (`state.ts:245`, `client/index.ts:417`) | SSR               |

> Old imports `@nexil/reactivity` / `@nexil/state` still work but are now re-exports from `@nexil/core` — prefer `@nexil/core`.

---

## 10. Verification Checklist (Use Before Merging State Code)

- [ ] Every stored type extends `Serializable` — `isSerializable` throws at `set` and `__snapshotAccessedStores` warns/throws
- [ ] `state`/`defineStore` initial is JSON literal when captured by `onClick$`; `pnpm build` no `unsupported` warnings, `data-nx-scope` present
- [ ] Each `computed` pure, synchronous, cycle-free; no `set()` inside
- [ ] Every `effect`/`watch`/`computed`/`resource` has owner (`createRoot` or route lifetime) and is disposed
- [ ] `global` stores contain only public, non-secret, serializable browser state
- [ ] Registry keys `/^[a-zA-Z0-9:_/-]+$/`, store paths `/^[A-Za-z_$][\w$]*$/` per segment, no reserved keys (`value`, `snapshot`, etc.)
- [ ] `snapshot()` clones are detached (never mutate to affect live state)
- [ ] Request-private state created per `createRequestContext` + `runWithScope`, never module singleton
- [ ] Selectors pure `(value) => ...` — no side effects
- [ ] `batch` only for true transactions
- [ ] HMR: shallow `mergeStateForHMR` — expect top-level preservation only; deep shape changes replace whole branch
- [ ] Edge: `await runWithScope` — no fire-and-forget

---

_Last verified against:_ `packages/nexil/src/core/reactivity.ts:323`, `packages/nexil/src/core/state.ts:1172`, `packages/nexil/src/core/index.ts:482`, `packages/nexil/src/client/index.ts:1207`, `docs/en/07-state-and-reactivity.md:212`, `docs/en/25-nexil-stores.md:262` on `0.2.1`. Run `pnpm exec tsc --noEmit && pnpm test` (40 files, 319 tests) to confirm no drift._
