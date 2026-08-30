# 07 — State and Reactivity

## State scopes

Choose the smallest state scope that fits the requirement:

| Scope  | Example                            | Ownership                             |
| ------ | ---------------------------------- | ------------------------------------- |
| Local  | Open/closed menu                   | Component                             |
| Shared | Cart used by several components    | Shared store                          |
| Route  | Search result for one route        | Route or loader                       |
| Layout | Locale preference across a section | Layout-owned store                    |
| Global | Application-wide settings          | State registry with explicit lifetime |

Avoid making everything global. Global state increases coupling and makes disposal more difficult.

## Signals

A signal is a readable and writable value that notifies subscribers when it changes.

```ts
const count = state(0)
console.log(count())
count.set((previous) => previous + 1)
```

The Signal interface also exposes `get()`, a readonly `value` getter, `subscribe()`, and `dispose()`. Use `set()` or `setValue()` to update it; do not assign to the readonly `value` getter. Pass a comparator in `SignalOptions` when updates should be compared by domain equality rather than `Object.is`.

## Computed values

A computed value derives data from other signals and memoizes the result. Do not write to a signal while evaluating a computed getter; that can create a cycle.

```ts
const price = state(100)
const quantity = state(2)
const total = computed(() => price() * quantity())
```

Nexil detects computed re-entry and emits a descriptive cycle error instead of leaving an obscure stack overflow. When a cycle appears, look for direct or indirect self-reference.

### Signals captured by lazy handlers

When an `onClick$` handler closes over a signal or store, the production compiler
puts an opaque key in `data-nx-scope` and stores the corresponding browser payload
in `nexil-state.js` so the browser can materialize it on first interaction. This
requires a **JSON-literal initial value**:

```ts
const count = state(0) // ✅ serialized into the page
const items = state(load()) // ⚠️ unsupported capture diagnostic — not statically serializable
```

Captures that cannot be serialized produce an explicit `unsupported` warning at
build time instead of failing silently at click time. Multiple handlers capturing
the same declaration share one live signal instance in the browser, keyed by its
scope id.

The external state asset reduces metadata visible in the document source, but its
contents are still delivered to the browser and therefore public. Treat scope capture
as a client-data boundary, not a secret store. The compiler's secret-exposure checks
and request-local ownership rules remain mandatory.

## Async resources

Use `resource(loader, options)` for request-local asynchronous data. It exposes loading, value, and error signals, supports manual or immediate loading, and uses a generation token so a slower earlier request cannot overwrite a newer refetch.

```ts
const profile = resource(() => fetchProfile(userId()), { immediate: true })
profile.refetch()
```

## Effects

Effects are for side effects such as updating `document.title` or emitting a local event. Do not use an effect to represent a derived value.

```ts
effect(() => {
  document.title = `Count: ${count()}`
})
```

Every effect must belong to a root or owner that can be disposed. Avoid creating a module-level effect that depends on a route or user.

## Batching

When multiple signals change together, use `batch` so subscribers do not rerun after every intermediate update.

```ts
batch(() => {
  firstName.set('Sarah')
  lastName.set('Ali')
})
```

Batching is not a reason to hide unnecessary updates. Use it when the changes represent one logical transaction.

## Stores

A Store combines serializable state, selectors, updates, and lifecycle ownership.

```ts
const cart = createStore({
  items: [],
  total: 0,
})

cart.set((current) => ({
  ...current,
  total: current.total + 20,
}))
console.log(cart.snapshot())
```

The current Store interface exposes `scope`, `value`, `snapshot`, `set`, `select`, `subscribe`, and `dispose`. Use `setPath(store, ['preferences', 'theme'], 'dark')` for nested immutable updates and `lens(store, ['preferences', 'theme'])` for a writable focused signal. `snapshot()` returns a detached structured clone when the state is serializable.

> For the comprehensive guide on modern Nexil Stores (`defineStore`, modular `createStore`, `$stores/*`, automatic DOM property bindings, and SSR resumability), see [25-nexil-stores.md](./25-nexil-stores.md).

## Selectors

Selectors should be pure whenever possible. They should not mutate the store or read time or randomness during evaluation, otherwise memoization becomes unstable.

```ts
const itemCount = cart.select((value) => value.items.length)
```

When the store is disposed, its underlying signal and selector computeds must stop receiving updates and reading stale state.

## StateRegistry

`createStateRegistry()` can create or reuse stores by scope and key. Use stable, validated keys and dispose the registry when the owning route or application lifetime ends.

