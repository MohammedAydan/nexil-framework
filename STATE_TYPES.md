# State Types Guide — The Correct Way to Write and Use State in Nexil

> **Source of truth:** TypeScript declarations in `packages/reactivity/src/index.ts:14-26`, `packages/state/src/index.ts:5-130`, `packages/core/src/index.ts:1-8` and the runtime docs in `docs/en/07-state-and-reactivity.md`. Every pattern below compiles against those contracts; when in doubt, read the `src/index.ts` files — not this document.

---

## 1. Mental Model — Three Layers, One Rule

```
@nexil/reactivity   primitives    state<T> / computed<T> / resource<T> / effect / batch
        ↓ depends on Serializable
@nexil/state        ownership     Store<T extends Serializable> + StateRegistry + StateScope
        ↓ re-exported by
@nexil/core         composition   For / Show / Context<T> + re-exports of reactivity
        ↓ compiled by
@nexil/vite-plugin  resumability  JSON-literal initial → data-nx-scope → lazy chunk materialization
```

**Single rule:** _If state crosses a browser boundary (initial HTML, lazy handler, global store), it MUST be `Serializable`._ Everything else is a type error at creation time via `isSerializable()` — `packages/core/src/index.ts:61` and `packages/state/src/index.ts:60-73`.

---

## 2. The Foundation Types

### 2.1 `Serializable` — `packages/core/src/index.ts:1-8`

```ts
export type Serializable =
  | string
  | number // only finite — NaN / Infinity rejected
  | boolean
  | null
  | undefined // allowed in object values; stripped by JSON
  | Serializable[]
  | { readonly [key: string]: Serializable }
```

What it **rejects**: functions, class instances (`Date`, `Map`, `Set`), prototypes other than `Object.prototype | null`, circular references, `symbol`.

```ts
import { isSerializable } from '@nexil/core'

isSerializable({ count: 1, items: ['a', null] }) // true
isSerializable({ fn: () => {} }) // false
isSerializable(new Date()) // false
isSerializable({ nested: { value: undefined } }) // true (undefined value allowed)
```

> **Ideal:** Define your domain state as a plain `type`/`interface` whose fields are all `Serializable`. If you need a `Date`, store `string` (ISO) and parse at read time.

### 2.2 `Signal<T>` vs `ReadableSignal<T>` — `packages/reactivity/src/index.ts:14-26`

```ts
export interface ReadableSignal<T> {
  (): T // callable read + dependency tracking
  get(): T // identical to ()
  readonly value: T // getter alias — never assign to it
  subscribe(listener: () => void): Unsubscribe
  dispose(): void
}

export interface Signal<T> extends ReadableSignal<T> {
  set(next: T | ((previous: T) => T)): void // functional update supported
  setValue(next: T): void // direct assignment (no function overload)
}

export interface SignalOptions<T> {
  readonly equals?: (previous: T, next: T) => boolean // default: Object.is
}
```

**Write them correctly:**

```ts
import { state, useState, computed } from '@nexil/core' // or '@nexil/reactivity'

// ✅ Explicit generic when inference would widen or lose literals
const count = state<number>(0)
const theme = state<'light' | 'dark'>('light')
const profile = state<{ name: string; age: number }>({ name: 'Ada', age: 36 })

// ✅ useState tuple form — ideal for component-local state
const [query, setQuery] = useState<string>('')

// ✅ Custom equality to avoid noisy renders
const tags = state<string[]>(['a'], {
  equals: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
})

// ❌ Never assign to .value — it is readonly getter
// count.value = 1  // compile error — use count.set(1) or count.setValue(1)
```

**Choosing `set` vs `setValue`:**

| Method           | Signature            | Use when                                                                            |
| ---------------- | -------------------- | ----------------------------------------------------------------------------------- |
| `set(next)`      | `T \| ((prev:T)=>T)` | Need functional update or you deliberately allow it                                 |
| `setValue(next)` | `T`                  | Must store a function _as a value_ (see `packages/reactivity/src/index.test.ts:33`) |

```ts
// Storing a function value — must use setValue
const callback = state<() => string>(() => 'before')
callback.setValue(() => 'after') // ✅
callback.set(() => 'after') // ❌ would call the updater, not store it
```

### 2.3 `computed<T>` and `Resource<T>` — `packages/reactivity/src/index.ts:27-31,124-242`

