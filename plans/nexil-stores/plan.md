# Plan: Nexil Stores — Convention-Based State Management

## Goal

Implement the **Nexil Stores** system as specified in `new_updates/nexil-stores-architecture.md` — a Pinia-inspired, zero-boilerplate state layer that is **fine-grained (Signals), zero-hydration resumable, strictly JSON-serializable, and SSR-isolated**, while preserving the existing `createStore(initial, scope)` / `createStateRegistry()` surface (backward-compatible).

Single sentence: Deliver `src/stores/` convention, `createStore({id, state, actions})` + `defineStore(id, {state, getters, actions})` APIs, Vite discovery + `virtual:nexil-stores`/`$stores/*`, CLI scaffolding, and `__NEXIL_STORES__` serialized resumability — all gated behind the four non-negotiable principles.

## The Four Non-Negotiable Principles (every change must prove compliance)

1. **Fine-Grained Signals** — every state property becomes a `Signal<T>` (or Proxy that delegates to signals). Reading `store.profile.name` in JSX binds only that text node; mutations update O(1) that node, never re-execute the component, never traverse a Virtual DOM.
2. **Zero-Hydration Resumability** — server-serialized state is injected as JSON in `<script type="nexil/state" id="__NEXIL_STORES__">…</script>`. Browser ships zero store init code until first user event; lightweight engine reads the tag and resumes via scope materialization (same path as `data-nx-scope`/`externalScopePayloads`).
3. **Strict JSON-Serializability** — `isSerializable` (`@nexil/core`) enforced on `state()` returns, `store.set()`, `store.setPath()`, and SSR serializer. Functions, DOM nodes, Set/Map, cycles → `TypeError` in production, strict dev warning. No non-serializable values enter the tree.
4. **Complete SSR Request Isolation** — store registry lives inside `NexilRequestContext` / `ContextScope` (`AsyncLocalStorage` in Node, explicit `scope` fallback on Cloudflare/Deno). `useStore()` resolves only the current request's instance; registry is disposed after response stream to prevent memory leaks and cross-request pollution.

## Acceptance Criteria (testable)

### MVP (Phase 1–4 ship together; gates must stay green)

- [ ] `packages/state/src/index.ts` exports both APIs without breaking existing `createStore(initial, scope)` + `createStateRegistry()`:
  - `createStore<T>(options: { id: string; state: () => T; actions?: Record<string,(state:T,...args:any[])=>any> })` → proxied store with `state` properties as live signal-backed accessors, `actions` auto-wrapped in `batch()` and receiving `state` as first param (spec §8 A).
  - `defineStore<T>(id: string, options: { state: () => T; getters?: Record<string,(state:T)=>any>; actions?: Record<string,(this: proxiedStore, ...args:any[])=>any> })` → same proxy, plus `getters` as `computed()` derivations, plus `this`-bound actions (spec §8 B). Getters support `this` or `(state)` signature.
- [ ] Stores are usable in routes as documented:
  ```ts
  import { useUserStore } from '$stores/user'
  import { useCartStore } from '$stores/cart'
  // JSX reads are fine-grained: {userStore.profile?.name}, {cartStore.itemCount}, {userStore.themePreference}
  ```
- [ ] Strict serializability enforced: constructing/updating with function, undefined in array, or circular ref throws `TypeError`; dev emits warning for external `data-nx-scope` + `__NEXIL_STORES__` boundaries.
- [ ] `packages/vite-plugin/src/index.ts` discovers stores:
  - Scans `src/stores/` (relative to Vite `root`): modular `src/stores/<name>/store.ts` and unified `src/stores/<name>.ts` + `src/stores/<name>/index.ts`.
  - Generates Store ID from relative path (`user`, `cart`, `admin/settings` → `admin/settings`).
  - Virtual module `virtual:nexil-stores` and alias `$stores/*` resolve to generated barrel.
  - Action bodies are AST-wrapped with `batch()` (imported from `@nexil/reactivity`).
  - Generates `.nexil/stores.d.ts` (gitignored) with `declare module '$stores/*'` auto-completion.
  - HMR: action/logic edits hot-swap without resetting underlying `Signal` values (vite `hot.accept` path).
