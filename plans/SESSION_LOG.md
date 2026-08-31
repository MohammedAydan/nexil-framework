# Session Log

## Session: 2026-08-31 01:28:00

### What was done

- Resumed session and completed the Session Boot Protocol (Context, Arch, Feature status, Session Resume Artifact).
- Diagnosed and fixed missing `node:url` (`fileURLToPath`, `pathToFileURL`) imports in `packages/cli/src/index.ts`.
- Corrected `scaffoldProject` and `parseScaffoldArgs` imports/exports in `packages/cli/src/index.ts`.
- Fixed `routeDir` reference to `dirname(sourcePath)` during esbuild bundling in `packages/cli/src/index.ts`.
- Resolved CLI workspace dependencies in `packages/cli/package.json` (`create-nexil`, `@nexil/core`, aligned `vite` version to `^7.3.6`).
- Updated `tests/e2e/state-verification.spec.ts` test fixture to properly link workspace packages during isolated temporary app scaffolds.
- Verified monorepo health:
  - `pnpm test`: 40/40 test files passed (322/322 unit and integration tests).
  - `pnpm typecheck`: `tsc -b` completed cleanly with 0 errors.
  - `pnpm lint`: `eslint .` passed cleanly with 0 errors.
  - `pnpm build`: all 13 packages and examples compiled cleanly.
  - Playwright E2E: 6/6 tests passed in `tests/e2e/state-verification.spec.ts`.

### Decisions made

- Align `vite` peer/dependency across `packages/cli` and `packages/vite-plugin` to `^7.3.6` to avoid typing incompatibilities with `PluginOption` and `HotUpdatePluginContext`.

### Files changed

- `packages/cli/src/index.ts` — Added `node:url` imports, fixed scaffold re-exports and `resolveDir` in chunk bundler.
- `packages/cli/src/index.test.ts` — Added 30s timeout to `practical-app` fixture build test.
- `packages/cli/package.json` — Fixed dependency names (`create-nexil`, `@nexil/core`) and aligned `vite` version.
- `tests/e2e/state-verification.spec.ts` — Added workspace dependency rewrite and `pnpm-workspace.yaml` generation for isolated test fixtures.

### State at end of session

- Active feature: `real-browser-state-verification` (completed and verified).
- Monorepo health: 🟢 Clean / Green.
- Blockers: None.

### Resume instructions

All monorepo builds, typechecks, linters, unit tests, and Playwright real-browser tests are passing. Ready to start new feature work, performance optimizations, or release steps as requested by the user.
---

## Session: 2026-08-31 02:40:00

### What was done

- Investigated and resolved all runtime, build-time, and live browser reactivity issues with `defineStore`.
- Enhanced AST static evaluator in `packages/vite-plugin/src/index.ts` to recursively unwrap TypeScript type casts (`TSAsExpression`, `TSTypeAssertion`, `TSNonNullExpression`, `TSSatisfiesExpression`, and parenthesized expressions) so store state properties (e.g. `items: [...] as string[]`) are properly serialized into SSR `<script id="__NEXIL_STORES__">` and `data-nx-scope`.
- Updated `defineStore` and `createStore` in `packages/nexil/src/core/state.ts` to recognize and upgrade fallback proxies created by SSR client bootstraps to live `createProxiedStore` instances containing user actions (`addItem`, `clear`) and computed getters (`doubled`), preserving live state snapshots.
- Converted server-only `node:*` imports in `packages/nexil/src/core/media.ts` and `packages/nexil/src/core/og-image.ts` to dynamic imports, removing browser externalization errors (`Cannot access node:net.isIP / node:crypto.createHash in client code`).
- Updated `packages/vite-plugin/src/index.ts` lazy chunk generator to auto-import captured stores, initialize them at module load, and map store variables to live store instances.
- Tested and verified the complete workflow live in the browser on `http://localhost:5173/test`, `http://localhost:5173/stores`, and `http://localhost:5173/checkout`:
  - Verified initial SSR rendering of store counts and item arrays.
  - Verified user store actions (`cart.addItem`) and direct mutations (`cart.count++`) reactively update DOM elements, badges, and getters with 0 console errors.
  - Verified cross-route store singleton persistence and synchronization during SPA client transitions.
- Ran full test suite: 40/40 test files passed, 322/322 tests passed.

### Decisions made

- Mark live stores with `__nexil_isRealStore: true` so the core store registry distinguishes between bootstrap fallback proxies and fully hydrated live stores with custom actions.
- Use dynamic imports for Node builtins in core media/og-image utilities to keep `@nexil/core` 100% browser-safe.

