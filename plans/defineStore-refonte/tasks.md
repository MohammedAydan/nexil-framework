# Tasks: defineStore-refonte

## Phase 0 — Plan (done)

- [x] Créer plan.md / tasks.md / context.md
- [x] Auditer defineStore vs createContext (agents)

## Phase 1 — Core (state.ts + index.ts)

- [x] Ajouter interface `StoreContext<T,G,A> extends Context<StoreInstance<T,G,A>> { create, id, defaultState }` dans `state.ts`
- [x] Implémenter `defineStoreContext(id, options)` wrapping `createProxiedStore` + `createContext` stableId
- [x] Génériciser `__getStorePathSignal` / `client getStorePathSignalClient` (supprimer hardcodage cart:doubled)
- [x] Ajouter `__linkPendingStorePathSignals` générique si besoin
- [x] Exporter `useContextProvider` sucre (optionnel)

## Phase 2 — Vite Plugin

- [x] Mettre à jour `discoverStores` / `generateVirtualBarrel` pour exporter Context quand --scoped
- [x] Étendre `classifyScopeCaptures` pour détecter `Cart.use()` / `useContext(Cart)` → kind ctx
- [x] Virer pending cart:doubled hardcodé dans `bootstrap.ts` / `external-bindings.ts` (remplacé par générique)

## Phase 3 — Client Runtime

- [x] `packages/nexil/src/client/index.ts` : `getStorePathSignalClient` générique getters
- [x] `vite-plugin/src/bootstrap.ts` et `external-bindings.ts` : même générique + materialize ctx

## Phase 4 — SSR / Edge

- [x] Vérifier per-scope snapshot déjà correct (ALS + explicit stack). Ajouter tests edge si besoin
- [x] Aucun changement buildArtifacts si déjà via runWithScope (vérifier)

## Phase 5 — CLI

- [x] `packages/cli/src/index.ts` : `scaffoldStore` support `--scoped` flag → template `defineStoreContext`
- [x] Mettre à jour `helpText` + `NexilCommand`
- [x] `packages/vite-plugin/src/stores.ts` DTS génération context-aware

## Phase 6 — Tests & Gates

- [x] Unit `packages/nexil/src/core/context-store.test.ts` (Provider nesting, fallback, ALS, batch, getters this)
- [x] Vérifier `stores-proxy.test.ts` 15/15 intact
- [x] `pnpm build && tsc -b && pnpm test` 41 files 332/332
- [x] E2E `tests/e2e/stores-context.spec.ts` — deferred (unit ALS already covers; e2e à ajouter avec Link)

## Close

- [x] `review.md`
- [x] Update `plans/context.md`, `ARCH.md`, `DECISIONS.md` ADR-012, `PATTERNS.md`, `SESSION_LOG.md`
