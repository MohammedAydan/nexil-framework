# Tasks: Nexil Stores

> States: [ ] pending / [~] in-progress / [x] done / [!] blocked / [-] cancelled

## Phase 0 — API Design & Contracts — APPROVED 2026-08-29

- [x] 0.1 Freeze Store type contracts (`StoreOptions`, `DefineStoreOptions`, `StoreInstance<T>`) and backward-compat overload for legacy `createStore(initial, scope)` — **KEEP legacy as permanent overload** (plan.md Phase 0)
- [x] 0.2 Getter signature: support BOTH `(state)=>V` and `this`-style — always bind `this` + pass `state` as first arg; getters as read-only `computed()` on proxy
- [x] 0.3 Action normalization: modular `fn(state,...draft)` receives mutable deep-clone draft committed once via `batch()+signal.set`; unified `this`-actions bound to proxy with batch trap
- [x] 0.4 Collision/serialization decisions: modular `store.ts` wins + warning; only accessed stores serialized into `__NEXIL_STORES__`; transitive proxies via single root Signal
- [x] 0.5 Review & approve `plans/nexil-stores/plan.md` with maintainer — **APPROVED with prioritization: MVP = Phase 1+2, Phase 3 parallelizable, Phase 4 secondary**

## Phase 1 — Core: @nexil/state + @nexil/reactivity — MVP BLOCKING — ✅ GREEN 2026-08-29

- [x] 1.1 Extend `packages/state/src/index.ts` — keep legacy exports; add object-overload `createStore({id, state, actions})` + `defineStore(id, {state, getters, actions})`
- [x] 1.2 Implement fine-grained Proxy (`state` → root `Signal<T>` + nested proxy traps at `packages/state/src/index.ts:125` `createPathProxy` + getter `computed()` + action `batch()` binding at `packages/state/src/index.ts:412`)
- [x] 1.3 Enforce `isSerializable` at `create`/`set`/`setPath`/proxy-set (`packages/state/src/index.ts:212`, `324`, `428`); `cloneSerializable` snapshot remains immutable; preserve `lens`/`select`/`subscribe`/`dispose`
- [x] 1.4 Verify `packages/reactivity/src/index.ts:244` `batch` reentrancy + `computed` cycle detection — no change needed, reused as-is; batch groups modular `draft` commits and unified `this` mutations into single flush
- [x] 1.5 Unit tests: `packages/state/src/index.test.ts` (7 legacy green) + `packages/state/src/stores-proxy.test.ts` (9 new: modular, nested, batch, serializability, singleton, unified getters/this-actions, introspection) — 16/16 green
- [x] 1.6 Gate — STOP after green: `pnpm --filter @nexil/state build` ✅, `pnpm --filter @nexil/state test` ✅ 16/16, `pnpm typecheck` ✅ (`tsc -b`), `pnpm build` ✅ full monorepo — diff + test results shown below, awaiting approval for Phase 2

## Phase 2 — Vite Plugin: @nexil/vite-plugin — MVP BLOCKING — ✅ GREEN 2026-08-29

- [x] 2.1 Add `packages/vite-plugin/src/stores.ts:22` — `discoverStores(root)` scanning `src/stores/` (modular `store.ts` vs unified `*.ts`/`index.ts`), IDs from relative path, modular-wins collision + warning (`packages/vite-plugin/src/stores.ts:98`)
- [x] 2.2 Generate virtual modules: `virtual:nexil-stores` barrel (`generateVirtualBarrel` at `stores.ts:148`) + alias `$stores/*` resolution via `resolveId`/`load` (`packages/vite-plugin/src/index.ts:1463` `VIRTUAL_NEXIL_STORES`/`STORES_PREFIX`) + `.nexil/stores.d.ts` generation (`writeStoresDTS` at `stores.ts:178`, refreshed in `configResolved`/`buildStart` `packages/vite-plugin/src/index.ts:1440`)
- [x] 2.3 AST transform: auto-wrap exported actions with `batch()` — runtime already batches (`packages/state/src/index.ts:412`), Vite-level `wrapActionsWithBatch` (`stores.ts:190`) is conservative no-op for MVP (ensures `store` files remain valid; full AST body-wrap deferred per Non-Goals, no breakage)
- [x] 2.4 HMR: `handleHotUpdate` (`packages/vite-plugin/src/index.ts:1528`) refreshes descriptors + `.nexil/stores.d.ts` without resetting signals; signals preserved via global registry `__NEXIL_STORES_GLOBAL_REGISTRY__` (`packages/state/src/index.ts:123`); shape-changing HMR may reload (Non-Goals) — basic logic-swap done
- [x] 2.5 Tests: `packages/vite-plugin/src/stores.test.ts` (8 new: modular/unified-folder/nested, collision modular-wins, ignored types/actions, empty, barrel/dts generation) — 8/8 green, total `vite-plugin` 37/37 (`index.test.ts:29` + `stores.test.ts:8`)
- [x] 2.6 Gate: `pnpm --filter @nexil/vite-plugin build` ✅, `pnpm --filter @nexil/vite-plugin test` ✅ 37/37, `pnpm typecheck` ✅, `pnpm build` ✅ full monorepo — awaiting Phase 3/4 decision

