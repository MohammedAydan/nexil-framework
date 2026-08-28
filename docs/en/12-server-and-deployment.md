# 12 — Server and Deployment

## Choose a runtime

| Runtime     | Package                           | Use case                                    |
| ----------- | --------------------------------- | ------------------------------------------- |
| Node        | `@mohammedaydan/serve`            | Full production server on a VM or container |
| Deno        | `@mohammedaydan/serve-deno`       | Fetch-native runtime or Deno Deploy         |
| Cloudflare  | `@mohammedaydan/serve-cloudflare` | Workers with an Assets binding              |
| Development | `@mohammedaydan/dev-server`       | Local development only                      |

Build the application once, then use the adapter that matches the deployment environment’s Request/Response contract.

## Production build

```bash
pnpm install --frozen-lockfile
pnpm build
```

Check for `dist/client/index.html`, `nexis-manifest.json`, and `nexis-bootstrap.js` when interactive routes exist. Also check `sitemap.xml`, `robots.txt`, `feed.xml`, and `atom.xml`.

For the standard Node path, the build is immediately runnable. No custom server file or configuration file is required:

```bash
pnpm build
pnpm start
```

`NEXIS_HOST` and `NEXIS_PORT` override the default production host and port. Set `NEXIS_SITE_ORIGIN` during the production build, or use `app.origin` in an optional typed `nexis.config.ts`, when canonical metadata and feeds need the real public origin.

## Node production server

```ts
import { createServer } from '@mohammedaydan/serve'

const app = createServer('./dist/client', {
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  redirects: [{ from: '/docs', to: '/docs/architecture', status: 308 }],
  // Set true only when the reverse proxy removes client forwarded headers.
  trustProxy: process.env.DEPLOYMENT_TRUST_PROXY === 'true',
  securityHeaders: {
    contentSecurityPolicy: "default-src 'self'; base-uri 'self'; frame-ancestors 'none'",
    // Add only when this process is exclusively reached through trusted HTTPS termination.
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
  },
})

await app.listen()
```

The official server implements route mapping, 404, 405, HEAD, MIME types, cache headers, traversal rejection, action delegation, and an optional telemetry receiver.

For application-specific request work, compose clear middleware before Nexis route handling:

```ts
import { composeMiddleware, createMiddleware } from '@mohammedaydan/serve'

const handler = composeMiddleware(
  requestId,
  resolveSession,
  rateLimit,
  createMiddleware('./dist/client'),
)
```

Middleware is the correct layer for request IDs, session resolution, rate limits, and private route guards. Authorization for a particular mutation still belongs in the Action that owns that mutation.

## Deno

`createDenoHandler` creates a Fetch handler, while `serveDeno` calls `Deno.serve` in a real Deno runtime. Provide an asset map or delegate route requests to an application handler.

```ts
const handler = createDenoHandler({
  assets: {
    '/index.html': { body: '<h1>Home</h1>', contentType: 'text/html' },
  },
  fallback: appHandler,
})
serveDeno(handler)
```

Do not use Node-specific `process` or `fs` APIs inside code that must run on Deno.

## Cloudflare

`createCloudflareHandler` tries the Assets binding and then delegates misses to a fallback handler. Do not assume a particular binding name; pass the interface provided by the deployment.

```ts
const handler = createCloudflareHandler({
  assets: env.ASSETS,
  fallback: appHandler,
})
```

Respect the runtime’s CPU, response-size, and storage limits instead of copying Node assumptions into a Worker.

## Redirects

Declare local, validated redirects with an allowed status. Do not accept `https://evil.test` or unsafe protocols. Test redirects with `redirect: 'manual'` so the real `308` response is visible.

## Response security headers

`securityHeaders` is explicit opt-in on the Node production server. When enabled, it
sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive
`Permissions-Policy` for every Node response, including assets, redirects,
telemetry, errors, and Actions. Override the three policy defaults only after review.

`contentSecurityPolicy` and `strictTransportSecurity` are intentionally opt-in.
Review CSP against the application’s actual scripts, styles, images, connections, and
embedding requirements. Send HSTS only when TLS termination is understood and every
reachable hostname is ready for HTTPS. Header values containing CR or LF are rejected.

## Proxy trust

Set `trustProxy: true` only behind a trusted reverse proxy. The proxy must remove
client-supplied forwarded headers and write its own trusted values. With this option,
the production Action transport uses the first validated `x-forwarded-proto` and
`x-forwarded-host` to reconstruct the public request URL for Origin evaluation. By
default those headers are ignored. If the application is directly internet-facing, do
not enable this option.

## Caching

- HTML: `must-revalidate` or a data-appropriate policy.
- Fingerprinted assets: long-lived `immutable` caching.
- Actions: no public shared caching.
- Telemetry: no shared caching.
- Private responses: `private` and excluded from shared CDN storage.

## Health checks

Create a health endpoint separate from content pages. It should not require JavaScript or perform an expensive database query. Monitor status code, latency, memory, and action errors.

## Containers

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

Use a non-root user, a read-only filesystem when possible, and explicit memory and CPU limits. Never bake secrets into the image.

## Safe deployment

Before exposing traffic:

1. Build from the lockfile.
2. Run typecheck, tests, lint, and format checks.
3. Check sitemap, robots, RSS, and Atom.
4. Check redirects, 404, 405, and HEAD.
5. Verify Origin and Idempotency behavior, including a rejected cross-origin Action.
6. Review CSP in a browser and validate cookie behavior over real HTTPS.
7. Monitor the first release and keep a rollback artifact ready.

## Workbench lab

`pnpm --filter @mohammedaydan/example-nexis-workbench verify` runs TypeScript, the Nexis budget check, and the production build for the full example. Start only the generated artifact with `pnpm --filter @mohammedaydan/example-nexis-workbench start`; do not use a development server as production evidence. The Workbench server modules illustrate integration boundaries, not a hosted database, identity provider, or durable session store.
