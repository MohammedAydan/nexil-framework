# 06 — Interactivity, Resumability, and ScopeRef

## The idea

Traditional hydration reruns application code in the browser to discover events and state. Nexis sends HTML with enough information to identify an event, then loads only the required handler when the user interacts. This is resumability.

```text
SSR HTML
  + data-nx-on-click="chunk-id#handler"
  + data-nx-scope="nx:scope:<opaque-key>"
  + nexis-state.js (only when captured browser state is needed)
  + nexis-bootstrap.js
  + nexis-bindings.js (binding routes only)
  + nexis-forms.js (progressive Form routes only)
        │
        └── click → import lazy chunk → resolve scope → execute handler
```

## Fine-grained DOM bindings

Nexis can update one text node or scalar DOM property directly from a Signal without rerunning the component or reconciling a virtual tree. Use a direct read for the conservative automatic path:

```tsx
const count = state(0)

return <output>{count()}</output>
```

For an explicit target, use one of the compiler directives below:

```tsx
const name = state('Ada')
const busy = state(false)

return (
  <form>
    <input bindValue$={name} aria-label="Name" />
    <button bindDisabled$={busy} type="submit">
      Save {name()}
    </button>
  </form>
)
```

The supported targets are `text`, `value`, `checked`, `disabled`, `hidden`, `class`, `style`, `href`, `src`, and `aria-*`, exposed through `bindText$`, `bindValue$`, `bindChecked$`, `bindDisabled$`, `bindHidden$`, `bindClass$`, `bindStyle$`, `bindHref$`, `bindSrc$`, and `bindAriaLabel$`. The compiler preserves the SSR value, emits a stable `nx:signal:<id>#<target>` marker, and writes the marker beside the serialized scope declaration. On the client, the binding runtime materializes the registered Signal and installs an `effect()` that mutates only that target. The disposer removes the subscription and clears materialized scope state.

Automatic lowering is deliberately conservative. Direct `{signal()}`, `{signal.value}`, and direct scalar-attribute reads are supported. Equivalent handler expressions share one canonical lazy chunk, and repeated identical scope envelopes are lifted to their nearest shared HTML ancestor. An expression such as `{count() + ' items'}` is left as normal SSR output and emits a diagnostic recommending an explicit `bindText$`; the compiler does not guess a dependency graph for arbitrary expressions.

A route containing only ordinary SSR markup does not receive `nexis-bindings.js`. The CLI and Vite plugin emit and inject the separate binding runtime only when transformed route metadata contains a binding.

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

### Named local handlers

A named local arrow or function expression is supported when it is passed directly to an event prop. Nexis resolves its body at build time, classifies the values that body closes over, and emits the same lazy boundary as an inline callback. This is useful for readable, reusable event intent without whole-component hydration.

```tsx
export default component(() => {
  const count = state(0)
  const increment = () => count.set((current) => current + 1)

  return (
    <section>
      <output>{count()}</output>
      <button onClick$={increment}>Increment</button>
    </section>
  )
})
```

The handler must be a direct local identifier whose declaration appears before the event prop. Nexis does not serialize imported functions, arbitrary computed handler expressions, database clients, secrets, or mutable class instances. Keep pure helpers inside the handler or make their required public values explicit captures; server-only work belongs in an Action.

## ScopeRef kinds

| Kind          | Use                                            | Note                                                 |
| ------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `value`       | Authorized strings, numbers, booleans, or data | Must be serializable                                 |
| `signal`      | A live readable and writable signal            | Needs lifecycle ownership                            |
| `store`       | A store and its selectors                      | Must be disposed with its scope                      |
| `action`      | A reference to a server action                 | Does not send server execution to the browser        |
| `unsupported` | A capture the compiler cannot transfer         | Produces diagnostics instead of silent serialization |

## Automatic scope serialization

You do not write `data-nx-scope` by hand. When a lazy handler captures a signal,
store, or action, production builds replace the named inline payload with an opaque
scope key and write the browser-required payload to `nexis-state.js`, loaded before
the resumability runtime. The browser resolves that key on first interaction:

```tsx
const count = state(0) // ✅ JSON-literal initial — serialized into the page
const items = state(load()) // ⚠️ unsupported capture diagnostic at build time
```

Captures require a statically serializable initial value. Multiple handlers
capturing the same declaration share one live instance in the browser, keyed by
its scope id.

This reduces document-source verbosity and avoids exposing capture names, kinds,
stable IDs, and initial values directly in the initial HTML. It is **not encryption**
or authorization: a browser can fetch `nexis-state.js`, so captured values remain
public browser data. Never capture secrets, private profiles, credentials, or
request-only information. Inline JSON ScopeRefs remain supported for manually
authored and compatibility boundaries.

## Scope deduplication

Application routes should not call `serializeScopeRefs()` manually. The compiler emits supported Signal, store, and action references, while the build lifts repeated identical `data-nx-scope` payloads to a shared ancestor. The low-level serializer remains intended for runtime and adapter tests.

## The registry

The client registry exposes operations such as `resolve`, `inspectScope`, `dispose`, and `disposeAll`. Binding subscriptions use the same scope ownership model. Do not keep global references forever; every route or boundary should own a clear lifetime.

```ts
const registry = createScopeRegistry()
registry.register({ id: 'counter', kind: 'signal', value: count })
const signal = registry.resolve('counter')
registry.dispose('counter')
```

Use the actual exports from `@nexis/client`; do not create a parallel registry without a strong reason.

## Why arbitrary closures are not transferred

A closure may contain a connection, token, DOM reference, prototype, or non-serializable object. Converting it to JSON can change its meaning or leak a secret. Nexis classifies captures instead of pretending to reconstruct everything.

The safe approach is to capture a public serializable value. The unsafe approach is to capture `dbClient`, `process.env.SECRET`, or an entire user object inside a client handler.

## Delegated events

Bootstrap delegates events at the document level and finds Nexis event attributes. Therefore:

- Use the correct event type.
- Narrow `event.target` before using it.
- Prevent native form submission synchronously before awaiting a lazy import.
- Keep a real `action` and `method` so progressive enhancement remains available.
- Use `Form` and `SubmitButton` for native-first forms; the generated `nexis-forms.js` runtime adds idempotency, optional CSRF, loading state, and success/error events.

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
