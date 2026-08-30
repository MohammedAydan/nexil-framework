# Architecture Decisions

## ADR-001: Cross-platform cleanup â€” no shell find/rm in scripts

- **Date:** 2026-08-25
- **Status:** Accepted (already applied locally; committed this session)
- **Context:** Root `build` used `find ... -exec rm -rf`, which fails on Windows PowerShell.
- **Decision:** Use `pnpm -r --sort build` alone; per-package builds already clean their outputs. Keep `.gitignore` covering `dist/`.
- **Consequences:** Works on all platforms; no cleanup script needed for correctness.

## ADR-002: create-nexil is the public scaffolder; create-nexil-app is superseded

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** `packages/create-nexil-app` is a byte-identical duplicate of `packages/create-nexil` except bin name. Publishing both confuses consumers.
- **Decision:** Keep `@nexil/create-nexil` as the single public initializer. Mark `@nexil/create-nexil-app` `"private": true` (build still runs; never published) and update its README to point at create-nexil. Update root README accordingly.
- **Alternatives considered:** Publish both (confusing); delete the package (loses history/reference).
- **Consequences:** One canonical scaffold command; no accidental duplicate publication.
- **Amendment (GA):** The `create-nexil-app` NAME survives as a second bin on `@nexil/create-nexil` (`npm exec --package @nexil/create-nexil -- create-nexil-app â€¦`), satisfying initializer-name compatibility without a duplicate package.

## ADR-003: Secure registry configuration strategy

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** Repo needs scopeâ†’GitHub Packages routing locally and in CI without committing secrets.
- **Decision:** Commit project `.npmrc` containing ONLY `@nexil:registry=https://registry.npmjs.org/`. Auth comes from user-level `.npmrc` or `${GITHUB_TOKEN}`/`${NODE_AUTH_TOKEN}` env vars. CI writes an isolated npmrc from GITHUB_TOKEN into runner temp.
- **Consequences:** No credential can leak via the repo; local dev keeps working via existing user config.

## ADR-004: Tag-driven release workflow

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** Publishing should be deliberate, not per-push.
- **Decision:** `publish-packages.yml` triggers on version tags `v*`: install â†’ typecheck/lint/test â†’ build â†’ pack dry-run validation â†’ publish in topological order â†’ smoke-verify create-nexil resolvable. Uses GITHUB_TOKEN with `contents: read` + `packages: write`.
- **Consequences:** Reproducible releases; no long-lived secrets.

## ADR-005: Resumability runtime uses stable absolute chunk URLs

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** The bootstrap imported chunks relatively from build-only paths; dev had no way to serve them, so interactive templates only worked post-build with custom hosting. Also, TypeScript handler expressions leaked type annotations into plain-JS chunks.
- **Decision:** `RESUMABILITY_BOOTSTRAP` (owned by vite-plugin) imports `/nexil-chunks/<file>`. The plugin's dev middleware serves bootstrap+chunks from live transforms; builds emit identical static paths. TypeScript route chunks pass through esbuild (`loader: 'ts'`) so emitted code is always plain JS. `transformNexilSource` is async accordingly.
- **Consequences:** Identical interactive behavior in dev and production; self-describing artifacts (`nexil-bootstrap.js`, `nexil-chunks/`, `nexil-manifest.json`).

## ADR-006: v2.0.0 GA aligns repo tag with the package version line

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** Packages sat at 0.2.x while the project narrative declared v2.0.0 GA.
- **Decision:** All 18 public packages move to 2.0.0; scaffold templates depend on ^2.0.0; tag `v2.0.0` triggers publication through the existing pipeline.
- **Consequences:** Tag ↔ registry versions match; consumers receive coherent ^2.0.0 ranges.

## ADR-007: Routes are rendered by the engine; index.html is a pure shell

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** Audit found the "ghost static file" bypass: scaffolded `index.html` carried a full pre-baked landing page, so `nexil dev`/`start` displayed static markup while `src/routes/index.tsx` was never parsed or rendered â€” the renderer, JSX runtime, signals, and resumability serializer were all bypassed.
- **Decision:** (1) Templates ship a minimal shell containing only `<!--nexil-head-outlet-->`, `<!--nexil-app-outlet-->`, `<!--nexil-scripts-outlet-->`. (2) `@nexil/dev-server` exports `nexilSSRPlugin(root)`: a Vite SSR middleware that matches requests via `@nexil/router`, loads route modules through `ssrLoadModule`, renders via `@nexil/renderer`'s `renderToString`, injects SEO head via `renderHead`, and injects the resumability bootstrap when `data-nx-on-click` is present. (3) `nexil build` executes the same engine at build time, prerendering per-route HTML into `dist/client/<route>/index.html` plus mirrored preview roots. (4) `core` re-exports `component`/`state`/`computed`/`batch` (signals from `@nexil/reactivity`) so templates can use the documented API surface.
- **Alternatives considered:** keeping the marketing HTML as the served shell (rejected: it is precisely the bypass); separate dev HTTP server inside dev-server (rejected: duplicates Vite, breaks HMR).
- **Consequences:** JSX runtime and signals execute during every render path; handler chunks resolve to real emitted files (chunk hashes normalized across transform/build contexts); interactive proof is enforced by `tests/e2e/engine-proof.spec.ts`.