## Phase 3 — CLI: @nexil/cli (+ @nexil/starter) — PARALLELIZABLE after 1.6 — ✅ GREEN 2026-08-29

- [x] 3.1 Extend `packages/cli/src/index.ts` — `nexil g[enerate] store <name> [--split|--unified]` (alias `g` via `parseCommand` at `packages/cli/src/index.ts:170`, help text at `packages/cli/src/index.ts:178`, `GENERATOR_PATH` validation)
- [x] 3.2 Templates: `--split` (`types.ts`/`actions.ts`/`store.ts` per File Contracts `packages/cli/src/index.ts:283` `scaffoldStore`) + `--unified` (single `defineStore` file) — follows spec File Contracts table; nested ids `admin/settings` supported, collision modular-wins, `capName` derived from last segment
- [x] 3.3 Tests: `packages/cli/src/generate-store.test.ts` (6 tests: `g` alias/help, split per contracts, unified `defineStore`, nested `admin/settings`, validation/collisions, `runCli` integration) — 6/6 green, total `cli` 24/24 (`index.test.ts:18` + `generate-store.test.ts:6`)
- [x] 3.4 Gate: `pnpm --filter @nexil/cli build` ✅ `tsc -p`, `pnpm --filter @nexil/cli test` ✅ 24/24, `pnpm typecheck` ✅, `pnpm build` ✅ full monorepo — `nexil g store demo --split` smoke via temp scaffolds in tests

## Phase 4 — SSR & Resumability: renderer / client / dev-server — MVP (strict scope) — ✅ GREEN 2026-08-30

- [x] 4.1 Upgrade state registry to ALS-backed `NexilRequestContext` (`packages/core/src/index.ts:getAls`/`getActiveScope`/`runWithScope` exported, `packages/state/src/index.ts:123` per-request `getStoreRegistry`/`getAccessLog` via `__nexil:stores:registry`/`__nexil:stores:access` in `ContextScope.values`, fallback to `globalThis.__nexil_buildRequestContext` for sync build path, `__snapshotAccessedStores`/`__getStoresScriptTag`/`__hydrateStoresFromJson` + hydration cache)
- [x] 4.2 Serializer: after `renderToString` in `packages/cli/src/index.ts:1306` `buildArtifacts` (main + `staticPaths` with `scriptsHtmlBeforeStores`) + `packages/dev-server/src/index.ts:417` `nexilSSRPlugin` (wrap `applyLayouts`/`renderToString` in `runWithScope`), collect `__getAccessedStoreIds()` → `__snapshotAccessedStores()` → `isSerializable` check (dev warn, prod throw) → inject `<script type="nexil/state" id="__NEXIL_STORES__">{"user":{"count":42}}</script>` before `</body>` via `scriptsHtml`, clear per-request log via `__clearAccessedStoreIds` (per-request + global fallback)
- [x] 4.3 Client bootstrap: `packages/client/src/index.ts:8` `hydrateNexilStoresFromDocument()` reads `#__NEXIL_STORES__`, parses JSON, populates `globalThis.__nexil:stores:hydration` Map before `bootstrapResumability`'s `materializeScope`/`bindResumableDOMBindings`; `packages/state/src/index.ts:640` `useStore` checks `__consumeHydrationCache(id)` on first creation to use hydrated `count:42`/`count:7` as `initial` (zero-hydration, no store chunk before first click)
- [x] 4.4 Tests: `packages/state/src/request-isolation.test.ts` (4 tests: concurrent `runWithScope` isolation `count:1`/`count:2`, only accessed `touched-store` in tag, client `__hydrateStoresFromJson` → `count:42`, serializable `a:1` tag) — 4/4 green; `tests/e2e/stores-resume.spec.ts` (2 tests: `home` `user:42` / `cart` `cart:7` per-route `__NEXIL_STORES__` + `GET /`/`/cart/` concurrent isolation via ALS) — 2/2 green (preview `port:4322` with trailing `/cart/` for `cart/index.html`)
- [x] 4.5 Gate: `pnpm build` ✅, `pnpm typecheck` ✅ (`tsc -b`), `pnpm --filter @nexil/state test` 23/23, `pnpm --filter @nexil/vite-plugin test` 37/37, `pnpm --filter @nexil/cli test` 24/24, `pnpm --filter @nexil/client build` ✅, `pnpm --filter @nexil/dev-server build` ✅, `pnpx playwright test tests/e2e/stores-resume.spec.ts` 2/2

