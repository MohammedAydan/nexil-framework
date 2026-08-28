# @nexil/serve

The Nexil production server serves the generated `dist/client` directory with framework route semantics instead of SPA fallback behavior. It maps `/` and nested routes to generated `index.html` files, returns the framework 404 document for missing paths, supports `GET` and `HEAD`, rejects other methods with `405`, and applies immutable caching to assets and revalidation caching to HTML.

For a generated project, no custom server file is required:

```bash
pnpm build
pnpm start
```

`nexil start` is the route-aware production server. `nexil serve` and `nexil preview` remain aliases for compatibility.

```ts
import { createServer } from '@nexil/serve'

const app = createServer('./dist/client', { port: 4173 })
await app.listen()
```

Use `createMiddleware()` when embedding Nexil in a Node server and `composeMiddleware()` to add request IDs, sessions, rate limits, or application guards before route handling.

```ts
import { composeMiddleware, createMiddleware } from '@nexil/serve'

const app = createMiddleware('./dist/client')
const handler = composeMiddleware(requestIdMiddleware, sessionMiddleware, app)
```

The standalone `server` property is a regular Node HTTP server. The default cache policy is `public, max-age=0, must-revalidate` for HTML and `public, max-age=31536000, immutable` for assets; both values are overrideable through `cacheControl`. `404.html` in the client output is used when present, otherwise Nexil emits its safe built-in 404 document.

The CLI accepts `NEXIL_PORT` and `NEXIL_HOST` environment variables. HTML routes accept only `GET` and `HEAD`; asset routes use the same safe method contract. Paths are normalized and traversal candidates are rejected before filesystem access. The former `createProductionServer` and `createProductionMiddleware` names remain exported as compatibility aliases; use the concise names in new code.
