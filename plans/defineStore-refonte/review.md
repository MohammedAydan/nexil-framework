# Review: defineStore → createContext-like (Hybride) — COMPLETE 2026-08-31

## What was built

- **Core `packages/nexil/src/core/state.ts:124-145, 1260-1415`**:
  - `StoreContext<T,G,A> extends Context<StoreInstance<T,G,A>>` avec `storeId`, `create(override?)`, `Provider` auto-create, `use`/`useContext` hierarchical.
  - `defineStoreContext(id, {state, getters, actions})` → `Context` stableId `nexil:store:${id}` via `createContext` `packages/nexil/src/core/index.ts:343`, fallback singleton per-request via `getStoreRegistry` parent-chain + request marker `__nexil:request` `index.ts:109`.
  - `create()` fresh isolated `createProxiedStore` (batch + `__nexil_getterSignals` + `__linkPending`), `getFallback` HMR-aware `mergeStateForHMR` `state.ts:65`.
  - `useContextProvider` helper `state.ts:1413` → `provideContext(getActiveScope(), ctx, val)`.
  - `getScopedRegistry`/`getScopedAccessLog` `state.ts:195` walk parents, request-root creation, else global fallback — fixes Global sharing across Provider children + per-request isolation.
  - `createRequestContext` `index.ts:109` marque `__nexil:request`.
- **Client `packages/nexil/src/client/index.ts:171, 679`**:
  - Suppression hardcode `cart:doubled` — générique `getStorePathSignalClient` utilise `getterSignals` / hydration `__NEXIL_STORES__` / `__nexil:stores:hydration`; `notifyLenses` générique.
  - Vérifié `bootstrapResumability` avant `bindStorePathBindings`.
- **Vite `packages/vite-plugin/src/bootstrap.ts` / `external-bindings.ts`**:
  - Suppression dead `if(sid==='cart'&&... cart:doubled)` → générique via `__linkPendingStorePathSignals` + `__snapshotAccessedStores` inclut getters.
- **Vite `packages/vite-plugin/src/index.ts:561, 628, 655` + `packages/vite-plugin/src/transform.ts:214`**:
  - Détection `defineStoreContext` ajouté aux regex `hookDef` + `storeDefMatch` + `transform` store pattern.
- **CLI `packages/cli/src/index.ts:250, 321, 1877`**:
  - `scaffoldStore` variant `'scoped'|'context'` → template `defineStoreContext` `src/stores/<id>.ts` avec commentaires usage Provider/use.
  - `helpText` `--scoped` + `runCli` parsing `--scoped`/`--context` exclusive avec `--split`/`--unified`.
  - Collision guards respectent `unifiedFile`/`store.ts` dir.
- **Tests** `packages/nexil/src/core/context-store.test.ts` 10 tests (fallback, Provider override, nested shadow, create isolated, ALS concurrent, explicit scope, actions batch+getter this-aware, Global vs Context coexist, sync children throw, access log). Tous 10 green. Global suite 41/41 332/332.

## Verification

- `pnpm build` ✅ 13 packages + 5 examples
- `pnpm typecheck` `tsc -b` ✅ 0 errors
- `pnpm test` ✅ 41 files 332 tests (was 40/322 +10)
- `pnpm --filter @nexil/vite-plugin test` 8/8, `cli` generate-store 6/6
- `pnpm lint` + `prettier --check` à vérifier (run `pnpm exec prettier --write .` avant commit)

## Edge cases handled

- `value` reserved key warn (`ctx-nested` test utilise `val`).
- `use()` capture originalUse/originalProvider pour éviter récursion infinie `state.ts:1367`.
- Nested `Provider` avec `val` shadow nearest-wins via `ContextScope.parent` `index.ts:269`.
- `explicit scope` param pour Cloudflare Workers `provideContext`.
- `Provider` children async throw `deepResolve` `index.ts:299`.
- Per-request ALS isolation: `runWithScope(reqA) Counter.Provider(storeA)` vs `reqB storeB` concurrent avec `await` interleaving.
- Global fallback shared via request marker, sinon global registry.

## Known limitations / follow-ups

- `defineStoreContext` defaultValue lazy global fallback initial `getFallback()` crée store au define time (pour `defaultValue` typage), mais fallback réel utilise `getFallback` dynamique — `defaultValue` premier snapshot peut être stale si HMR change shape avant premier `use`; HMR merge corrige au second `use`.
- Vite `wrapActionsWithBatch` déjà générique (`actions:{}`) donc `defineStoreContext` actions auto-batch sans modif `stores.ts:285`.
- `discoverStores` génère toujours `StoreDescriptor` unified-file pour scoped; `virtual:nexil-stores` barrel réexporte Context correctement, mais `.nexil/stores.d.ts` ne distingue pas type Context vs hook — polish futur.
- `Context.Provider` children sync constraint documentée `STATE_TYPES.md:399` reste.
- Qwik-like `useContextProvider` sucre ajouté mais pas de `useStoreProvider` auto-hook sans JSX — suivre `provideContext` pattern.

## Next steps

- Doc `docs/en/25-nexil-stores.md` chapitre `StoreContext` + exemples Astro `nanostores` vs Qwik `createContextId`.
- E2E `stores-context.spec.ts` avec Vite dev + `Link` outlet swap vérifier Provider survive layout vs route.
- Bridge Resumability: si `StoreContext.use()` capturé dans `onClick$`, émettre `ScopeRefKind='ctx'` `data-nx-scope` (déjà support `ctx` dans `client/index.ts:405`).