- [ ] `packages/cli/src/index.ts` + `packages/starter` scaffolding:
  - `nexil g store <name> --split` creates `src/stores/<name>/{types.ts,actions.ts,store.ts}` as per File Contracts table.
  - `nexil g store <name> --unified` creates `src/stores/<name>.ts` with `defineStore` template.
  - Name validation (`^[a-z][a-z0-9-]*` segments, no traversal), idempotent error messages, no stack for user errors.
- [ ] SSR isolation correctness: concurrent `createRequestContext()` renders never leak state; registry disposed after render.

### Resumability (Phase 5)

- [ ] Build/dev SSR pipeline injects `<script type="nexil/state" id="__NEXIL_STORES__">{"user":{…},"cart":{…}}</script>` containing only stores accessed during that request (JSON of `signal()` values, not proxies).
- [ ] Client: on first interaction the engine (reuse `client`/`vite-plugin` bootstrap) reads `__NEXIL_STORES__`, hydrates the per-request store instances, then delegates to existing `data-nx-scope` materialization for O(1) DOM updates — zero hydration cost (no store init download before interaction).

### Verification

- [ ] All existing gates green: `pnpm build`, `pnpm typecheck`, `pnpm test` (unit), `pnpm lint`, `pnpm exec prettier --check .`, Playwright e2e `state-scope.spec.ts` + new `stores.spec.ts`.
- [ ] New tests cover: API, serializability, getters, batch deferral, SSR isolation, CLI generation, Vite discovery.

## Prioritization (approved adjustment 2026-08-29)

- **MVP first:** Ship solid **Phase 1 + Phase 2** (core Proxy API + Vite discovery + virtual `$stores/*`) as the blocking deliverable. Nothing else blocks on perfect HMR or full `__NEXIL_STORES__` resumability.
- **CLI (Phase 3)** can run in parallel or immediately after core API stabilizes — template contracts are independent.
- **HMR signal-preserving** and **full `__NEXIL_STORES__` resumability (Phase 4)** are secondary; they lag MVP without blocking feature usefulness (stores work client-side via `data-nx-scope` proxy path even before full tag serialization).

## Approach — Phased & Incremental (MVP-first)

### Phase 0 — API Design & Contracts (finalized 2026-08-29 — approved)

- **Legacy compat (final):** Keep `createStore<T>(initial:T, scope?)` as **permanent overload** (backward compat). New object overload `createStore<T>({id, state:()=>T, actions})` coexists via discriminated union; both exported. Existing `packages/state/src/index.test.ts:26` must remain green forever.
- **Getter semantics (final):** Support both `(state)=>V` and `this`-style `function(this:Proxy){ return this.x }`. Implementation always binds `this` to the proxy AND passes `state` as first arg, so either signature works. Getters materialized as read-only `computed()` derivations on the proxy; enumerate after state keys.
- **Action semantics (final):**
  - Modular `userActions.setProfile(state, ...args)` — first arg is **mutable draft** (deep clone of current state). Draft mutations are committed once via `batch(()=> rootSignal.set(draft))`, coalescing multiple `state.x = …` inside one flush.
  - Unified `actions:{ addItem(){ this.items.push(...) } }` — `this` is the proxy itself; proxy traps are batch-aware so `this.x = y` / `this.items.push` forward to `rootSignal.set` inside `batch`.
- **Proxy depth (final):** Transitive proxies, backed by single root `Signal<T>` + structural sharing. `store.profile.name` → nested proxy from same root; `store.profile = {...}` → root update via `setAtPath`-style copy.
- **Collision rule (final):** If both `src/stores/<name>.ts` (unified) and `src/stores/<name>/store.ts` (modular) exist, **modular `store.ts` wins**; emit build warning.
- **Serialization boundary (final):** Only stores _accessed during the current SSR request_ are injected into `__NEXIL_STORES__` (tracked via `registry.accessLog` WeakSet), not every discovered store.

