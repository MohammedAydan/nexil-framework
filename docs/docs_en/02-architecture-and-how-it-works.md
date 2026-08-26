# 02 — Architecture and How Nexis Works

## The complete system

Nexis is organized as focused packages. Each package owns a specific responsibility, which allows individual layers to be tested without running an entire application.

| Layer       | Package                      | Responsibility                                          |
| ----------- | ---------------------------- | ------------------------------------------------------- |
| Core        | `@mohammedaydan/core`        | RenderNode, Child, and Element types                    |
| Routing     | `@mohammedaydan/router`      | Route records and URL matching                          |
| Rendering   | `@mohammedaydan/renderer`    | Convert RenderNodes into HTML or streams                |
| Reactivity  | `@mohammedaydan/reactivity`  | Signals, computed values, effects, batching, cleanup    |
| State       | `@mohammedaydan/state`       | Stores, selectors, and state registries                 |
| Client      | `@mohammedaydan/client`      | ScopeRef registry and resume state                      |
| Compiler    | `@mohammedaydan/compiler`    | JavaScript and interaction budgets                      |
| Vite plugin | `@mohammedaydan/vite-plugin` | Source analysis, Bootstrap, and lazy chunks             |
| CLI         | `@mohammedaydan/cli`         | Route discovery and build output                        |
| Server      | `@mohammedaydan/serve`       | Official production server                              |
| Actions     | `@mohammedaydan/actions`     | Validation, origin policy, execution, replay protection |
| SEO         | `@mohammedaydan/seo`         | Head, sitemap, feeds, and JSON-LD                       |
| Media       | `@mohammedaydan/media`       | Image variants, picture markup, and caching             |
| Telemetry   | `@mohammedaydan/telemetry`   | Low-cardinality events and optional Web Vitals          |

## Development stage

During development, the Vite dev server runs the application. The Vite plugin discovers routes, analyzes handlers ending in `$`, and generates temporary chunks. When a page is requested, the dev server reconstructs a Web Request and sends it through the render pipeline. In a proxy preview, `NEXIS_TRUST_PROXY=1` may be enabled only behind a trusted proxy that sanitizes forwarded headers.

## Build stage

`nexis build` performs the following operations:

1. Load `nexis.config.json`, `.js`, `.mjs`, or `.ts`.
2. Discover route files and convert them into route records.
3. Build the route template and shared head.
4. Render each route using its configured mode.
5. Expand `getStaticPaths` for dynamic static routes.
6. Collect CSS and write HTML files.
7. Emit Bootstrap and lazy chunks only for interactive routes.
8. Generate sitemap, robots, RSS, Atom, and redirect artifacts.
9. Generate OG cards and media variants when configured.
10. Write `nexis-manifest.json` and asset metadata.

## Request processing

In production, `@mohammedaydan/serve` receives a request and maps it to `dist/client`:

- `/` and nested routes resolve to generated `index.html` files.
- Static assets receive the correct MIME type and immutable caching when fingerprinted.
- `GET` and `HEAD` are accepted.
- Unsupported methods receive `405` with an appropriate `Allow` header.
- Traversal candidates are rejected.
- A custom `404.html` or the built-in 404 document is served.
- Action routes are delegated to the action transport.
- The optional telemetry receiver invokes the application callback.

## RenderNode

The Renderer does not require a DOM. It works with abstract values such as text, elements, arrays, and promises. This allows the same rendering contract to run in Node, Deno, and edge environments.

```ts
import { renderToStringAsync } from '@mohammedaydan/renderer'

const html = await renderToStringAsync({
  type: 'main',
  props: { class: 'page' },
  children: ['Hello from Nexis'],
})
```

Text and attributes are escaped according to their context. Do not place untrusted HTML into a raw HTML escape hatch without an explicit sanitization policy.

## Compiler and Bootstrap

The Vite plugin identifies lazy interaction handlers and emits a chunk for each handler. A small Bootstrap captures delegated events, reads `data-nx-scope` and `data-nx-on-*`, and imports the relevant chunk. A static page should not ship route-specific JavaScript.

Bootstrap is not the place for application logic. Keep it generic and small; keep page behavior in lazy chunks.

## ScopeRef registry

`ScopeRef` is the ABI between server output and the browser. Instead of transferring an arbitrary closure or object, Nexis records the kind and identifier of a reference:

```ts
type ScopeRef =
  | { kind: 'value'; id: string; value: unknown }
  | { kind: 'signal'; id: string }
  | { kind: 'store'; id: string }
  | { kind: 'action'; id: string }
  | { kind: 'unsupported'; id: string; reason: string }
```

Unsupported captures are not silently serialized. They become warnings or `unsupported` records so that a production application does not silently behave differently from development.

## Why package boundaries matter

Boundaries prevent SEO from depending on the DOM, Renderer from depending on Node, or Client code from directly accessing a database. They make tests smaller and allow one request handler to run behind Node, Deno, or Cloudflare.

## Internal references

- [Package map](../architecture/package-map.md)
- [Phase 2 architecture decision](../adr/phase-2-production-parity.md)
- [Production server](../../packages/serve/README.md)
