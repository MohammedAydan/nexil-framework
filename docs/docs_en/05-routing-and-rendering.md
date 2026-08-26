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

## Dynamic static paths

For routes that must be generated during the build, provide a static-path list:

```tsx
export async function getStaticPaths() {
  const slugs = await getDocumentationSlugs()
  return slugs.map((slug) => ({ params: { slug } }))
}

export default async function DocumentationPage({ params }: { params: { slug: string } }) {
  const page = await getDocumentationPage(params.slug)
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
