# Nexis Release Candidate Checklist

## Implemented in this baseline

| Area | Baseline evidence |
|---|---|
| Architecture | ADR-009 through ADR-015 and package dependency rules |
| Core | validated nodes, serializable values, request-local context |
| Reactivity | writable signals, computed values, subscriptions, disposal-oriented design |
| SSR | deterministic escaping renderer and Web Standard stream facade |
| Resumability | versioned payloads and validated handler references |
| Render modes | static, ISR with injected cache, server-private, and partial contracts |
| Compiler | server/client boundary diagnostics and hard budget API |
| Router | static, dynamic, required/optional catch-all matching with traversal rejection |
| SEO | metadata validation, safe JSON-LD, sitemap, robots |
| Media | local-source image dimensions/alt and self-hosted font contracts |
| CSS | deterministic compile-time extraction contract |
| Server/actions | request data dedup, secure cookies, CSP headers, origin and idempotency primitives |
| State | scoped stores, selectors, snapshots, registry lifecycle |
| Adapters | Node/Cloudflare/Deno handler wrappers and capability matrix |
| CLI/DX | safe project generator, commands, help, and dev revision facade |

## Mandatory pre-release commands

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm security
pnpm budget
```

## Conditions still required before Production Ready

The current baseline does not claim full Production Ready status until the generated lockfile is committed, all commands above run successfully in CI, browser E2E is added for resumability and progressive forms, real Vite integration is wired into compiler/dev-server packages, AVIF/WebP transformation is connected to an asset pipeline, and parity smoke tests run against actual Node, Cloudflare Workers, and Deno Deploy targets.

A security release review must additionally validate CSP behavior in a browser, cookie behavior over HTTPS, CSRF and trusted-origin cases, cache isolation under concurrent requests, serializer size/depth limits, dependency SBOM, and reproducible build artifacts. PPR remains experimental until these checks pass.
