# Nexis

Nexis is an HTML-first TypeScript web framework designed around server rendering, progressive enhancement, resumability, fine-grained reactivity, and edge-compatible Web Standard APIs.

## Architectural contract

Nexis ships static HTML by default. A route without interaction must ship **0 KB of client JavaScript**. Interactive routes are constrained to a **15 KB gzipped route budget**, and the resumability bootstrap is constrained to **1 KB gzipped**. The renderer does not use a virtual DOM or reconciliation engine; future client updates must target fine-grained DOM bindings.

The framework core is request-isolated and must not use mutable server singletons for user state. Server-only modules cannot cross into client graphs, secrets cannot enter public bundles, and all raw HTML, redirect, cookie, action, and cache APIs require explicit secure semantics.

## Development baseline

The project uses pnpm workspaces, strict TypeScript, Vitest, ESLint, and Prettier. The public framework API must not depend on Vite even though Vite is the initial build and development implementation detail.

```bash
pnpm install
pnpm check
pnpm build
pnpm security
```

## Repository layout

- `packages/` contains framework packages.
- `examples/` contains executable fixtures and compatibility examples.
- `docs/adr/` contains signed architectural decisions.
- `docs/security/` contains threat models and control mappings.
- `.github/workflows/` contains reproducible CI gates.

## Status

The repository is in Phase 0/1 implementation. Public APIs are experimental until the first release candidate. PPR remains experimental until cross-adapter parity and cache-isolation tests pass.