## Polish — Integration & Docs (before Phase 4) — ✅ GREEN 2026-08-29

- [x] P.1 Update living docs: `plans/ARCH.md` (Nexil Stores subsystem `state`+`reactivity`, `discoverStores`/`virtual`/`scaffoldStore`), `plans/DECISIONS.md` (ADR-010), `plans/PATTERNS.md` (Proxy+batch+virtual `$stores`), `plans/context.md` (active `nexil-stores`), `plans/SESSION_LOG.md` (session 2026-08-29 Phases 1–3 + polish)
- [x] P.2 Small quality: reserved-key dev warn (`warnIfReservedStateKeys` at `packages/state/src/index.ts:155`, tested in `stores-proxy.test.ts:127`), both modular+unified via `$stores/*` verified via `tests/e2e/stores-smoke.spec.ts` (build `src/stores/user` split + `src/stores/cart` unified + `admin/settings` nested, `.nexil/stores.d.ts` + HTML `id="cart-doubled"`), `__getAccessedStoreIds` ready for Phase 4
- [x] P.3 E2E smoke: `tests/e2e/stores-smoke.spec.ts` — scaffold via `scaffoldProject` + `runCli(['generate','store',...])`/`['g',...]` + `writeFile` route importing `$stores/*` + `pnpm install` + `runCli(['build'])` → `.nexil/stores.d.ts` + `dist/client/index.html` assertions (2/2 green, 21.2s, serial, E2E isolation pattern)
- [x] P.4 Remaining rough edges explicitly listed in `plans/nexil-stores/review.md` (Vite batch no-op, HMR shape-change reload, SSR/ALS deferred, reserved warn only on create, `StoreInstance` `any` for MVP, CLI unified file-only, no DevTools/persistence)

## Phase 5 — Integration, E2E, Docs & Release Readiness (pre-Phase 4)

- [ ] 5.1 E2E: `tests/e2e/stores-resume.spec.ts` — scaffold app with modular + unified stores, prove fine-grained update (only bound node changes), zero-hydration (no store chunk before click), cross-request isolation (parallel fetches) — _deferred to Phase 4 when `__NEXIL_STORES__` lands_
- [x] 5.2 Update living docs: `plans/ARCH.md` (new components), `plans/TECH_STACK.md` (new deps if any), `plans/DECISIONS.md` (ADR-010: Nexil Stores design), `plans/PATTERNS.md` (proxy+batch pattern), `plans/SESSION_LOG.md`, `plans/context.md` (health + active feature) — _done in Polish P.1_
- [x] 5.4 Review: `plans/nexil-stores/review.md` (what shipped, edge cases, follow-ups) — _created `plans/nexil-stores/review.md`_ — awaiting maintainer approval for `v*` tag publish cycle / Phase 4 scope

## Remediation — Post-Audit Fixes & Verification — 2026-08-30

- [x] R.1 Fix CLI split template reserved-key collision (`packages/cli/src/index.ts:315` change `value: number` to `count: number`)
- [x] R.2 Fix Path Proxy Symbol delegation (`packages/state/src/index.ts:300` delegate symbol access to `Reflect.get` to support `Symbol.iterator`, `for...of`, spread)
- [x] R.3 Clean store registry on `store.dispose()` (`packages/state/src/index.ts:445`)
- [x] R.4 Refine TypeScript typing for `createStore`/`defineStore` return signatures (`packages/state/src/index.ts`)
- [x] R.5 Update `tests/e2e/stores-smoke.spec.ts` (expect `__NEXIL_STORES__` and non-reserved property rendering)
- [x] R.6 Add unit tests for array `for...of`/spread iteration, non-reserved CLI split store, and store disposal
- [x] R.7 Re-verify full gates (`pnpm build && pnpm typecheck && pnpm test && npx playwright test tests/e2e/stores-smoke.spec.ts tests/e2e/stores-resume.spec.ts`)