```ts
// Derived — memoized, lazy, cycle-detected
const price = state(100)
const quantity = state(2)
const total = computed(() => price() * quantity()) // ReadableSignal<number>
const label = computed(() => `${count()} items`) // always pure

// Async — race-safe via generation token
import { resource } from '@nexil/core'
const profile = resource(() => fetchProfile(userId()))
profile() // T | undefined
profile.loading() // boolean
profile.error() // Error | null
await profile.refetch()
```

**Rules:**

- `computed` must be **pure and synchronous** — no writes, no `Date.now()`/`Math.random()` inside.
- `resource` loader is invoked **immediately** on creation (and on each `refetch()`). Wrap in `createRoot` if it must be scoped.

### 2.4 `Store<T>` and `StateScope` — `packages/state/src/index.ts:5-18`

```ts
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
```

### 2.6 `StoreInstance`, `DefineStoreOptions`, `CreateStoreOptions` — `packages/state/src/index.ts`

```ts
export interface CreateStoreOptions<
  T extends Serializable,
  A extends Record<string, (state: T, ...args: any[]) => unknown> = Record<string, never>,
> {
  readonly id: string
  readonly state: () => T
  readonly actions?: A
}

export interface DefineStoreOptions<
  T extends Serializable,
  G extends Record<string, (state: T) => unknown> = Record<string, never>,
  A extends Record<string, (this: any, ...args: any[]) => unknown> = Record<string, never>,
> {
  readonly state: () => T
  readonly getters?: G
  readonly actions?: A
}

export type StoreInstance<
  T extends Serializable,
  G extends Record<string, (state: T) => unknown> = Record<string, never>,
  A extends Record<string, (...args: any[]) => unknown> = Record<string, never>,
> = Store<T> &
  T & {
    readonly [K in keyof G]: G[K & string] extends (state: T) => infer R ? R : unknown
  } & {
    readonly [K in keyof A]: PublicAction<A[K & string], T>
  }
```

---

## 3. Writing State Types Correctly — The Ideal Patterns

### 3.1 Define a Domain Type First, Then Create the Store

```ts
// types/cart.ts
export type CartItem = {
  readonly id: string
  readonly title: string
  readonly qty: number
  readonly price: number // store cents as number, not float string
}

export type CartState = {
  readonly items: readonly CartItem[]
  readonly total: number
  readonly currency: 'USD' | 'EUR'
}

// stores/cart.ts
import { createStore } from '@nexil/state'
import type { CartState } from '../types/cart'

const initialCart: CartState = {
  items: [],
  total: 0,
  currency: 'USD',
}

// ✅ Generic inferred from initial; scope explicit
export const cartStore = createStore<CartState>(initialCart, 'shared')

// ✅ If you need literal narrowing, use `as const` on initial OR explicit generic
export const prefsStore = createStore({ theme: 'light' as const }, 'global')
// prefsStore.value().theme is 'light' | ??? — add generic to lock union:
// createStore<{ theme: 'light' | 'dark' }>({ theme: 'light' }, 'global')
```

**Why this is ideal:**

- One canonical `CartState` type reused by store, selectors, loader return, and action validation.
- `readonly` fields prevent accidental mutation — stores enforce immutable updates via `set`.
- No `any`, no `unknown` cast; `Store<T extends Serializable>` guarantees serializability at compile time and runtime.

### 3.2 Prefer Explicit Generics on Boundaries

```ts
// ❌ Widened — TypeScript infers `string`, not the union you intended
const t1 = state('light') // Signal<string>

// ✅ Locked — union preserved
const t2 = state<'light' | 'dark'>('light')
const t3 = createStore<{ theme: 'light' | 'dark' }>({ theme: 'light' }, 'global')

// ✅ Discriminated union — ideal for loading states
type LoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: string[] }
  | { readonly status: 'error'; readonly message: string }

const loader = state<LoadState>({ status: 'idle' })
```

### 3.3 Choosing a Scope — Smallest That Works

| Scope             | Lifetime                                                 | Ideal for                    | Example key                |
| ----------------- | -------------------------------------------------------- | ---------------------------- | -------------------------- |
| `local` (default) | 1 component instance                                     | Toggle, input draft          | N/A — direct `createStore` |
| `shared`          | Shared owner (import singleton or registry)              | Cart seen by header + drawer | `cart`                     |
| `route`           | Current route                                            | Search results, filter query | `search:results`           |
| `layout`          | Layout subtree (all child routes)                        | Locale, section nav          | `locale`                   |
| `global`          | Browser document until reload; survives Link outlet swap | Theme, anonymous cart        | `preferences`              |

