# 05 — Routing and Rendering

## File-based routing

Nexis discovers files under `src/routes` and maps them to URLs. `index.tsx` represents a directory route, a normal filename represents a path, and square brackets represent a dynamic parameter.

```text
src/routes/index.tsx                 → /
src/routes/about.tsx                 → /about
src/routes/docs/index.tsx            → /docs
src/routes/docs/[slug].tsx           → /docs/:slug
src/routes/shop/[id]/index.tsx       → /shop/:id
```

Use small, predictable route names. Do not make one route responsible for every application concern.

## Route records and matches

The Router creates a `RouteRecord` containing the route pattern, parameters, and file reference. Matching a pathname produces a `RouteMatch` with parameter values.

```ts
const match = matchRoute(route, '/docs/architecture')
if (match) {
  console.log(match.params.slug)
}
```

## Semantic `Link` navigation

Import `Link` from `@mohammedaydan/router` when a route should opt into progressive same-origin navigation. The server and static build still emit an ordinary `<a href>`; therefore search engines, bookmarks, copied URLs, and browsers without JavaScript follow standard document navigation.

```tsx
import { Link } from '@mohammedaydan/router'

export default function DocumentationIndex() {
  return (
    <nav aria-label="Documentation">
      <Link href="/docs/architecture" prefetch="intent">
        Read the architecture
      </Link>
      <Link href="/docs/reference" prefetch="viewport" transition={false}>
        API reference
      </Link>
    </nav>
  )
}
```

The build emits `nexis-navigation.js` only when rendered output contains Link markup. It delegates unmodified primary clicks for marked same-origin anchors, fetches a normal HTML response, validates `#app`, updates owned metadata, and replaces only that outlet. It uses the History API and scroll restoration; it can use `document.startViewTransition()` when the browser supports it. This is direct DOM replacement, not a virtual-DOM diff or a client component renderer.

Modified clicks, middle clicks, external origins, `target`, `download`, `rel="external"`, already-prevented events, and same-document hash links retain native browser behavior. A failed fetch, non-HTML response, missing outlet, or incomplete navigation falls back to ordinary navigation. `prefetch="intent"` may cache a public response after hover or focus; `viewport` uses `IntersectionObserver`; `private` and `no-store` responses are never retained.

> A Link does not turn a route into a client-only application. Keep every destination independently correct as SSR/SSG HTML, and never place secrets in rendered output or public state assets.

## Dynamic static paths

For routes that must be generated during the build, provide a static-path list:

```tsx
export async function getStaticPaths() {
  const slugs = await getDocumentationSlugs()
  return slugs.map((slug) => ({ params: { slug } }))
}

export default async function DocumentationPage({ slug }: { readonly slug?: string }) {
  const page = slug ? await getDocumentationPage(slug) : undefined
  if (!page) return <NotFound />
  return (
    <article>
      <h1>{page.title}</h1>
      {page.content}
    </article>
  )
}
```

The generated value must be predictable and safe. Never allow a parameter to produce a path outside the output directory.

## Render modes

| Mode     | Use case                                             | Cache behavior                            |
| -------- | ---------------------------------------------------- | ----------------------------------------- |
| `static` | Data is known at build time                          | HTML can be cached strongly               |
| `server` | Request headers, cookies, or per-request data matter | Shared caching is forbidden by default    |
| `isr`    | Public data can be regenerated after a period        | Requires a cache adapter and `revalidate` |

### Static

Use static output for marketing pages, documentation, articles, and products that change during builds.

### Server

Use server rendering for user-specific pages or pages that depend on request headers. Never attach public immutable caching to HTML containing private user data.

### ISR

ISR requires an explicit cache contract. Define where HTML is stored, how long `revalidate` lasts, and what happens on failure. Do not use ISR with private data unless the cache key is isolated per user.

## `renderRoute`

The route rendering API receives a route input and a mode. Server mode prevents shared caching, while ISR rejects operation without a suitable cache adapter.

```ts
const result = await renderRoute({
  mode: 'static',
  request: new Request('https://example.com/'),
  render: () => <Home />,
})
```

Read `RouteRenderInput` and `RenderOutput` in `packages/renderer/src/modes.ts` when implementing a custom adapter.

## 404, 405, and HEAD

Provide a 404 route or use the production server’s default 404 document. `GET` returns a body; `HEAD` returns the same headers without a body. Unsupported methods should return `405` and `Allow` rather than silently executing the route as `GET`.

## Streaming

`renderToStream` returns a `ReadableStream<Uint8Array>`. Use it for large HTML or asynchronous children. Configure a flush threshold and propagate `AbortSignal`. Do not leave a producer running after the client disconnects.

```ts
const stream = renderToStream(<Page />, {
  signal: request.signal,
  flushThreshold: 1024,
})
return new Response(stream, {
  headers: { 'content-type': 'text/html; charset=utf-8' },
})
```

## Cache headers

HTML commonly needs `public, max-age=0, must-revalidate` or an application-specific policy. Fingerprinted assets can use `public, max-age=31536000, immutable`. Never apply shared public caching to a response containing private data or user cookies.

## Recommended separation

A route should define what to render, a component should define how to render it, a data layer should define where data comes from, and the action/server layer should define what can change. This separation reduces cache mistakes and makes each layer directly testable.

## v1.1 layout and streaming additions

Nexis v1.1.0 discovers `_layout.*` files recursively and composes them around route content. Route groups preserve layout context without adding URL segments. Parent `seo` exports can provide `titleTemplate` and `openGraph.siteName`; child routes override only the fields they need. The `Suspense` render node sends a fallback in the initial shell and flushes completed asynchronous boundaries out of order. See the [v1.1.0 release and migration guide](../releases/v1.1.0.md) for a complete example.

## Workbench lab

The executable [`examples/nexis-workbench`](../../examples/nexis-workbench) contains an `_layout.tsx`, a static article index, and `articles/[slug].tsx` with `getStaticPaths()`. Run `pnpm --filter @mohammedaydan/example-nexis-workbench verify`, then inspect `dist/client/articles/first-boundary/index.html` and `dist/client/articles/release-check/index.html`. The same project uses semantic `Link` elements in its layout; disable JavaScript once to confirm that every link remains a normal document link.
