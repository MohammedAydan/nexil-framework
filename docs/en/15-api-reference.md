# 15 — API Reference

This is a practical map of the public APIs. The installed TypeScript declarations and the `src/index.ts` files remain the authoritative reference for the exact release.

## Core

`@mohammedaydan/core` exposes RenderNode, ElementNode, Child, and related rendering types, plus the authoring APIs used by routes: `component`, `text`, `element`, `For`, `Show`, `createContext`, `ErrorBoundary`, `Suspense`, `Form`, and `SubmitButton`. It also re-exports the reactivity toolkit (`state`, `useState`, `computed`, `effect`, `watch`, `batch`, `untrack`, `createRoot`, `onCleanup`, and `resource`). Import reactive primitives from core or from `@mohammedaydan/reactivity` directly; stores come from `@mohammedaydan/state`, which generated projects depend on by default.

## Renderer

| API                             | Purpose                             |
| ------------------------------- | ----------------------------------- |
| `escapeHtml(value)`             | Escape HTML text and attributes     |
| `renderElementOpening(node)`    | Render an opening tag               |
| `renderElementClosing(node)`    | Render a closing tag                |
| `renderChild(child)`            | Synchronous child rendering         |
| `renderChildAsync(child)`       | Promise-aware child rendering       |
| `renderToString(root)`          | Synchronous full HTML               |
| `renderToStringAsync(root)`     | Asynchronous full HTML              |
| `renderRoute(input)`            | Render a route by mode              |
| `renderToStream(root, options)` | Incremental `ReadableStream` output |

## Router

| API                              | Purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| `routeFromFile(file)`            | Convert a filename into a RouteRecord               |
| `matchRoute(route, pathname)`    | Match a pathname and extract parameters             |
| `resolveRoute(routes, pathname)` | Select a route from a collection                    |
| `Link(props)`                    | Create a typed internal link with prefetch metadata |
| `parseUrlParts(url)`             | Parse pathname, query, and hash parts               |

## Reactivity

| API                         | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `state(initial)`            | Create a writable signal                                    |
| `useState(initial)`         | Return a signal and setter tuple                            |
| `computed(fn)`              | Create a memoized derived signal                            |
| `effect(fn)`                | Create a tracked side effect                                |
| `watch(source, listener)`   | Observe a value and listener                                |
| `batch(fn)`                 | Group notifications                                         |
| `untrack(fn)`               | Read without creating a dependency                          |
| `createRoot(fn)`            | Create an owner and cleanup scope                           |
| `onCleanup(fn)`             | Register cleanup                                            |
| `resource(loader, options)` | Track async loading, value, error, and race-safe refetching |

Signals are callable, expose `get()` and readonly `value`, and provide `set`, `setValue`, `subscribe`, and `dispose`.

## State

| API                           | Purpose                                 |
| ----------------------------- | --------------------------------------- |
| `createStore(initial, scope)` | Create a serializable store             |
| `store.value`                 | Underlying readable signal              |
| `store.snapshot()`            | Clone the current state                 |
| `store.set(update)`           | Apply a value or functional update      |
| `store.select(selector)`      | Create a computed selector              |
| `store.subscribe(listener)`   | Subscribe to changes                    |
| `store.dispose()`             | Dispose the signal and selectors        |
| `createStateRegistry()`       | Reuse stores by scope and validated key |
| `setPath(store, path, value)` | Update a nested store path immutably    |
| `lens(store, path)`           | Create a writable focused signal        |

## SEO

| API                                      | Purpose                                      |
| ---------------------------------------- | -------------------------------------------- |
| `normalizeSeo(metadata)`                 | Validate and normalize metadata              |
| `renderHead(metadata)`                   | Render title, meta, OG, Twitter, and JSON-LD |
| `buildSitemap(entries)`                  | Build XML sitemap output                     |
| `buildRobots(sitemapUrl, disallow)`      | Build robots.txt                             |
| `deriveCanonical(origin, pathname)`      | Create a safe canonical URL                  |
| `withCanonical(metadata, ...)`           | Add canonical metadata                       |
| `generateFeed(items, options)`           | Generate RSS 2.0                             |
| `generateAtomFeed(items, options)`       | Generate Atom                                |
| `deriveBreadcrumbList(pathname, origin)` | Generate Breadcrumb JSON-LD                  |
| `validateJsonLd(value)`                  | Validate supported JSON-LD shape             |

## Server and data