```ts
import { createStore, createStateRegistry } from '@nexil/state'

// Local — default, no registry needed
const menu = createStore({ open: false }) // scope === 'local'

// Shared/route/layout/global — use registry so lifetime is explicit
const registry = createStateRegistry()

// Route-scoped — dispose when route unmounts
const results = registry.getOrCreate('route', 'search-results', { items: [], query: '' })

// Global — survives Nexil Link navigation (see docs/en/07-state-and-reactivity.md:128)
const preferences = createStore({ theme: 'light' as const }, 'global')
// OR via registry:
const prefs2 = registry.getOrCreate('global', 'preferences', { theme: 'light' as const })

// At the end of the owning lifetime:
registry.dispose() // disposes every store it created
// or store.dispose() for a standalone store
```

> **Ideal:** Never make everything `global`. Global increases coupling and prevents disposal. Prefer `route`/`layout` for data that should reset on navigation.

### 3.4 Updates — `set`, `setPath`, `lens`, and `select`

```ts
import { createStore } from '@nexil/state'

type UserState = {
  readonly user: { readonly profile: { readonly name: string } }
  readonly count: number
}
const store = createStore<UserState>({ user: { profile: { name: 'Ada' } }, count: 1 })

// 1) Whole-state functional update — preferred for transactional changes
store.set((prev) => ({ ...prev, count: prev.count + 1 }))

// 2) Deep path update without spreading — `setPath` does immutable cloning
store.setPath('user.profile.name', 'Eve') // segments validated /^[\w$]+$/ — packages/state/src/index.ts:20-26

// 3) Writable lens — a Signal focused on a nested path; writes flow back to store
const name = store.lens<string>('user.profile.name')
name() // 'Eve'
name.set('Noor')
name.set((prev) => prev.toUpperCase())
store.snapshot().user.profile.name // 'NOOR'

// 4) Read-only derived selector — computed under the hood, disposed with store
const itemCount = store.select((s) => s.count) // ReadableSignal<number>
itemCount() // re-evaluates only when count changes

// 5) Snapshot — detached structuredClone, safe to pass to JSON/SSR
const copy = store.snapshot()
copy.user.profile.name = 'Hacked' // does not affect store
```

**Typing lenses and selectors:**

```ts
// ✅ Always supply the Selected generic when the path type is not obvious
const theme = store.lens<'light' | 'dark'>('preferences.theme')
const count = store.select<number>((s) => s.items.length)

// ❌ Avoid lens<unknown> propagation — it defeats type safety
const bad = store.lens('user.profile.name') // unknown — forces casts downstream
```

### 3.5 Signals Captured by Lazy Handlers (`onClick$`) — JSON-Literal Rule

The compiler serializes handler-captured signals into `nexil-state.js` and writes an opaque `data-nx-scope` key into HTML. This **only works when the initial value is a JSON literal**:

```ts
import { state } from '@nexil/core'

export default component(() => {
  const count = state(0)          // ✅ literal — serialized, shared across handlers
  const items = state(load())     // ❌ unsupported — build warns, click will not materialize

  return <button onClick$={() => count.set(count() + 1)}>{count()}</button>
})
```

Multiple handlers that close over the **same declaration** share one live signal instance in the browser, keyed by scope id. The contents of `nexil-state.js` are public — never put secrets in a captured signal.

### 3.6 Context — Explicit Shared Ownership (Not a Global)

```ts
import { createContext, createContextScope, provideContext, state } from '@nexil/core'

// 1) Create context with a default value + optional stableId for HMR/dedup
const Theme = createContext(state<'light' | 'dark'>('light'), 'app:theme')
const CurrentUser = createContext<{ id: string } | null>(null, 'app:user')

// 2) Provide synchronously in render
export function ThemeSection() {
  const theme = state<'light' | 'dark'>('dark')
  return Theme.Provider({
    value: theme,
    children: () => <button onClick$={() => Theme.use().set('light')}>Use light</button>,
  })
}

// 3) SSR/request isolation — explicit scope, never a module singleton
import { createRequestContext } from '@nexil/core'

export async function handleRequest(request: Request) {
  const ctx = createRequestContext(request) // ctx.scope is request-owned
  const userScope = provideContext(ctx.scope, CurrentUser, { id: 'u_42' })
  // read with explicit scope in async work:
  const user = CurrentUser.use(userScope)
  // or inside Provider synchronously:
  // return CurrentUser.Provider({ scope: ctx.scope, value: { id: 'u_42' }, children: () => ... })
}
```