### Phase 1 — Core: `@nexil/state` + `@nexil/reactivity`

- Implement fine-grained proxy in `@nexil/state`:
  - Internally one root `Signal<T>` holds the whole state object.
  - `createProxy(rootSignal, actions, getters)` returns a `Proxy` where property get (a) returns nested proxies for object values (transitively), (b) returns computed for getters, (c) returns bound batched action for action keys. Property set traps call `rootSignal.set` with updated shallow copy + `setAtPath`-style structural sharing, but grouped by `batch()` so listeners flush once — matches spec "State-to-signal translation" (§5).
  - Keep exported `value` Signal, `snapshot()`, `setPath()`, `lens()`, `select()` for low-level consumers; proxy delegates to them so both imperative and declarative access warn if non-serializable.
  - Preserve `StateScope` union and `isSerializable` enforcement at construction + every `set`.
- `reactivity`: no new primitive needed; confirm `batch()` reentrancy and `computed()` cycle detection remain correct (existing `reactivity/src/index.ts:244`).

### Phase 2 — Vite Plugin: `@nexil/vite-plugin`

- Add `stores` scanning module (`packages/vite-plugin/src/stores.ts`):
  - `discoverStores(root:string): Promise<StoreDescriptor[]>` walks `src/stores` (glob), classifies via `store.ts` presence, validates `types.ts` has no runtime code (optional lint), checks `actions.ts` actions receive `state` param.
  - `generateStoresBarrel(descriptors)`: emits virtual module mapping `'$stores/<id>'` → real file; also emits `.nexil/stores.d.ts` with `export declare function useUserStore(): StoreInstance<UserState>` etc.
- Transform: during `transformNexilSource` or plugin `transform`, detect imports from `$stores/*`/`virtual:nexil-stores`, rewrite to real paths, and for action files inject `import { batch } from '@nexil/reactivity'` + wrap each exported action function body in `return batch(()=>{...})` (AST via `@babel/parser`+`magic-string`, same pattern as existing lazy-handler capture).
- HMR: register `import.meta.hot.accept` for store modules; on update, replace action/getter implementations in-place, keep `rootSignal` reference — no dispose/recreate.
- Scope integration: store signals already participate in existing `classifyScopeCaptures`/`buildScopePayload` so `data-nx-scope` serialization is automatic; new SSR tag is the only addition.

### Phase 3 — CLI: `@nexil/cli` (+ `@nexil/starter`)

- Extend `NexilCommand` with `generate` alias `g` → `generate store <name> [--split|--unified]` (extend existing `generate route|component` pattern at `cli/src/index.ts:196`).
- Templates:
  - `--split`: `types.ts` (empty interfaces), `actions.ts` (`export const <name>Actions = { example(state){} }`), `store.ts` (`import {createStore}... export const use<Cap>Store = createStore({id:'<name>', state:()=>initial, actions})`).
  - `--unified`: single file with `defineStore('<name>', { state:()=>({...}), getters:{}, actions:{}})`.
- Validation via shared `GENERATOR_PATH` sanitizer; write with `mkdir -p`, fail if target exists (unless `--force`, out-of-scope).

### Phase 4 — SSR & Resumability: `packages/renderer` / `packages/client` / `packages/vite-plugin`

- Request isolation: upgrade `createStateRegistry()` to ALS-backed singleton (`core/src/index.ts:172 getAls()`). When `useUserStore()` is called inside a route/SSR render, resolve `getActiveScope()` → registry for that `requestId`; fallback to per-call registry in tests.
- Serialization: after `renderToString` (in `cli/src/index.ts:1210 buildArtifacts` and `dev-server` SSR path), collect accessed stores via WeakSet tracking in registry (`accessLog`), snapshot each via `isSerializable` check, stringify into compact JSON, inject:
  ```html
  <script type="nexil/state" id="__NEXIL_STORES__">
    {"user":{…},"cart":{…}}
  </script>
  ```
  before `</body>` (same insertion point as `scriptsHtml`). Dev mode: strict warning via `console.warn`/`warnings[]` if non-serializable detected.