| API                                         | Purpose                            |
| ------------------------------------------- | ---------------------------------- |
| `createProductionServer(root, options)`     | Start the official Node server     |
| `createProductionMiddleware(root, options)` | Create embeddable middleware       |
| `createSecurityHeaders(nonce?)`             | Create security headers            |
| `serializeCookie(name, value, options)`     | Serialize a cookie safely          |
| `createDataContext(request)`                | Create request-scoped data context |
| `defineLoader(loader)`                      | Create a typed request loader      |
| `parseCookies(requestOrHeader)`             | Decode request cookies safely      |
| `getCookie(request, name)`                  | Read one decoded cookie            |
| `notFound(message?)`                        | Create a 404 response              |

## Actions

`@mohammedaydan/actions` provides `action`, `assertTrustedOrigin`, typed action responses, request parsing, validation, endpoint options, and `createMemoryIdempotencyStore`. Use the durable-store contract for distributed production.

## Vite plugin and Client

| API                                      | Purpose                                                             |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `nexis(options)`                         | Vite plugin                                                         |
| `transformNexisSource(source, id)`       | Extract lazy chunks and emit per-boundary `data-nx-scope` payloads  |
| `classifyScopeCaptures(...)`             | Classify values, signals, stores, actions, and unsupported captures |
| `RESUMABILITY_BOOTSTRAP`                 | The delegated resumability runtime served as `nexis-bootstrap.js`   |
| `bootstrapResumability(root, load)`      | Bind boundaries in a DOM root; parity with the shipped bootstrap    |
| `serializeResumeState`                   | Serialize bounded resume data                                       |
| `deserializeResumeState`                 | Deserialize resume data                                             |
| `createHandlerReference`                 | Create a lazy handler reference                                     |
| `createScopeRegistry`                    | Create a ScopeRef registry                                          |
| `registerScopeSignal`                    | Register a signal reference                                         |
| `registerScopeStore`                     | Register a store reference                                          |
| `registerScopeAction`                    | Register an action reference                                        |
| `disposeScope`                           | Dispose one registered scope                                        |
| `inspectScope`                           | Inspect active scope records                                        |
| `bindSignalToDOM(scopeId, node, target)` | Bind a registered Signal or Store value to one DOM target           |
| `enhanceForms(options)`                  | Enhance `Form` nodes while preserving native fallback               |

Lazy handlers receive `{ element, event, scope }`. Signals, stores, and actions
captured by a handler are materialized once per scope id and shared across every
boundary that captures the same declaration.

The compiler directives `bindText$`, `bindValue$`, `bindChecked$`, `bindDisabled$`, `bindHidden$`, `bindClass$`, `bindStyle$`, `bindHref$`, `bindSrc$`, and `bindAriaLabel$` create fine-grained DOM bindings. The client function has the following contract:

```ts
bindSignalToDOM(
  scopeId: string,
  node: Text | HTMLElement,
  targetProperty: 'text' | 'value' | 'checked' | 'disabled' | 'hidden' | 'class' | 'style' | 'href' | 'src' | `aria-${string}`,
): () => void
```

It resolves a registered `nx:signal:<id>` or `nx:store:<id>` reference, installs an `effect()`, applies the current value immediately, and returns a disposer. Binding updates mutate the target directly; they do not rerun a component or reconcile a virtual DOM. `nexis-bindings.js` is emitted only for routes whose transformed output contains binding metadata; `nexis-forms.js` is emitted only when a route contains a progressive `Form`.

## Media

`buildImageVariants` creates WebP/AVIF variants and reports bytes and cache hits. `pictureMarkup` creates responsive picture markup. `imageAttributes` creates image attributes. `fontFace` emits a font-face rule. `cacheDir` enables optional persistent transform caching.

## Telemetry

| API                              | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `createTelemetry(options)`       | Create an optional telemetry client              |
| `observeWebVitals(options)`      | Observe LCP, CLS, and INP                        |
| `renderTelemetryScript(options)` | Render a script or an empty string when disabled |
| `telemetryEventSchema`           | Document the event shape                         |

## Edge packages

`createDenoHandler`, `createDenoAdapterHandler`, and `serveDeno` target Deno. `createCloudflareHandler`, `createCloudflareAdapterHandler`, and `withCloudflareContext` target Cloudflare. Both use Fetch-native contracts and require application assets or a fallback handler.

## CLI

The CLI discovers routes, recursively composes `_layout.*` modules, loads configuration, builds HTML and assets, generates feeds, sitemap, robots, redirect manifests, and OG cards, and writes the manifest. It also provides `preview`, safe generators, `doctor`, `test`, and `upgrade` commands. Prefer CLI commands and documented configuration over importing internal build helpers from application code.
