# System Architecture

## Overview

Streamlined monorepo producing **4 publishable packages**:

1. `nexil` — Unified core framework with subpaths (`.`, `./jsx-runtime`, `./jsx-dev-runtime`, `./client`, `./server`, `./router`).
2. `@nexil/vite-plugin` — Official Vite plugin and resumability compiler.
3. `@nexil/cli` — Developer command-line interface (`nexil dev`, `nexil build`, `nexil start`, `nexil check`, `nexil generate`, `nexil doctor`).
4. `create-nexil` — Interactive project scaffolding tool.

Examples consume workspace dependencies locally; external consumers install `nexil` and `@nexil/vite-plugin`.

## Architecture Pattern

pnpm workspace monorepo with 4 consolidated packages. TypeScript project references (`tsc -b`) enable strict typechecking across the entire workspace with zero circular dependencies.

## Core Package Structure

| Package          | Package Name         | Exports / Subpaths                                                                                                                                                                                                                                                                                                                                          | Responsibility                                                                                        | Location                |
| ---------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------- |
| **nexil**        | `nexil`              | `.` (Core, Reactivity, State, CSS, Media, SEO, Security, Telemetry)<br>`./jsx-runtime` & `./jsx-dev-runtime` (JSX factory & definitions)<br>`./client` (Event delegator, Resumability dispatcher, chunk loader)<br>`./server` (SSR streaming, HTML serializer, RequestEvent, actions, adapters)<br>`./router` (File-based router, navigation, routeLoader$) | Unified core framework engine                                                                         | `packages/nexil`        |
| **vite-plugin**  | `@nexil/vite-plugin` | `.`                                                                                                                                                                                                                                                                                                                                                         | Resumability compiler, AST transforms, dollar-suffix ($) extraction, store auto-discovery, JSX config | `packages/vite-plugin`  |
| **cli**          | `@nexil/cli`         | `.`                                                                                                                                                                                                                                                                                                                                                         | CLI runner for dev server, production server, generators, diagnostics, image optimization             | `packages/cli`          |
| **create-nexil** | `create-nexil`       | `.`                                                                                                                                                                                                                                                                                                                                                         | Standalone scaffolding CLI for template generation                                                    | `packages/create-nexil` |

## Nexil Stores Subsystem (ADR-010 + ADR-012)

Convention-based state layer under `src/stores/`:

- **Folder contracts:** Modular `src/stores/<id>/{types.ts,actions.ts,store.ts}` vs Unified `src/stores/<id>.ts` or `src/stores/<id>/index.ts` (`defineStore`). Scoped `src/stores/<id>.ts` via `defineStoreContext` (hierarchical).
- **APIs:** `createStore({ id, state: () => T, actions: { fn(state, ...) } })`, `defineStore(id, { state, getters, actions })` (global singleton), `defineStoreContext(id, {state, getters, actions}) → StoreContext<StoreInstance>` (createContext-like: `Provider`/`use`/`create`). Legacy `createStore(initial, scope)` overload.
- **Reactivity:** Single root `Signal<T>` + transitive `Proxy` (`createPathProxy`) + `batch()` for structural-sharing updates; `isSerializable` enforced at every write; getters `computed`, actions `this` draftWithGetters.
- **Vite:** `discoverStores(root)` scans `src/stores`, generates `virtual:nexil-stores` barrel + `$stores/*` aliases via `resolveId`/`load`, writes `.nexil/stores.d.ts`. `transform` handles `defineStoreContext` same as `defineStore`.
- **SSR & Request Isolation:** Per-request `AsyncLocalStorage` + explicit `__nexil:request` marker (`runWithScope`), `getScopedRegistry` parent walk + request-root vs global fallback, snapshot via `__NEXIL_STORES__`.
- **Zero-Hydration Client:** `hydrateNexilStoresFromDocument()` + generic `__getStorePathSignal` via `__nexil:store-path:pending` (no hardcode `cart:doubled`).

## StoreContext (ADR-012) — Context-like Layer

Hierarchical wrapper around StoreInstance using `ContextScope` stableId `nexil:store:${id}`:

- **Creation:** `defineStoreContext(id, opts)` → `createContext<StoreInstance|undefined>(undef, stableId)` + fallback per-request singleton.
- **Usage:** `Counter.Provider({value: Counter.create({count:5}), children:()=> Counter.use().count})` nearest-wins, `Counter.use()` fallback 0, `Counter.create()` isolated, `useContextProvider` helper.
- **Isolation:** Global stores partage via `getScopedRegistry` parent walk + global fallback; Request stores per-`runWithScope(req.scope)`; concurrent `Promise.all(runWithScope(reqA), runWithScope(reqB))` isolated.

## Dependency Graph (Internal)

```
nexil (independent core framework engine)
  ├── @nexil/vite-plugin (depends on nexil)
  ├── @nexil/cli (depends on nexil, @nexil/vite-plugin)
  └── create-nexil (standalone scaffolder)
```

## Boundaries & Invariants

- Zero-Virtual DOM: AST nodes stream directly into HTML strings; signals bind directly to DOM text/attribute nodes.
- Resumability: `$ ` suffixes mark lazy-loaded code boundaries dispatched on demand.
- Isolated Request Context: Per-request isolation via `AsyncLocalStorage` ensures zero state bleed in server and edge environments.
- 4-Package Limit: Monorepo remains strictly organized around the 4 core packages.
