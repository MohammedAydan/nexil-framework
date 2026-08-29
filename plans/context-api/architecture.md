# Architecture: Context API — Recon-Grounded Design

## 1. Recon Findings (trust repo over prompt — verified 2026-08-29)

**Package map** `package.json:15` + `pnpm-workspace.yaml:1` → 19 packages: `core`, `jsx-runtime`, `reactivity`, `state`, `compiler`, `vite-plugin`, `client`, `renderer`, `router`, `seo`, `media`, `actions`, `server`, `security`, `adapters`, `serve`, `serve-deno`, `serve-cloudflare`, `telemetry`, `cli`, `create-nexil` (+ `create-nexil-app` alias, `css`, `dev-server`, `og-image`, `starter`). Scripts: `build`, `typecheck: tsc -b`, `lint`, `format:check`, `test: vitest run`, `test:e2e: playwright`, `test:edge: miniflare-smoke.mjs`, `test:parity`, `test:node-runtime: node-smoke.mjs`, `test:deno`, `budget/check:budget` via `@nexil/compiler`.

**Existing Context primitive** `packages/core/src/index.ts:93` `ContextScope { parent?, values: Map<symbol,unknown> }`, `packages/core/src/index.ts:98 createContextScope`, `packages/core/src/index.ts:103 createRequestContext(request,id)` (already per-request), `packages/core/src/index.ts:36 ComponentContext { requestId?, scope?:ContextScope }`, `packages/core/src/index.ts:155 Context<T> { Provider, useContext, use }`, `packages/core/src/index.ts:177 provideContext`, `packages/core/src/index.ts:188 withContext`, `packages/core/src/index.ts:233 createContext(defaultValue)`. **Flaw:** `packages/core/src/index.ts:167 let activeContextScope` is a mutable module singleton — violates §6. Provider falls back to `previous ?? createContextScope()` when no `scope` passed.

**Request isolation** `packages/server/src/index.ts:1 createDataContext` + `packages/core/src/index.ts:103 createRequestContext` is the existing backbone — must reuse, not duplicate. No `AsyncLocalStorage` yet; current isolation is via passing `ComponentContext.scope` explicitly (see `adapters`).

**Resumability** `packages/client/src/index.ts:176 materializeScope`, `packages/vite-plugin/src/index.ts:146 captureExpression`, `packages/vite-plugin/src/index.ts:344 classifyScopeCaptures` (`signal|store|action|value|unsupported`), `packages/vite-plugin/src/index.ts:456 buildScopePayload` → `data-nx-on-*="chunk#export" data-nx-scope="{...}"` + `externalScopePayloads` opaque `nx:scope:<hash>` + `globalThis.__nexilScopeRegistry` + `globalThis.__nexilDisposeBindings/__nexilRefreshBindings` with `g:ref.lifetime==='global'` preservation already fixed in `packages/vite-plugin/src/bootstrap.ts:2` + `external-bootstrap.ts`. `RESUMABILITY_BOOTSTRAP` (events) vs `RESUMABILITY_BINDINGS` (Signal→DOM) vs `RESUMABILITY_FORMS` (progressive) are additive.

**Compiler boundaries** `packages/vite-plugin/src/index.ts:699 on*$` / `bind* $` only. `useContext` not suffixed → plain read. Verified: no `useContext` in compiler budget.

**Router** `packages/router/src/index.ts:85 routeFromFile`, `packages/router/src/navigation.ts:76 __nexilDisposeBindings` + `__nexilRefreshBindings` after `#app` swap. `_layout.tsx` composition via `layouts` array per `routeFromFile`. Layout-owned vs route-owned disposal rides on same registry `g` flag.

**Rendering modes** `packages/renderer/src/modes.ts:36 renderRoute` → `static|isr|server|partial`. ISR cache key is `input.key` string — must not leak scoped HTML across keys.

**Budgets** `packages/compiler/src/budget.test.ts` historically tracks bootstrap <2KB raw, chunk <2KB. Current `pnpm check:budget` baseline to re-record pre-context.

**Docs** `docs/en/` + `docs/ar/` bilingual; ADRs `docs/adr/phase-2-production-parity.md`.

## 2. Ownership Model

- `createContext<T>(default)` creates `symbol` key + `id = nx:ctx:<hash(default)>` stable.
- Value lives in `ContextScope.values` map chained via `parent`. Nearest `Provider` wins via `readContextValue` walk.
- Ownership explicit: `Provider` without `scope` inherits `AsyncLocalStorage` current request scope (server) or `globalThis.__nexilScopeRegistry` entry for client layout-owned contexts flagged `global`-like (survives `__nexilDisposeBindings`). Route-owned contexts are not flagged `global` and are disposed on `navigation.ts:76`.