- Client resumability: `client/src/bootstrapResumability.ts` (existing) reads `document.getElementById('__NEXIL_STORES__')` on first `data-nx-on-*` event, JSON-parses, feeds into client-side store registry `set` before handler materialization — zero hydration, flash resumption.

### Phase 5 — Tests, Gates, Docs

- Unit: `packages/state/src/index.test.ts` extended (legacy still), `packages/state/src/proxy.test.ts`, `packages/vite-plugin/src/stores.test.ts`, `packages/cli/src/generate-store.test.ts`.
- E2E: `tests/e2e/stores-resume.spec.ts` (scaffold temp app with `src/stores/counter/{types,actions,store}.ts`, clicks + navigation prove isolation + persistence).
- Update `plans/ARCH.md`, `plans/TECH_STACK.md`, `plans/DECISIONS.md` (ADR-010), `plans/PATTERNS.md`, `plans/context.md`.

## Non-Goals / Deferred (explicitly out of MVP — do not block Phase 1+2)

- **DevTools timeline** (Pinia-style store inspector / time-travel) — deferred to post-MVP; no `__ NEXIL_DEVTOOLS__` hook required now.
- **Persistence plugins** (`localStorage`/`sessionStorage` sync, `persist: true`) — deferred; strict serializability already ensures it would be feasible later.
- **Set/Map/non-JSON support** — intentionally forbidden per spec; spec §6 mandates strict JSON. Any `Set`/`Map`/`Date`/`Function` in state remains a hard `TypeError` / dev warning, not an auto-serialized feature.
- **Advanced HMR edge cases** — renaming a store `id`, changing `state` shape, or adding/removing getters during HMR may require full reload; MVP HMR only guarantees action/getter logic hot-swap preserves `Signal` values. Full shape-preserving HMR is deferred.
- **Cross-tab / BroadcastChannel sync** — out of scope.
- **Publishing/version bumps** — user triggers via `v*` tag, no auto-publish in this feature.

## Scope

**IN**

- `packages/state` (new Proxy + defineStore + ALS registry)
- `packages/reactivity` (verify batch/computed, no new API unless needed)
- `packages/vite-plugin` (discovery, virtual, batch wrapping, HMR, d.ts)
- `packages/cli` + `packages/starter` (store generators)
- `packages/renderer` / `packages/client` / `packages/dev-server` (SSR serializer + bootstrap resumption)
- `tests/e2e/*`, `plans/*`, `nexil.config`/`tsconfig` plumbing

**OUT** (hard out — not deferred, never in this feature)

- Any change to `packages/core` Context API semantics beyond reuse of `getAls`/`getActiveScope`
- Changes to `packages/router`, `packages/server`, `packages/actions` public contracts (stores remain orthogonal)
- Publishing/version bumps — user triggers via `v*` tag

## Dependencies

- Node >=22, pnpm 10.15, TypeScript 5.8, Vite 7.3.6, `@babel/parser` + `magic-string` (already in vite-plugin), `isSerializable` from `@nexil/core`.
- No new external deps expected; Vite plugin scanning uses `node:fs/promises`.

## Estimated Complexity

- **L** — cross-package (state, vite-plugin, cli, renderer/client), Proxy design + ALS + virtual module + HMR + serialization. Mitigated by shipping MVP without perfect HMR/serialization first; each phase individually testable and green-gated.

## Risks & Mitigations

- Proxy + Signal identity vs `JSON.stringify` loops → gated by `isSerializable` + `cloneSerializable`.
- HMR signal preservation breakage → keep root Signal reference stable; replace only action/getter closures; test with manual `import.meta.hot` simulation.
- Virtual module path collisions (`$stores/user` vs `src/stores/user.ts` vs `src/stores/user/store.ts`) → priority rule: `store.ts` wins; emit warning if both exist.
- ALS fallback on Cloudflare/Deno → require explicit `scope` propagation in those adapters; document and test isolate-per-request path.