## ADR-008: Composite clean must remove tsbuildinfo

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** After `pnpm -r clean` deleted only `dist/`, composite `tsc -p` considered projects up-to-date via stale `tsconfig.tsbuildinfo` and silently skipped emit, producing "successful" builds with no output (masked missing workspace links).
- **Decision:** Every package's `clean` removes both `dist` and `tsconfig.tsbuildinfo`; root `scripts/clean.mjs` does the same across packages/examples plus Playwright artifacts.
- **Consequences:** `pnpm -r clean && pnpm -r build` always produces real artifacts.

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** Packages sat at 0.2.x while the project narrative declared v2.0.0 GA.
- **Decision:** All 18 public packages move to 2.0.0; scaffold templates depend on ^2.0.0; tag `v2.0.0` triggers publication through the existing pipeline.
- **Consequences:** Tag â†” registry versions match; consumers receive coherent ^2.0.0 ranges.

---

## ADR-009: Static scope serialization for resumable state captures

- **Date:** 2026-08-26
- **Status:** Accepted
- **Context:** Lazy handlers closing over signals/stores compiled to `scope.count`, and the bootstrap could materialize scope refs from `data-nx-scope` - but nothing emitted that attribute, so handlers received undefined and crashed on first click. useState tuples were never classified as captures; captures carried no initial value to serialize; and computeds created inside effects went permanently stale because computed hoisted dependency unsubscribes into the parent context.
- **Decision:** The Vite transform emits `data-nx-scope` beside every boundary reference whose handler has classifiable captures. Signal/store captures require JSON-literal initializers (balanced-paren scan + strict JSON parse); action captures require local string endpoints; unserializable captures downgrade to `unsupported` build diagnostics per the documented philosophy. Both useState tuple positions classify as one signal capture. `computed` owns its subscriptions exclusively (hoisting removed), fixing stale derivations after parent effect re-runs. Exported bootstrapResumability matches the shipped minified contract with registry-cached materialization keyed by scope id. ScopeRegistry.register disposes overwritten entries.
- **Alternatives considered:** Runtime value extraction during compile (rejected: non-deterministic, SSR-order coupling); page-level scope manifest (deferred: per-element attributes match the shipped bootstrap design).
- **Consequences:** Documented state patterns (docs/en 06/07) are literally true; non-literal initializers warn at build time by design; ~130 raw bytes added to the bootstrap (budget gates green); e2e temp fixtures restore root symlinks before deletion and spec files run serialized.

---

## ADR-010: Nexil Stores — Convention-Based State Management (Phases 1–3)

- **Date:** 2026-08-29
- **Status:** Accepted — Phases 1–3 shipped; Phase 4 (SSR ALS + `__NEXIL_STORES__` resumability) deferred
- **Context:** The framework needed a Pinia-inspired, zero-boilerplate state layer that respects the four non-negotiable principles (Fine-Grained Signals, Zero-Hydration, Strict JSON-Serializability, SSR Isolation) and the existing resumability pipeline (`data-nx-scope`/`externalScopePayloads`). Prior `packages/state` only exposed `createStore(initial, scope)` with a single root `Signal` and `createStateRegistry`; there was no `src/stores` convention, no `defineStore`/`getters`/`this` actions, no Vite discovery, no `$stores/*` virtual, no CLI scaffolding, and no access-log for future serialization.
- **Decision:**
  - Keep legacy `createStore(initial, scope)` as **permanent overload**; add `createStore({id, state:()=>T, actions:{fn(state,...)}})` (modular draft → `batch`+`signal.set(draft)`) and `defineStore(id, {state, getters, actions:{fn(this,...)}})` (`this` = draft proxy → `signal.set(draft)`, getters = `computed` bound to `this`+`state`).
  - Store state is a **single root `Signal<T>` + transitive `Proxy`** (`createPathProxy` at `packages/state/src/index.ts:125`) with `setAtPath` array-aware structural sharing and `batch()` single-flush for both `store.x=...` and `store.items.push(...)` / `store.items[0].quantity++`.
  - Strict `isSerializable` at every `create`/`set`/proxy write; `cloneSerializable` snapshots remain immutable; reserved keys (`value/snapshot/set/setPath/lens/select/subscribe/dispose/scope`) trigger a dev-only `console.warn` (`warnIfReservedStateKeys` at `packages/state/src/index.ts:155`).
  - For HMR + future SSR, use a **global registry** `globalThis.__NEXIL_STORES_GLOBAL_REGISTRY__` and **access log** `__NEXIL_STORES_ACCESSED__` (`recordStoreAccess` at `packages/state/src/index.ts:135`, `__getAccessedStoreIds`/`__clearAccessedStoreIds`). `useStore()` reuses the global singleton and records access; Phase 4 will swap this for `AsyncLocalStorage`-per-request without changing the hook signature.
  - Vite: `discoverStores(root)` scans `src/stores` (modular `store.ts` wins over unified `*.ts`/`index.ts`, warns on collisions), generates `virtual:nexil-stores` barrel and `$stores/*` via `resolveId`/`load` (`packages/vite-plugin/src/index.ts:1463`), and writes `.nexil/stores.d.ts` (`writeStoresDTS` at `packages/vite-plugin/src/stores.ts:178`, refreshed in `configResolved`/`buildStart`). `handleHotUpdate` preserves signals via the global registry. Action batch at Vite level is intentionally a conservative no-op for MVP because runtime already batches; full AST body-wrap is a Non-Goal.
  - CLI: `nexil g store <name> --split` → `types.ts`/`actions.ts`/`store.ts` per File Contracts, `nexil g store <name> --unified` → `defineStore` file (`scaffoldStore` at `packages/cli/src/index.ts:283`), `g` alias for `generate`, `GENERATOR_PATH` validation, nested `admin/settings` IDs supported.
