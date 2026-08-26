# 06 — Interactivity, Resumability, and ScopeRef

## The idea

Traditional hydration reruns application code in the browser to discover events and state. Nexis sends HTML with enough information to identify an event, then loads only the required handler when the user interacts. This is resumability.

```text
SSR HTML
  + data-nx-on-click="chunk-id#handler"
  + data-nx-scope="..."
  + nex-bootstrap.js
        │
        └── click → import lazy chunk → resolve scope → execute handler
```

## Writing a lazy handler

Use the `$` convention in locations analyzed by the Vite plugin. Keep handlers short and use references that can be classified.

```tsx
export function LikeButton({ postId }: { readonly postId: string }) {
  return (
    <button
      type="button"
      onClick$={() => {
        console.log(`like ${postId}`)
      }}
    >
      Like
    </button>
  )
}
```

A simple serializable `postId` may be included in scope. A database connection, class instance, or closure that depends on non-transferable resources must remain server-side.

## ScopeRef kinds

| Kind          | Use                                            | Note                                                 |
| ------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `value`       | Authorized strings, numbers, booleans, or data | Must be serializable                                 |
| `signal`      | A live readable and writable signal            | Needs lifecycle ownership                            |
| `store`       | A store and its selectors                      | Must be disposed with its scope                      |
| `action`      | A reference to a server action                 | Does not send server execution to the browser        |
| `unsupported` | A capture the compiler cannot transfer         | Produces diagnostics instead of silent serialization |

## The registry

The client registry exposes operations such as `resolve`, `inspectScope`, `dispose`, and `disposeAll`. Do not keep global references forever; every route or boundary should own a clear lifetime.

```ts
const registry = createScopeRegistry()
registry.register({ id: 'counter', kind: 'signal', value: count })
const signal = registry.resolve('counter')
registry.dispose('counter')
```

Use the actual exports from `@mohammedaydan/client`; do not create a parallel registry without a strong reason.

## Why arbitrary closures are not transferred

A closure may contain a connection, token, DOM reference, prototype, or non-serializable object. Converting it to JSON can change its meaning or leak a secret. Nexis classifies captures instead of pretending to reconstruct everything.

The safe approach is to capture a public serializable value. The unsafe approach is to capture `dbClient`, `process.env.SECRET`, or an entire user object inside a client handler.

## Delegated events

Bootstrap delegates events at the document level and finds Nexis event attributes. Therefore:

- Use the correct event type.
- Narrow `event.target` before using it.
- Prevent native form submission synchronously before awaiting a lazy import.
- Keep a real `action` and `method` so progressive enhancement remains available.

## Interaction boundaries

Make each boundary small. A button inside a card does not make the entire card client-side. For a large table, make search or sorting its own boundary rather than shipping all table data and runtime code unnecessarily.

## Testing resumability

Test that:

1. The page renders without executing the handler.
2. The first interaction loads only the needed chunk.
3. State changes are visible without a full navigation.
4. Refresh and route transitions dispose old registries and effects.

In Playwright, observe network requests before and after interaction and confirm static routes request no JavaScript.

## Common mistakes

- Using ordinary `onClick` where the compiler expects `onClick$`.
- Reading `window` during SSR.
- Passing mutable, non-serializable objects into a boundary.
- Creating a global effect without cleanup.
- Using client state for essential content that should already be in server HTML.
