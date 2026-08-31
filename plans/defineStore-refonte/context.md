# Context: defineStore-refonte

## Files to create

- `packages/nexil/src/core/context-store.test.ts` — Provider nesting, fallback, isolation, batch, getters this
- `tests/e2e/stores-context.spec.ts` — E2E hierarchical provider + isolation
- `plans/defineStore-refonte/review.md`

## Files to modify

- `packages/nexil/src/core/state.ts` — StoreContext interface + defineStoreContext + generic getter pending (remove cart hardcode) lines 119-128, 328-417
- `packages/nexil/src/core/index.ts` — export useContextProvider helper if added (optional) line 343
- `packages/vite-plugin/src/index.ts` — classifyScopeCaptures ctx detection + stableId injection lines 812, 1728; transformNexilSource store-ctx bindings
- `packages/vite-plugin/src/stores.ts` — virtual barrel context export lines 216-229
- `packages/vite-plugin/src/bootstrap.ts` + `external-bindings.ts` — remove hardcode cart:doubled line 10, generic getterSignals
- `packages/nexil/src/client/index.ts` — getStorePathSignalClient generic line 417
- `packages/cli/src/index.ts` — scaffoldStore --scoped flag line 283, helpText
- `plans/ARCH.md` — Store subsystem StoreContext
- `plans/DECISIONS.md` — ADR-012
- `plans/PATTERNS.md` — store-context pattern
- `plans/context.md` + `SESSION_LOG.md`

## Dependencies to add

- Aucune (réutilise @nexil/core ALS/Context, @babel/parser déjà)

## Env vars needed

- Aucune

## Open Questions — RESOLVED (build mode default)

- API distincte `defineStoreContext` choisie (clarifie intent, non-breaking). Option `scoped:true` possible plus tard.
- Mode par défaut global conservé (recommandé Astro/nanostores).
- Children Provider sync constraint gardé (doc), sucre hook `useContextProvider` ajouté.
- Budget +150 bytes bootstrap accepté.

## Current state (baseline 2026-08-31)

- `state.ts:1224` 37/37 tests (7+15+4+6+5), `vite-plugin` 37/37, `cli` 24/24, e2e 6/6 green après Level2 fixes.
- Hardcodage `cart:doubled` pending dans bootstrap/client — à généraliser.
- Vite `wrapActionsWithBatch` OK `stores.ts:285`, HMR shallow `state.ts:65`.
