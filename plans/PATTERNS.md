# Engineering Patterns

## Pattern: Windows-safe URL-to-path in ESM scripts [feature: windows-build-publish]

- **Problem:** `new URL(...).pathname` returns `/D:/...` on Windows; `path.resolve('/D:/x')` yields `D:\D:\x` (ENOENT mkdir bug).
- **Solution:** Always `fileURLToPath(import.meta.url)` then `dirname()`/`resolve()`.
- **Example:** `tests/e2e/build-landing-page.mjs` (correct) vs old `tests/e2e/build-basic-app.mjs` (buggy).
- **Gotchas:** Applies to every `.mjs` helper that derives paths from import.meta.url.

## Pattern: pnpm publish workspace:* rewriting

- **Problem:** Published manifests cannot contain `workspace:*`.
- **Solution:** `pnpm publish` rewrites `workspace:*` → actual workspace version in the packed manifest. Validate via `--dry-run --pack-destination` + tarball inspection before real publish.
- **Gotchas:** Dependency packages must actually be published too, or consumer installs 404.

## Pattern: GitHub Packages auth boundaries

- **Problem:** Tokens must not land in repo files; installs need auth.
- **Solution:** Project `.npmrc` holds scope routing only; token via env substitution or user-level config; CI uses ephemeral npmrc from `secrets.GITHUB_TOKEN`.
- **Gotchas:** `${VAR}` expansion works in .npmrc only if the var exists; otherwise literal string causes 401.

## Pattern: E2E temp-workspace isolation [feature: state-management-audit]

- **Problem:** Specs that scaffold temp apps INSIDE the repo (workspace mode) run pnpm installs that re-point packages/*/node_modules symlinks into the temp app's private store. Deleting the temp dir leaves dangling links, breaking long-lived vite dev servers (showcase webServer) for the rest of the run.
- **Solution:** In each spec's afterAll: (1) execSync('pnpm install --silent', {cwd: repoRoot}) to restore canonical links while the old targets are still valid, THEN (2) rm the temp dir. Keep spec files serialized (playwright workers: 1) so two installers never race.
- **Example:** tests/e2e/engine-proof.spec.ts and tests/e2e/state-scope.spec.ts afterAll blocks.
- **Gotchas:** Stolen symlinks resolve FINE while their temp dir exists - breakage is strictly a cleanup-ordering bug. Any new spec creating in-repo workspaces must follow this teardown contract.

## Pattern: Fine-grained store Proxy + batch + virtual $stores [feature: nexil-stores]

- **Problem:** How to expose a single `src/stores` convention as both modular (`store.ts` + `actions.ts` + `types.ts`) and unified (`defineStore`) without re-render cascades, while keeping actions batched to one DOM flush and imports ergonomic (`$stores/user`) without manual path mapping.
- **Solution:**
  - **Proxy:** Store holds a single root `Signal<T>`; `createPathProxy` (`packages/state/src/index.ts:125`) returns transitive proxies for `store.user.profile.name` and array `store.items[0].quantity`. Every `get` reads `signal()` for tracking, every `set` does `setAtPath` array-aware copy + `batch(() => signal.set(next))`. `store.items.push(...)` wraps mutating array methods to copy-on-write + `batch`.
  - **Actions:** Modular `fn(state,...)` receives a deep-clone draft (`cloneSerializable`) committed once via `batch`; unified `fn(this,...)` receives a draft-as-`this` proxy so `this.items.find(...).quantity++` mutates the draft and commits once. Both guarantee single notification per action even with multiple `state.x=` or `this.x=` writes.
  - **Virtual:** `discoverStores` (`packages/vite-plugin/src/stores.ts:22`) scans `src/stores`, IDs are relative paths (`admin/settings`). `resolveId`/`load` expose `virtual:nexil-stores` barrel and `$stores/<id>` → real entry; `generateStoresDTS` writes `.nexil/stores.d.ts` on `configResolved`/`buildStart`. `handleHotUpdate` refreshes without resetting `globalThis.__NEXIL_STORES_GLOBAL_REGISTRY__`.
  - **Serializability + reserved keys:** `isSerializable` at every `set`/proxy write; `warnIfReservedStateKeys` warns in dev if state contains `value/snapshot/set/...`.
- **Example:** `src/stores/user/{types,actions,store}.ts` (`createStore({id:'user', state, actions:userActions})`) and `src/stores/cart.ts` (`defineStore('cart', {state, getters:{doubled}, actions:{increment(){this.count++}}})`) both imported as `import { useUserStore } from '$stores/user'`.
- **Gotchas:** `store.value` is the `Signal<T>` API, not a state key — don't name state fields `value`/`snapshot`/`set`/etc. (dev warns). `setAtPath` must handle array indices (`store.items[0].quantity`) via copy-on-write; direct `store.items.push` outside an action still batches but prefers `store.addItem()` actions for intent.
