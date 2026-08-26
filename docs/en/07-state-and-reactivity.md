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

The Signal interface also exposes `get()`, a readonly `value` getter, `subscribe()`, and `dispose()`. Use `set()` or `setValue()` to update it; do not assign to the readonly `value` getter.

## Computed values

A computed value derives data from other signals and memoizes the result. Do not write to a signal while evaluating a computed getter; that can create a cycle.

```ts
const price = state(100)
const quantity = state(2)
const total = computed(() => price() * quantity())
```

Nexis detects computed re-entry and emits a descriptive cycle error instead of leaving an obscure stack overflow. When a cycle appears, look for direct or indirect self-reference.

### Signals captured by lazy handlers

When an `onClick$` handler closes over a signal or store, the compiler serializes
the declaration into `data-nx-scope` so the browser can materialize it on first
interaction. This requires a **JSON-literal initial value**:

```ts
const count = state(0) // ✅ serialized into the page
const items = state(load()) // ⚠️ unsupported capture diagnostic — not statically serializable
```

Captures that cannot be serialized produce an explicit `unsupported` warning at
build time instead of failing silently at click time. Multiple handlers capturing
the same declaration share one live signal instance in the browser, keyed by its
scope id.

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

The current Store interface exposes `scope`, `value`, `snapshot`, `set`, `select`, `subscribe`, and `dispose`.

## Selectors

Selectors should be pure whenever possible. They should not mutate the store or read time or randomness during evaluation, otherwise memoization becomes unstable.

```ts
const itemCount = cart.select((value) => value.items.length)
```

When the store is disposed, its underlying signal and selector computeds must stop receiving updates and reading stale state.

## StateRegistry

`createStateRegistry()` can create or reuse stores by scope and key. Use stable, validated keys and dispose the registry when the owning route or application lifetime ends.

## SSR and state

Do not use a mutable singleton for private request data. Create state inside the request or render owner. Sharing a global signal between requests can leak one user’s data into another request.

## Hydrationless state

A signal does not replace server HTML. If a title or price matters, render it during SSR first, then use a signal to update it after interaction.

## State checklist

- Can the value be derived from props instead of stored?
- Does the signal have a clear owner?
- Is the computed function pure and cycle-free?
- Does every effect have cleanup?
- Is the store serializable when it crosses a boundary?
- Is disposal called during route transitions?
- Is user state isolated from other requests?