**Rules:**

- `Provider` children must resolve **synchronously** — async children throw (`packages/core/src/index.ts:260`).
- For async work, carry scope explicitly via `withContext(scope, ctx, value, run)` or `provideContext`.
- Context values are **not serialized** to the client automatically; use a `createStore(..., 'global')` if you need browser persistence.

### 3.7 Effects, Watch, Batch, Untrack, and Lifecycle

```ts
import { state, computed, effect, watch, batch, untrack, createRoot, onCleanup } from '@nexil/core'

// Effect — side effects only, never for derived values
const count = state(0)
const stop = effect(() => {
  document.title = `Count: ${count()}`
})
// → stop() disposes tracking
// → effect is auto-disposed when its createRoot owner disposes

// Watch — observe without deriving
watch(
  () => count(),
  (value, prev) => console.log(prev, '→', value),
)

// Batch — one notification for a transaction
const first = state('Ada')
const last = state('Lovelace')
batch(() => {
  first.set('Sarah')
  last.set('Ali')
})

// Untrack — read without subscribing
const price = state(100)
const derived = computed(() => untrack(() => price()) * 2) // won't re-run when price changes

// Scoped lifecycle — every effect/computed/resource must belong to a root/owner
const { dispose } = (() => {
  let dispose!: () => void
  createRoot((d) => {
    dispose = d
    const s = state(1)
    effect(() => console.log(s()))
    onCleanup(() => console.log('root cleaned'))
    return null
  })
  return { dispose }
})()
// dispose() cleans all effects/computeds/resources created inside the root
```

> **Ideal:** Never create a module-level `effect` that depends on route/user state. Always create it inside `createRoot` or a component/route owner so it can be disposed.

### 3.8 Rendering with Fine-Grained Bindings (No Hydration)

```ts
import { state } from '@nexil/core'

export default component(() => {
  const count = state(0)
  const disabled = state(false)

  return (
    <section>
      {/* Auto-lowered when the compiler can prove target — direct signal read */}
      <output>{count()}</output>
      <button bindDisabled$={disabled}>Save</button>

      {/* Explicit directive — required for non-trivial expressions or scalar props */}
      <p bindText$={computed(() => `${count()} items`)}>0 items</p>
      <input bindValue$={query} bindHidden$={computed(() => query().length === 0)} />
    </section>
  )
})
```

Supported directives: `bindText$`, `bindValue$`, `bindChecked$`, `bindDisabled$`, `bindHidden$`, `bindClass$`, `bindStyle$`, `bindHref$`, `bindSrc$`, `bindAriaLabel$` → targets `text | value | checked | disabled | hidden | class | style | href | src | aria-*`. The runtime installs an `effect()` per binding; disposal removes the subscription without re-rendering the component.

---

## 4. File Organization — Where State Types Live

```
src/
├── types/
│   ├── cart.ts            # CartState, CartItem — pure Serializable types
│   ├── preferences.ts     # PreferenceState
│   └── loaders.ts         # API response types reused by resource<T>
├── stores/
│   ├── cart.ts            # createStore<CartState>(initial, 'shared')
│   ├── preferences.ts     # createStore<PreferenceState>(..., 'global')
│   └── registry.ts        # createStateRegistry() singleton + typed helpers
├── routes/
│   ├── products/index.tsx # route-scoped state via registry.getOrCreate('route', ...)
│   └── _layout.tsx        # layout-scoped state + Context.Provider
└── components/
    └── article-filter.tsx # local state via state() / useState()
```

**Typed registry helper (ideal):**

```ts
// stores/registry.ts
import { createStateRegistry } from '@nexil/state'
import type { CartState } from '../types/cart'
import type { PreferenceState } from '../types/preferences'

const registry = createStateRegistry()

export function getCartStore() {
  return registry.getOrCreate<CartState>('shared', 'cart', { items: [], total: 0, currency: 'USD' })
}

export function getPrefsStore() {
  return registry.getOrCreate<PreferenceState>('global', 'preferences', { theme: 'light' })
}

// caller gets Store<CartState> with full type safety — no casts needed
```

