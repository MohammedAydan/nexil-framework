# @mohammedaydan/serve

The Nexis production server serves the generated `dist/client` directory with framework route semantics instead of SPA fallback behavior. It maps `/` and nested routes to generated `index.html` files, returns the framework 404 document for missing paths, supports `GET` and `HEAD`, rejects other methods with `405`, and applies immutable caching to assets and revalidation caching to HTML.

```ts
import { createProductionServer } from '@mohammedaydan/serve'

const app = createProductionServer('./dist/client', { port: 4173 })
await app.listen()
```

The `middleware` export accepts Node `IncomingMessage` and `ServerResponse` values and can be passed to an existing Node-compatible HTTP server. The standalone `server` property is a regular Node HTTP server. The default cache policy is `public, max-age=0, must-revalidate` for HTML and `public, max-age=31536000, immutable` for assets; both values are overrideable through `cacheControl`. `404.html` in the client output is used when present, otherwise Nexis emits its safe built-in 404 document.

The CLI `nexis serve` command wraps the same factory and accepts `NEXIS_PORT` and `NEXIS_HOST` environment variables. HTML routes accept only `GET` and `HEAD`; asset routes use the same safe method contract. Paths are normalized and traversal candidates are rejected before filesystem access.