- **Alternatives considered:** Per-property `Signal` tree (rejected: more memory, same observable behavior via root proxy for MVP); Vite AST `batch` wrapping of every action body (deferred: runtime already guarantees single flush); per-request `AsyncLocalStorage` registry in Phase 1 (deferred to Phase 4 to keep MVP low-risk).
- **Consequences:** `src/stores` convention works end-to-end via `$stores/*` (verified by `packages/vite-plugin/src/stores.test.ts` + `packages/cli/src/generate-store.test.ts` + new `tests/e2e/stores-smoke.spec.ts`); e2e `state-scope` still green; full `pnpm build`/`typecheck`/`test` (state 19/19, vite-plugin 37/37, cli 24/24) green; `.nexil/stores.d.ts` is gitignored and regenerated on each dev/build.

---

## ADR-011: Monorepo Package Consolidation to 4 Core Packages

- **Date:** 2026-08-30
- **Status:** Accepted
- **Context:** The repository had evolved into 27 granular micro-packages (`@nexil/core`, `@nexil/reactivity`, `@nexil/state`, `@nexil/css`, `@nexil/media`, `@nexil/og-image`, `@nexil/seo`, `@nexil/security`, `@nexil/telemetry`, `@nexil/jsx-runtime`, `@nexil/client`, `@nexil/renderer`, `@nexil/server`, `@nexil/router`, `@nexil/actions`, `@nexil/adapters`, `@nexil/compiler`, `@nexil/dev-server`, `@nexil/serve`, `@nexil/serve-cloudflare`, `@nexil/serve-deno`, `@nexil/starter`, `@nexil/create-nexil-app`). This caused overhead in package dependency management, publishing, cross-package linking, and user DX where consumer apps had to declare 12+ dependencies in `package.json`.
- **Decision:** Consolidate into exactly 4 publishable packages:
  1. `packages/nexil` (`nexil`): Unified core framework package with subpaths `.`, `./jsx-runtime`, `./jsx-dev-runtime`, `./client`, `./server`, `./router`.
  2. `packages/vite-plugin` (`@nexil/vite-plugin`): Merged `@nexil/compiler` and `@nexil/vite-plugin` into a single high-performance compilation and dev plugin.
  3. `packages/cli` (`@nexil/cli`): Merged dev server, serve runtime, generators, diagnostics, and CLI runners.
  4. `packages/create-nexil` (`create-nexil`): Standalone interactive scaffolder with embedded starter templates.
  - Subpath `exports` in `packages/nexil/package.json` map both `types` and `default` entry points.
  - Cleaned up obsolete package directories and unified all 40 test suites.
- **Alternatives considered:** Keeping 19 micro-packages (rejected: complex release management and heavy consumer configs); Single monolithic package including CLI (rejected: CLI has CLI-specific runtime deps like prompts/sharp/vite not needed in browser runtimes).
- **Consequences:** Consumer `package.json` only requires `nexil` and `@nexil/vite-plugin` (or `@nexil/cli`); workspace typecheck (`tsc -b`) and Vitest test suites (40 test files, 319 unit/integration tests) pass with 100% success.