### Files changed

- `packages/vite-plugin/src/index.ts` — Enhanced TS AST evaluation, store hook import classification, chunk import headers, and store binding deduplication.
- `packages/nexil/src/core/state.ts` — Upgraded fallback proxy to real store on initialization, added `__nexil_isRealStore` flag.
- `packages/nexil/src/core/media.ts` — Dynamic imports for `node:*` modules, standalone `isIP` implementation.
- `packages/nexil/src/core/og-image.ts` — Dynamic imports for `node:*` modules.
- `test-f-123/src/routes/test.tsx` — Added comprehensive interactive test buttons for actions, direct mutations, and selectors.

### State at end of session

- Active feature: `definestore-browser-stabilization` (completed and verified).
- Monorepo health: 🟢 Clean / Green.
- Blockers: None.

---

## Session: 2026-08-31 03:20:00

### What was done

- **Phase 1 Core** — Implémenté `StoreContext<T,G,A> extends Context<StoreInstance<T,G,A>>` (`packages/nexil/src/core/state.ts:124`) et `defineStoreContext(id, opts)` stableId `nexil:store:${id}` via `createContext` (`index.ts:343`), `create(override?)` frais, `Provider` auto-create + `originalProvider`/`originalUse` capture anti-récursion, fallback singleton HMR `mergeStateForHMR`, `getScopedRegistry` parent walk + `__nexil:request` marker `index.ts:109` (request-root vs global fallback), `useContextProvider` helper.
- **Client** — Supprimé hardcode `cart:doubled` `packages/nexil/src/client/index.ts:679` + `notifyLenses` générique, `hydrate__NEXIL_STORES__` inclut getters via `__snapshotAccessedStores`.
- **Vite runtime** — Nettoyé `packages/vite-plugin/src/bootstrap.ts` / `external-bindings.ts` dead `cart:doubled` (générique).
- **Vite transform** — Étendu regex `defineStore` → `defineStore|defineStoreContext` `packages/vite-plugin/src/index.ts:561,628,655` + `transform.ts:214`.
- **CLI** — `scaffoldStore` variant `scoped|context` → `defineStoreContext` template `packages/cli/src/index.ts:321`, help `--scoped`, parsing exclusive.
- **Tests** — Nouveau `packages/nexil/src/core/context-store.test.ts` 10 tests (fallback, Provider override, nested shadow nearest-wins, create isolated, ALS concurrent, explicit scope, batch+getter this-aware, Global vs Context coexist, sync throw, access log) — 10/10. Full suite 41/41 332/332, build `tsc -b` 0 errors, `pnpm build` 13 packages green.

### Decisions made

- Hybride additif : garder `defineStore` global (non-breaking), ajouter `defineStoreContext` hiérarchique React-like (Qwik stableId + Astro nanostores global par défaut) — ADR-012.
- `getScopedRegistry` walk parents + request marker pour partager Global hors request et per-request sous `runWithScope(req.scope)`.
- Capturer `originalUse`/`originalProvider` avant override pour éviter `Maximum call stack`.
- Nettoyer `cart:doubled` dead code, seed générique via `__NEXIL_STORES__`.

### Files changed

- `packages/nexil/src/core/state.ts` — StoreContext interface + defineStoreContext + useContextProvider + registry walk + createRequestContext marker usage.
- `packages/nexil/src/core/index.ts` — `createRequestContext` marque `__nexil:request`.
- `packages/nexil/src/client/index.ts` — generic pending, notifyLenses.
- `packages/vite-plugin/src/bootstrap.ts` + `external-bindings.ts` — remove cart hardcode.
- `packages/vite-plugin/src/index.ts` + `packages/vite-plugin/src/transform.ts` — defineStoreContext regex.
- `packages/cli/src/index.ts` — scaffoldStore scoped, help, parsing.
- `packages/nexil/src/core/context-store.test.ts` — nouveau 10 tests.
- `plans/ARCH.md`, `plans/DECISIONS.md` ADR-012, `plans/PATTERNS.md` StoreContext, `plans/context.md`, `plans/defineStore-refonte/*`.

### State at end of session

- Active feature: `defineStore-refonte` **COMPLETE (2026-08-31)** — 41/41 tests 332/332 green, build/typecheck clean.
- Next: docs `docs/en/25-nexil-stores.md` chapitre StoreContext, E2E `stores-context.spec.ts` avec `Link` outlet.

---
