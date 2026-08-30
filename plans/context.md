# Project: Nexil Framework

## Purpose

HTML-first, resumable TypeScript web framework. Monorepo of scoped packages (`@nexil/*`) published to GitHub Packages, with a scaffolding CLI (`create-nexil`) that generates consumer apps.

## Current Status

- Active feature: link-navigation-fix — **COMPLETE (2026-08-30)**
- Overall health: green
- Last updated: 2026-08-30

## Critical Constraints

- Must build/run on Windows PowerShell, Linux, macOS (no Unix-only shell in npm scripts)
- No tokens/credentials ever committed
- Generated apps must consume published packages only (no workspace leaks)
- Registry: `https://registry.npmjs.org/` for scope `@nexil`
- Prettier format gate is enforced in CI; run `pnpm exec prettier --write .` before committing new files

## Active Features

- link-navigation-fix: **COMPLETE (2026-08-30)** — Dev server injection of `/nexil-navigation.js` and `/nexil-forms.js`, Vite dev server runtime serving and bundle emission, client text-node click traversal and error-tolerant dynamic script imports.
- nexil-stores: **COMPLETE — Stabilization Mode (2026-08-30)** — `createStore`/`defineStore` Proxy (state 23/23 with request-isolation 4 tests), Vite `discoverStores` + `virtual:nexil-stores`/`$stores/*` + `.nexil/stores.d.ts` (vite-plugin 37/37), CLI `nexil g store --split|--unified` (cli 24/24), SSR ALS + `__NEXIL_STORES__` per-route (home `user:42` / cart `cart:7` via `buildArtifacts` + `dev-server` `runWithScope`, client `hydrateNexilStoresFromDocument` before `bootstrapResumability`), reserved-key dev warning + per-request `__nexil:stores:registry`/`__nexil:stores:access` + `globalThis.__nexil_buildRequestContext` fallback. See `plans/nexil-stores/review.md` → **Current Capabilities & Limitations** and **Prioritized Follow-ups**.
- windows-build-publish: complete

## Known Issues / Tech Debt

- A GitHub PAT was exposed in a prior conversation; user must revoke it (policy in SECURITY.md)
- All 18 published packages are PRIVATE on GitHub Packages. Visibility flip is a manual UI-only action per package (no REST API for user-owned npm packages). Anonymous installs return 401 regardless — GitHub Packages npm always requires auth.
- Deno smoke test cannot run locally (Deno not installed); it runs in CI via quality.yml

## Team / Ownership

- All areas: MohammedAydan