### Explicit browser-global Store across Link navigation

Use `createStore(initial, 'global')` only for serializable, non-secret browser state that should survive a successful Nexil Link outlet replacement, such as a client-side theme preference or a temporary cart. A captured `global` Store reuses its browser registry entry after a Link swap; the default `local`, `shared`, `route`, and `layout` Store captures are cleared with the outgoing route bindings.

```ts
const preferences = createStore({ theme: 'light' as const }, 'global')
```

This is an explicit browser lifetime, not persistent storage. Reloading the document resets it unless the application separately persists and validates a safe value. It must not contain credentials, request-private data, or authorization decisions.

## SSR and state

Do not use a mutable singleton for private request data. Create state inside the request or render owner. Sharing a global signal between requests can leak one user’s data into another request. The browser-global Store option above never makes a server module singleton request-safe.

## Context: explicit shared ownership

`createContext(defaultValue)` is Nexil dependency injection, not a hidden global store. It can pass a Signal or Store through a small synchronous subtree without prop drilling. Use `context.use()` (or the compatible `context.useContext()`) to read the nearest Provider value.

```tsx
import { createContext, state } from '@nexil/core'

const Theme = createContext(state<'light' | 'dark'>('light'))

export function ThemeSection() {
  const theme = state<'light' | 'dark'>('dark')
  return Theme.Provider({
    value: theme,
    children: () => <button onClick$={() => Theme.use().set('light')}>Use light theme</button>,
  })
}
```

For SSR adapters, use the explicit `ContextScope` supplied as `context.scope` to a route or component, or create one with `createContextScope()`. `provideContext(scope, context, value)` returns a child scope and never mutates the parent. This makes independent request scopes testable and prevents a value intended for one request from becoming a process-wide default.

```ts
const requestScope = createContextScope()
const userScope = provideContext(requestScope, CurrentUser, { id: 'u_42' })
const user = CurrentUser.use(userScope)
```

`Provider` resolves children synchronously by design. Pass a scope explicitly to async work with `withContext(scope, context, value, run)` instead of expecting an ambient stack to survive `await`. A Context value is not automatically serialized, persisted, or private; do not put request secrets in a client-captured Signal or Store.

## Fine-grained DOM bindings without hydration

A Signal does not replace server HTML. Render important content during SSR first, then let a binding update the specific text node or scalar property after the Signal changes. Nexil does not rerun the component and does not reconcile a virtual tree for these updates.

Direct reads are lowered automatically when the compiler can prove the target and dependency:

```tsx
const count = state(0)
const disabled = state(false)

return (
  <section>
    <output>{count()}</output>
    <button bindDisabled$={disabled}>Save</button>
  </section>
)
```

Use explicit directives for predictable intent, especially when a value is not a direct Signal read or when the target is a scalar property. Supported directives are `bindText$`, `bindValue$`, `bindChecked$`, `bindDisabled$`, `bindHidden$`, `bindClass$`, `bindStyle$`, `bindHref$`, `bindSrc$`, and `bindAriaLabel$`. The runtime supports the corresponding `text`, `value`, `checked`, `disabled`, `hidden`, `class`, `style`, `href`, `src`, and `aria-*` targets.

The compiler serializes a stable scope reference and emits a `data-nx-bind="nx:signal:<id>#<target>"` marker. The binding runtime resolves the materialized Signal and installs an `effect()` subscription. The subscription mutates only the target node/property and is removed by the returned disposer or route-scope cleanup. Dynamic expressions such as `{count() + ' items'}` are intentionally not auto-lowered; use an explicit directive when that behavior is required.

## v1.1 lifecycle checklist

When state crosses a lazy boundary, prefer compiler inference over manual ScopeRef serialization. Keep resources and stores request-local, dispose effects and selectors with their owner, and verify that repeated handler captures share one scope identity.

## State checklist

- Can the value be derived from props instead of stored?
- Does the signal have a clear owner?
- Is the computed function pure and cycle-free?
- Does every effect have cleanup?
- Is the store serializable when it crosses a boundary?
- Is disposal called during route transitions?
- Is user state isolated from other requests?

## Workbench lab

Run `pnpm --filter @nexil/example-nexil-workbench build` and inspect the home output and manifest. Its `ArticleFilter` is deliberately one Signal-driven boundary, so it is a small place to confirm the initial HTML, lazy interaction marker, and direct binding behavior. Extend it with the ContextScope test from this guide only after writing two independent scopes; do not turn the example's browser UI state into a module-level request singleton.
