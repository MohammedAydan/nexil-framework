# Plan: createContext / useContext for @nexil/core

## Goal

Add React-ergonomic `createContext` / `useContext` / `Context.Provider` / `Context.use()` to `@nexil/core` while preserving all Nexil invariants: per-request SSR isolation, SSG, SEO-safe HTML, zero-JS static routes, resumability via existing `ScopeRef` registry, Link soft-navigation persistence for layout-owned contexts, route-owned disposal, hard-refresh reset, fine-grained reactivity, bounded bundles, no circular deps.

## Scope

IN:

- Core primitives (`createContext`, `useContext` as free fn, `Context.Provider`, `Context.use`)
- Optional internal helpers `createContextScope`/`provideContext`/`withContext` wired to request isolation
- Compiler classification: `useContext` is plain read, never interactive boundary
- Client/resumability extension via `nx:ctx:<id>` on existing `ScopeRef` registry + bootstrap
- Router/layout lifecycle wiring, SSR `renderToString` scope threading
- Docs `docs/en` + `docs/ar`, ADR, tests, E2E `tests/e2e/context-lifecycle.spec.ts`

OUT:

- React / VDOM dependency
- Router/compiler/renderer wholesale rewrite
- Second global singleton / second serialization scheme
- Implicit persistence across hard refresh

## Approach (recon-grounded)

- Reuse `packages/core/src/index.ts:98` `createContextScope`/`createRequestContext` and `ComponentContext.scope` as storage backbone; replace `activeContextScope` global (currently `packages/core/src/index.ts:167 let activeContextScope`) with `AsyncLocalStorage<ContextScope>` + explicit `scope` threading.
- Extend `packages/client/src/index.ts` + `packages/vite-plugin/src/index.ts` `ScopeRef` (`value|signal|store|action|unsupported`) with `ctx` kind (`nx:ctx:<id>`), same `hash` + `globalThis.__nexilScopeRegistry` + `__nexilDisposeBindings` policy already used for `global` store (`packages/vite-plugin/src/external-bootstrap.ts:12 g:ref.lifetime==='global'`).
- Compiler: `useContext(...)` / `Ctx.use()` not in `$`-suffix boundary list (`packages/compiler` budget + `packages/vite-plugin/src/index.ts:699 on*$`); capture only when inside `on*$` handler via existing `classifyScopeCaptures` extended to import-aware `userStore`-style path (already fixed for global stores).
- Runtime bundle policy: static `useContext` emits no `data-nx-on-*` / `data-nx-scope` / bootstrap; interactive `onClick$` referencing context resolves via `nx:ctx` registry, same deferred `nexil-bootstrap.js` / `nexil-bindings.js` split.

## Dependencies

- Existing request isolation (`@nexil/server` `createRequestContext`)
- Existing ScopeRef registry (`@nexil/client`, `@nexil/compiler`, `vite-plugin` `RESUMABILITY_BOOTSTRAP/BINDINGS`)
- Router `_layout.tsx` composition, `renderer/modes.ts` (static/isr/server/partial)

## Complexity: XL

## Acceptance (condensed Definition of Done Sec 23)

All rows mirror task spec §23; recon gates: `pnpm build/typecheck/lint/format:check/test/check:budget/test:parity/test:node-runtime/test:edge/test:e2e/security`
