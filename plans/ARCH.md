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

## Nexil Stores Subsystem (ADR-010)

Convention-based state layer under `src/stores/`:

- **Folder contracts:** Modular `src/stores/<id>/{types.ts,actions.ts,store.ts}` vs Unified `src/stores/<id>.ts` or `src/stores/<id>/index.ts` (`defineStore`).
- **APIs:** `createStore({ id, state: () => T, actions: { fn(state, ...) } })` and `defineStore(id, { state, getters, actions })`. Legacy `createStore(initial, scope)` overload.
- **Reactivity:** Single root `Signal<T>` + transitive `Proxy` (`createPathProxy`) + `batch()` for structural-sharing updates; `isSerializable` enforced at every write.
- **Vite:** `discoverStores(root)` scans `src/stores`, generates `virtual:nexil-stores` barrel + `$stores/*` aliases via `resolveId`/`load`, writes `.nexil/stores.d.ts`.
- **SSR & Request Isolation:** Per-request `AsyncLocalStorage` (`runWithScope`), state snapshot serialized into `<script type="nexil/state" id="__NEXIL_STORES__">`.
- **Zero-Hydration Client:** `hydrateNexilStoresFromDocument()` deserializes accessed stores into cache upon initial user interaction.

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
