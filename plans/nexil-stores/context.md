# Context: nexil-stores

## Files to create

- `plans/nexil-stores/plan.md` — this feature's goal/criteria/approach (done)
- `plans/nexil-stores/tasks.md` — phased task breakdown (done)
- `plans/nexil-stores/context.md` — this file
- `plans/nexil-stores/review.md` — post-implementation notes (Phase 5)
- `packages/vite-plugin/src/stores.ts` — discovery + virtual barrel + d.ts generation + action batch AST transform
- `packages/state/src/stores-proxy.test.ts` — new store proxy tests (Phase 1)
- `packages/vite-plugin/src/stores.test.ts` — discovery/virtual/HMR tests (Phase 2)
- `packages/cli/src/generate-store.test.ts` — CLI scaffolding tests (Phase 3)
- `packages/renderer/src/stores-serializer.test.ts` — SSR serializer tests (Phase 4)
- `packages/client/src/stores-resume.test.ts` — client resumability tests (Phase 4)
- `tests/e2e/stores-resume.spec.ts` — browser proof (Phase 5)
- `.nexil/stores.d.ts` — generated type hints (gitignored, never committed)

## Files to modify

- `packages/state/src/index.ts` — add object-overload `createStore` + `defineStore` + Proxy (preserve legacy `createStore(initial, scope)` + `createStateRegistry()` at lines 56–149)
- `packages/state/package.json` — no new external deps expected; verify `peer`/`exports` still correct
- `packages/reactivity/src/index.ts` — verify `batch` reentrancy (244–252) and `computed` cycle detection (141–159); change only if bug found
- `packages/vite-plugin/src/index.ts` — import `stores.ts`, register `virtual:nexil-stores` + `$stores/*` alias, hook batch wrapping + HMR, wire `.nexil/stores.d.ts` generation; preserve existing `transformNexilSource` (929–1397) and `nexil()` plugin (1399+)
- `packages/vite-plugin/src/bootstrap.ts` / `external-bootstrap.ts` — no change unless `__NEXIL_STORES__` reader needs shim extension
- `packages/cli/src/index.ts` — extend `NexilCommand` + `helpText()` + `scaffoldCliArtifact` path to handle `generate store` (reuse `GENERATOR_PATH` at 209, `scaffoldCliArtifact` at 219)
- `packages/cli/src/scaffold.ts` — re-export if starter adds store scaffolding helpers; else keep as-is and implement directly in cli
- `packages/starter/src/node.ts` — optionally add `scaffoldStore(project, name, variant)` helper; if added, keep `createStarterFiles` + `parseScaffoldArgs` + `isContainedPath` + `assertScaffoldProjectName` compatible
- `packages/core/src/index.ts` — reuse `getAls()` (177–204) + `getActiveScope()` (206–208) for registry scoping; no Context API change
- `packages/renderer/src/index.ts` / `stream.ts` — no direct change; serializer hook lives in `cli/src/index.ts:buildArtifacts` (914) and `packages/dev-server`
- `packages/dev-server/src/*` — mirror serializer + ALS registry disposal (same as cli build path)
- `packages/client/src/*` — client-side `__NEXIL_STORES__` reader (reuse `bootstrapResumability` flow)
- `plans/ARCH.md` — add Store subsystem to Core Components
- `plans/TECH_STACK.md` — record any new dep (none expected) or `files` negations
- `plans/DECISIONS.md` — ADR-010 Nexil Stores
- `plans/PATTERNS.md` — proxy+batch + virtual-stores patterns
- `plans/context.md` + `plans/SESSION_LOG.md` — status updates
- `.gitignore` — ensure `.nexil/` is ignored (already)

## Dependencies to add

- None new expected. Reuse: `@nexil/core:isSerializable` (63), `@nexil/reactivity:batch,computed,state,effect` (244,124,71), `@babel/parser` + `magic-string` (already in vite-plugin), `vite` `transformWithEsbuild` pattern.

## Env vars needed

- None. Existing `NEXIL_SITE_ORIGIN`, `NEXIL_HOST/PORT` unchanged. Dev warnings via `process.env.NODE_ENV !== 'production'`.

## Open Questions — RESOLVED 2026-08-29 (Phase 0 approved)

1. **Legacy overload retention** — **RESOLVED: keep `createStore(initial, scope)` as permanent overload** (backward compat forever). New object form coexists via discriminated union.
2. **Getter `this` vs `state` param** — **RESOLVED: support both.** Always bind `this` to proxy AND pass `state` as first arg, so `(state)=>V` and `function(){ return this.x }` both work. Getter → read-only `computed()`.
3. **Proxy depth** — **RESOLVED: transitive proxies** via single root `Signal<T>` + structural sharing. Nested get returns nested proxy backed by same root; set does `setAtPath`-style copy + `batch()+signal.set`.
4. **Action mutation style** — **RESOLVED: modular receives mutable deep-clone draft** (via `cloneSerializable`) committed once via `batch()+signal.set`; unified `this`-actions bound to proxy with batch trap. Both coalesce multiple mutations into one flush.
5. **Store ID collisions** — **RESOLVED: modular `store.ts` wins** over unified `*.ts`; emit build warning if both exist.
6. **Serialization boundary** — **RESOLVED: only accessed stores** (registry `accessLog` WeakSet) go into `__NEXIL_STORES__`, not every discovered store.
7. **Client bootstrap ordering** — **RESOLVED: `__NEXIL_STORES__` reader loads before `nexil-bootstrap.js`**; reuse `externalScopePayloads` ordering.
8. **HMR granularity** — **RESOLVED: swap both actions and getters; keep signals.** Shape-changing HMR (id/state shape change) may require reload — deferred per Non-Goals.
9. **Prioritization** — **RESOLVED: MVP = Phase 1+2 (core Proxy + Vite discovery).** Phase 3 CLI parallelizable after 1.6; Phase 4 HMR/resumability secondary and may lag MVP.

## Current state (baseline at branching)

- `packages/state/src/index.ts:1-149` — `createStore<T>(initial:T, scope:StateScope)` + `createStateRegistry():StateRegistry` + `Store<T>` with `value/select/lens/setPath/snapshot/subscribe/dispose`; tests at `packages/state/src/index.test.ts` cover lens/select/serializability/disposal.
- `packages/reactivity/src/index.ts:1-323` — `state`, `computed`, `effect`, `watch`, `batch`, `untrack`, `createRoot`, `resource` all present; `batch` depth+flush at 244–252.
- `packages/core/src/index.ts:1-436` — `isSerializable` (61), `Context`+`AsyncLocalStorage` ALS via `getAls()` (177), `getActiveScope()` (206), `createRequestContext` (103).
- `packages/vite-plugin/src/index.ts:929-1412` — `transformNexilSource` with `data-nx-scope` capture/binding HMR-aware; `externalizeScopeAttributes`; `nexil()` plugin with dev middleware. No store scanning yet.
- `packages/cli/src/index.ts:153-263` — `NexilCommand` set + `helpText()` + `scaffoldCliArtifact` (route/component/action); `GENERATOR_PATH` sanitizer (207).
- `new_updates/nexil-stores-architecture.md` — 9 chapters; source of truth for folder contracts, plugin pipeline, APIs, benchmark, examples.
- `tests/e2e/state-scope.spec.ts` — proves lazy scope resume; will be template for `stores-resume.spec.ts`.
