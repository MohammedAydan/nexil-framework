# Nexis framework improvement notes

## Current verified behavior

| Concern                     | Current behavior                                                                                                                                                            | Improvement direction                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated project lifecycle | The initializer already emits `dev: nexis dev`, `build: nexis build`, and `start: nexis start`.                                                                             | Preserve these commands, make `start` use the route-aware production server rather than Vite preview, and give it sensible default host/port/output behavior. |
| Production serving          | `nexis start` currently invokes Vite `preview`, while `nexis serve` invokes the official static, Action-aware production server.                                            | Make `start` the clear production default; retain `serve` as a compatibility alias.                                                                           |
| Default production output   | Build emits `dist/client`, server route modules, manifests, SEO artifacts, generated OG images, and resumability runtimes.                                                  | Keep automatic output. Add a clear runtime configuration model only for deviations such as origins, redirects, caches, Action policy, and middleware.         |
| Existing server API         | `createProductionServer()` wraps `createProductionMiddleware()` and provides serving, action dispatch, safe redirects, cache control, telemetry, and 404/405/HEAD behavior. | Introduce concise aliases `createServer()` and `createMiddleware()` while preserving existing exported names as deprecated-compatible aliases.                |
| Existing Action policy      | An Action validates then optionally authorizes before handling. The server applies Origin checks and optional idempotency.                                                  | Preserve the Action contract. Introduce concise authorization helpers and a first-party session abstraction that accepts application-owned storage.           |
| Existing cookie helpers     | The server package provides parsing and secure serialization defaults.                                                                                                      | Build `createSession()` on these helpers without shipping a user store, credential flow, or identity provider.                                                |
| Current gap                 | There is no first-party auth/session/RBAC/middleware composition API.                                                                                                       | Add a new `@nexis/security` package exposing session creation, principals, permission guards, composable middleware, and policy helpers.                      |

## Proposed developer experience

```bash
pnpm dev       # development server
pnpm build     # production artifact
pnpm start     # route-aware Nexis production server
```

The default should need no `nexis.config.*` file. A project can opt into custom behavior with a typed `nexis.config.ts` export.

```ts
import { defineConfig } from '@nexis/serve'

export default defineConfig({
  app: { origin: 'https://app.example.com' },
  server: { port: 3000 },
  security: { actionOrigins: ['https://app.example.com'] },
})
```

## Security boundary

Framework APIs should make the secure path concise, but they must not pretend to provide an identity provider, password hashing policy, OAuth/OIDC verifier, user database, persistence, distributed rate limiter, or audit-log service. The new session API must require a caller-provided storage adapter and should surface explicit errors when a principal is missing or lacks a required permission.
