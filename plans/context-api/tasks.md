# Tasks: context-api

[ ] T0 — Recon (completed 2026-08-29)
[x] Read package.json:15 scripts, pnpm-workspace.yaml, packages/_/package.json map (19 pkgs)
[x] Read packages/core/src/index.ts:93 Scope + index.ts:167 activeContextScope singleton flaw
[x] Read packages/server/src/index.ts:1 DataContext, packages/client/src/index.ts:176 materializeScope, vite-plugin capture/registry, router/navigation.ts:76 dispose, renderer/modes.ts:36 renderRoute modes, compiler budget + on_$ boundary, docs/adr/phase-2

[ ] T1 — Core: request isolation (no global singleton)
[ ] Replace let activeContextScope with AsyncLocalStorage<ContextScope> in packages/core/src/index.ts
[ ] Wire Provider/useContext to ALS + explicit scope fallback; keep provideContext/withContext/createContextScope
[ ] Add useContext free function export (createContext already has .use/.useContext)
[ ] Preserve explicit `scope` prop for sync structural composition

[ ] T2 — Value-type policy (arch §4)
[ ] Document Serializable plain | Signal/Store reactive | runtime-only class/fn (unsupported) in architecture.md (done) + enforce via isSerializable + classifyScopeCaptures inside handlers
[ ] Dev diagnostic for non-serializable Provider value inside $ handler (unsupported -> warning, prod ignored)

[ ] T3 — Compiler classification
[ ] Confirm useContext not in on*$ / bind*$ list; no new interactive promotion
[ ] Add ctx capture path only when useContext/Ctx.use appears inside on*$ handler — reuse signal/store/value kinds

[ ] T4 — Resumability registry extension
[ ] Extend ScopeRefKind with 'ctx' -> nx:ctx:<hash> in packages/client/src/index.ts + packages/vite-plugin/src/index.ts classifyScopeCaptures/buildScopePayload
[ ] Extend bootstrap.ts / external-bootstrap.ts + bindings.ts to materialize ctx (or collapse Signal-backed ctx to existing nx:signal/store id)
[ ] Ensure lifecycle: layout-owned g:true survives __nexilDisposeBindings, route-owned disposed

[ ] T5 — Renderer/Router/Adapter wiring
[ ] Adapters/serve enter ALS.run(scope, () => renderToStringAsync) per request
[ ] Verify static/isr/server/partial isolation via 500-concurrent renderRoute test

[ ] T6 — Zero-JS static verification
[ ] Build output asserts: static consumer emits no data-nx-on-*, no data-nx-scope, no bootstrap
[ ] Playwright JS-disabled run

[ ] T7 — Interactive + reactivity
[ ] onClick$ referencing ctx via signal/store preserves fine-grained effect/bindSignalToDOM, no broad re-render

[ ] T8 — Navigation matrix
[ ] Link persistence (layout), disposal (route), nested layouts, back/forward, 404, hard refresh reset

[ ] T9 — Budgets & code splitting
[ ] Baseline pnpm check:budget vs static vs interactive vs multi-ctx; assert A chunk not fetching B/C

[ ] T10 — Tests & docs
[ ] Unit: defaults, null/undefined, nesting nearest-wins, value types
[ ] Concurrency 500 + async + error isolation
[ ] E2E tests/e2e/context-lifecycle.spec.ts (canonical §19 flow)
[ ] docs/en + docs/ar + ADR docs/adr/context-api.md
[ ] review.md + pnpm build/typecheck/lint/format:check/test/check:budget/test:parity/test:node-runtime/test:edge/test:e2e/security all green