---

## 5. SSR & Security — State Isolation Checklist

- **Never** store request-private data in a module singleton `state`/`createStore`. Create it inside `createRequestContext` or the render owner.
- **Never** put secrets (tokens, cookies, auth decisions) in a `global` store or a signal captured by a handler — scope payload is public browser data.
- **Always** dispose registries/stores/effects when the owning route unmounts or the request ends.
- **Always** validate anything that leaves `Serializable` bounds at the boundary: `isSerializable()` before `set()`, Zod/Valibot before `createStore` hydration.

---

## 6. Anti-Patterns — What Not To Do

| Anti-pattern                                       | Why it fails                                         | Fix                                                        |
| -------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `state(new Date())`                                | Instance prototype fails `isSerializable` — throws   | Store `state('2026-08-29T00:00:00Z')` and parse            |
| `createStore({ fn: () => {} })`                    | Function rejected — `packages/state/src/index.ts:60` | Store data only; keep functions in module scope            |
| `const s = state(0); s.value = 1`                  | `value` is readonly getter                           | `s.set(1)` / `s.setValue(1)`                               |
| `computed(() => { count.set(1); return count() })` | Cycle — throws `computed dependency cycle`           | Never write inside a computed                              |
| Module-level `effect(() => ...routeSignal())`      | No owner → leaks across requests/users               | Wrap in `createRoot` per request/component                 |
| `store.setPath('user..name', 'x')`                 | Path validation throws `Invalid store path`          | `'user.profile.name'` with `/^[\w$]+$/` segments           |
| Everything in `global`                             | Coupling + no disposal + persists across Link        | Use `local`/`route`/`layout` by default                    |
| `state(load())` captured by `onClick$`             | Not a JSON literal → `unsupported` diagnostic        | Hoist to `resource()` and read via signal                  |
| `count.set((prev: any) => ...)`                    | Defeats type safety                                  | Keep `CartState` exact; rely on inferred `prev: CartState` |
| `store.select(() => Date.now())`                   | Impure selector — breaks memoization                 | Keep selectors pure `(value) => value.items.length`        |

---

## 7. End-to-End Examples

### 7.1 Local Component State (Article Filter — `examples/nexil-workbench/src/components/article-filter.tsx:1`)

```ts
import { computed, state } from '@nexil/core'

export function ArticleFilter() {
  const active = state(false)                     // Signal<boolean>
  const inactive = computed(() => !active())      // ReadableSignal<boolean>

  return (
    <section aria-labelledby="filter-title">
      <h2 id="filter-title">Filter articles</h2>
      <button aria-pressed={active()} onClick$={() => active.set(!active())}>
        Toggle release-ready filter
      </button>
      <p bindHidden$={active}>Showing every article.</p>
      <p bindHidden$={inactive}>Showing release-ready articles.</p>
    </section>
  )
}
```

### 7.2 Shared Store with Typed Helpers

```ts
import { createStore } from '@nexil/state'

type CounterState = { readonly clicks: number; readonly mode: 'resumable' | 'static' }

export const counter = createStore<CounterState>({ clicks: 0, mode: 'resumable' }, 'shared')

// Elsewhere — fully typed, no casts
counter.set((prev) => ({ ...prev, clicks: prev.clicks + 1 }))
const clicks = counter.select((s) => s.clicks) // ReadableSignal<number>
const name = counter.lens<string>('mode') // Signal<string>
console.log(counter.snapshot()) // { clicks: 1, mode: 'resumable' } — detached clone
```

### 7.3 Route-Scoped Registry (Labs — `examples/nexil-showcase/src/routes/labs.tsx:23`)

```ts
import { createStateRegistry } from '@nexil/state'
import { state, computed } from '@nexil/core'
import { batch } from '@nexil/reactivity'

const registry = createStateRegistry()
const labStore = registry.getOrCreate('route', 'lab-counter', {
  clicks: 0,
  mode: 'resumable' as const,
})

const localSignal = state(3)
const computedSignal = computed(() => localSignal() * 3)
batch(() => {
  localSignal.set(4)
  localSignal.set(5)
})

// typed reads
labStore.select((s) => s.clicks) // ReadableSignal<number>
labStore.snapshot() // { clicks: number; mode: 'resumable' }

// dispose with route lifetime
// registry.dispose()
```