## 3. Server Scope Creation/Lookup

Replace `activeContextScope` singleton with:

```ts
import { AsyncLocalStorage } from 'node:async_hooks'
const als = new AsyncLocalStorage<ContextScope>()
```

Adapters (`@nexil/adapters`, `@nexil/serve`) create `createRequestContext(request)` per HTTP request, then `als.run(ctx.scope, () => renderToStringAsync(...))`. `createContext`'s `use`/`useContext` first checks explicit `scope` arg, then `als.getStore()`, then walks to `defaultValue`. No module mutable singleton. Concurrency test: 500x `renderRoute` with unique `request-*` values, random `sleep`, assert isolation.

## 4. Provider Nesting Resolution

`provideContext(scope, ctx, value)` returns `createContextScope(scope)` with `values.set(key,value)` without mutating parent (already `packages/core/src/index.test.ts:57` verifies). `Provider` does `const next = provideContext(als.getStore() ?? scope ?? createContextScope(), ctx, value); als.run(next, () => deepResolve(children))` for sync children. Async children must carry scope explicitly via `withContext` or `ComponentContext.scope` — `deepResolve` already throws on async child `packages/core/src/index.ts:202` to prevent implicit leakage.

## 5. SSR Lifecycle

- `renderToString` / `renderChild` must thread `ContextScope` via `als` (server) — HTML already contains resolved `useContext` values synchronously; no async gap.
- Error: `try/finally` restores `als` state via `als.exit` semantics; after throw, `RequestContext` disposable — subsequent request unaffected.

## 6. SSG Lifecycle

Static generation runs without `Request` — falls back to `createContextScope()` with only defaults and layout-provided static values. No cache leakage because `renderRoute` ISR cache stores final `html` string per `input.key`, which already includes resolved context.

## 7. Client Lifecycle

- Static consumer: zero `ScopeRef`, no `data-nx-scope`, no bootstrap.
- Interactive consumer: `vite-plugin` capture classifies `useContext(Ctx)` inside `on*$` handler as free variable `Ctx`? Instead, handler captures the _resolved value_ via `scope` lookup? To avoid serializing arbitrary objects, policy: if context value is `Signal|Store` (reactive reference), capture its `ScopeRef` via existing `signal|store` path — context just resolves to same ID. If plain serializable value, capture as `value` kind. If non-serializable (function/class instance) accessed inside `$` handler and not re-derivable, emit `unsupported` warning (same `classifyScopeCaptures` path). This keeps fine-grained reactivity (`effect`/`bindSignalToDOM`) unchanged.

## 8. Router Lifecycle

- Layout `_layout.tsx` `Context.Provider` → scope flagged `g:true` in client registry (layout-owned). Survives `__nexilDisposeBindings` filtering (`for (const[id,live]of registry) if(!live.g) delete`).
- Route-disposed: route file's provider scope not flagged `g`, removed on `navigation.ts:76 swap`.
- Back/forward and failed navigation (404/throw) leave layout registry intact — verified via E2E `Link` navigation matrix.

## 9. Resumability / Serialization Strategy

Extend existing registry, not new: add `ScopeRefKind = 'ctx'` and `ScopeRefCtx { kind:'ctx', id:'nx:ctx:<hash>', value?:Serializable, defaultValue?:Serializable }`. Browser `materializeScope`/`__nexilScopeRegistry` resolves same as `signal/store`. Bootstrap already handles `value|unsupported` passthrough. Alternative for Signal-backed contexts: reuse `nx:signal`/`nx:store` IDs directly so no duplication — context indirection collapses to same signal store. IDs are `stableHash(source+defaultValue)` `packages/client/src/index.ts:497 stableHash`. Collision-safe, request-safe via per-request scope, disposable via registry.

## 10. Disposal Strategy

- Server: `RequestContext` GC after response (no explicit dispose needed beyond dropping `als`).
- Client: `__nexilDisposeBindings` clears non-`g` entries; route-owned ctx cleared; layout-owned persists across `Link` soft nav, reset on hard `location.reload()` because registry is in-memory `globalThis` recreated on full document load.

## 11. Performance Strategy

- Static pages: `0` bytes ctx JS (no `ScopeRef`, no bootstrap).
- Interactive: only handler's chunk + `~bytes` for `ctx` registry entry (reuse `signal` path when possible). Measure `pnpm check:budget` delta; shared `nexil-bootstrap.js` / `nexil-bindings.js` growth budgeted against `<2KB` threshold — if over, document conflict here per mission statement, not silently ship.

## 12. Conflict Note

If non-serializable values must be resumable, conflict with zero-JS static: resolution is to reject with dev diagnostic (match `@nexil/compiler` unsupported capture) and require re-derivation inside handler from serializable context — preserves invariants over test-green shortcuts.
