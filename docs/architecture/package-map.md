# Nexil Package Map

## Dependency direction

The dependency graph is intentionally one-directional. Low-level contracts do not import renderers, adapters, or CLI code. Server-only concerns cannot be imported by the client graph.

```text
shared -> core -> jsx-runtime
shared -> core -> reactivity
shared -> core -> renderer
core -> router -> compiler -> cli
core -> server -> actions
core -> server -> security
core -> seo -> renderer
core -> media -> compiler
renderer -> adapters
compiler -> dev-server -> cli
```

## Package ownership

| Package       | Initial status | Allowed responsibilities                                     |
| ------------- | -------------- | ------------------------------------------------------------ |
| `core`        | active         | nodes, components, serializable values, request context      |
| `reactivity`  | active         | signals, computed values, subscriptions                      |
| `jsx-runtime` | active         | JSX factory and intrinsic types                              |
| `renderer`    | active         | escaped deterministic SSR output and render modes            |
| `client`      | active         | versioned resumability payloads and handler references       |
| `compiler`    | active         | boundary diagnostics and performance budgets                 |
| `server`      | active         | request-scoped data, secure cookies, security headers        |
| `router`      | active         | traversal-safe route discovery and matching                  |
| `seo`         | active         | validated metadata, JSON-LD, sitemap, robots                 |
| `media`       | active         | dimension-safe image and local font contracts                |
| `css`         | active         | deterministic compile-time style extraction                  |
| `actions`     | active         | validation, authorization, origin and idempotency primitives |
| `security`    | active         | storage-agnostic sessions and authorization guards           |
| `state`       | active         | scoped stores, selectors, snapshots, lifecycle               |
| `dev-server`  | planned        | HMR and development diagnostics                              |
| `cli`         | planned        | create, dev, build, start, check, analyze, routes            |
| `adapters`    | active         | Node, Cloudflare, Deno runtime integration                   |

## Rules

A package must not add a dependency upward in this graph. Public contracts must use Web Standard types where practical. Any dependency that can enter a client graph requires an explicit review of size, browser compatibility, and secret exposure. Database, authentication, payments, and UI libraries remain outside the core.