### 7.4 Global Browser Store (Survives Link Navigation)

```ts
import { createStore } from '@nexil/state'

type Preferences = { readonly theme: 'light' | 'dark'; readonly reducedMotion: boolean }

export const preferences = createStore<Preferences>(
  { theme: 'light', reducedMotion: false },
  'global', // survives successful Link outlet replacement; resets on full reload
)

// In a layout — share via registry to get stable identity:
import { createStateRegistry } from '@nexil/state'
const registry = createStateRegistry()
export const prefs = registry.getOrCreate<Preferences>('global', 'showcase-preferences', {
  theme: 'deep-sea' as const,
  reducedMotion: false,
})
```

### 7.5 Async Resource

```ts
import { resource } from '@nexil/core'

type User = { readonly id: string; readonly name: string }

const user = resource<User>(() => fetch(`/api/user/${id()}`).then((r) => r.json()))

// In render — signals, not promises:
user.loading() // boolean
user.error() // Error | null
user() // User | undefined
await user.refetch() // race-safe — older responses are discarded
```

---

## 8. TypeScript Tips for State Authors

```ts
// Derive the store's state type without duplicating it
import { cartStore } from './stores/cart'
type CartState = ReturnType<typeof cartStore.snapshot>

// Use `satisfies` to validate initial matches type and keep literal narrowing
const initial = { theme: 'light', reducedMotion: false } satisfies PreferenceState

// Branded id to avoid mixing entity types
type Brand<K, T> = K & { readonly __brand: T }
type UserId = Brand<string, 'UserId'>
type AppState = { readonly currentUserId: UserId | null }

// Utility — extract signal value type
type SignalValue<S> = S extends { (): infer V } ? V : never
type CountValue = SignalValue<typeof count> // number
```

---

## 9. Quick Reference — Import Map

| What                                                                                                          | Import from                                      | Type              |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------- |
| `Serializable`, `isSerializable`                                                                              | `@nexil/core`                                    | type + guard      |
| `state`, `useState`, `computed`, `effect`, `watch`, `batch`, `untrack`, `createRoot`, `onCleanup`, `resource` | `@nexil/core` (re-export) or `@nexil/reactivity` | functions         |
| `Signal<T>`, `ReadableSignal<T>`, `Resource<T>`, `SignalOptions<T>`, `Unsubscribe`                            | `@nexil/core` or `@nexil/reactivity`             | types             |
| `createStore`, `createStateRegistry`, `StateScope`, `Store<T>`, `StateRegistry`                               | `@nexil/state`                                   | functions + types |
| `createContext`, `createContextScope`, `provideContext`, `withContext`, `Context<T>`, `ContextScope`          | `@nexil/core`                                    | functions + types |
| `For`, `Show`, `ErrorBoundary`, `Suspense`                                                                    | `@nexil/core`                                    | components        |

---

## 10. Verification Checklist (Use Before Merging State Code)

- [ ] Every stored type extends `Serializable` — `pnpm check` would fail otherwise at `createStore<T>`.
- [ ] `state`/`createStore` initial is a JSON literal when captured by `onClick$`; `pnpm build` emits no `unsupported` warnings.
- [ ] Each `computed` is pure, synchronous, cycle-free; no `set()` inside.
- [ ] Every `effect`/`watch`/`computed`/`resource` has an owner (`createRoot` or route lifetime) and is disposed.
- [ ] `global` stores contain only public, non-secret, serializable browser state.
- [ ] Registry keys match `/^[a-zA-Z0-9:_-]+$/`; store paths match `/^[A-Za-z_$][\w$]*$/` per segment.
- [ ] `snapshot()` clones are treated as detached data (never mutated to affect live state).
- [ ] Request-private state is created per `createRequestContext`, never as a module singleton.
- [ ] Selectors are pure `(value) => ...` — no side effects, no randomness.
- [ ] `batch` wraps only true transactions; not used to hide unnecessary writes.

---

_Last verified against:_ `packages/state/src/index.ts:149`, `packages/reactivity/src/index.ts:323`, `packages/core/src/index.ts:436`, `docs/en/07-state-and-reactivity.md:208` on Nexil 1.x. Run `pnpm exec tsc --noEmit && pnpm test` to confirm no type drift after editing state types.
