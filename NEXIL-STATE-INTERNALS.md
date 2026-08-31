# Nexil State — Fonctionnement Interne du Framework

> **Version :** 0.2.3 — 31 août 2026 — Monorepo `nexil` (`packages/nexil/src/core/*`)  
> **Source de vérité :** ce document synthétise le code réel, pas la documentation marketing. Chaque affirmation pointe vers `fichier:ligne`.

---

## Table des matières

1. [Vue d'ensemble & 4 principes](#1-vue-densemble--4-principes)
2. [Couche 1 — Réactivité primitive (`reactivity.ts`)](#2-couche-1--réactivité-primitive-reactivityts)
3. [Couche 2 — Store Proxy (`state.ts`)](#3-couche-2--store-proxy-statets)
4. [Couche 3 — Registre & Isolation Requête (`state.ts` + `index.ts`)](#4-couche-3--registre--isolation-requête-statets--indexts)
5. [Couche 4 — StoreContext hiérarchique (`state.ts:defineStoreContext`)](#5-couche-4--storecontext-hiérarchique-statetsdefinestorecontext)
6. [Couche 5 — Vite Plugin (`vite-plugin/src/*`)](#6-couche-5--vite-plugin-vite-pluginsrc)
7. [Couche 6 — Client Runtime (`client/index.ts` + `vite-plugin/src/bootstrap.ts`)](#7-couche-6--client-runtime-clientindexts--vite-pluginsrcbootstrapts)
8. [Couche 7 — SSR & Edge (`cli` + `dev-server` + `state.ts:__NEXIL_STORES__`)](#8-couche-7--ssr--edge-cli--dev-server--statets__nexil_stores__)
9. [Couche 8 — HMR & Sécurité](#9-couche-8--hmr--sécurité)
10. [Flux complet — du `src/stores/cart.ts` au DOM](#10-flux-complet--du-srcstorescartts-au-dom)
11. [Vérification pratique — résultats des tests](#11-vérification-pratique--résultats-des-tests)
12. [Annexe — fichiers clés](#12-annexe--fichiers-clés)

---

## 1. Vue d'ensemble & 4 principes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Nexil Stores Core                             │
├──────────────────────────┬──────────────────────────────────────────────┤
│ 1. Fine-Grained Signals  │ O(1) DOM via Signal + lens + proxy           │
│ 2. Zero-Hydration        │ Snapshot JSON dans HTML, JS au clic          │
│ 3. Strict Serializability│ isSerializable à chaque set/proxy            │
│ 4. SSR Request Isolation │ ALS + stack explicite Edge                   │
└──────────────────────────┴──────────────────────────────────────────────┘
```

_Source : `docs/en/25-nexil-stores.md:9-25` et `packages/nexil/src/core/state.ts:60-86`, `packages/nexil/src/core/index.ts:63-83`_

Le système est **streaming HTML + resumability** : le serveur rend directement des `ElementNode` (`packages/nexil/src/core/index.ts:15-34`) sans Virtual DOM, le navigateur ne télécharge **aucun JS de store** jusqu'au premier `onClick$`.

---

## 2. Couche 1 — Réactivité primitive (`reactivity.ts`)

### 2.1 `Signal<T>` — `packages/nexil/src/core/reactivity.ts:14-26`

```ts
export interface ReadableSignal<T> {
  (): T; get(): T; readonly value: T; subscribe(()=>void): Unsubscribe; dispose():void
}
export interface Signal<T> extends ReadableSignal<T> {
  set(next: T | ((p:T)=>T)): void; setValue(next:T): void
}
```

- `state<T>(initial, opts?)` crée un `Signal` avec `activeCollector` tracking (`reactivity.ts:33-69`). `equals` par défaut `Object.is`.
- Écriture **toujours** via `set`/`setValue`; `value` est getter readonly.
- `batchDepth` + `pendingNotifications` `reactivity.ts:244-252` coalescent les notifications : `batch(()=>{a.set(1); b.set(1)})` → 1 flush.

### 2.2 `computed<T>` — `packages/nexil/src/core/reactivity.ts:124-192`

```ts
const total = computed(() => price() * qty())
```

- Pur, synchrone, lazy, memoïzé. Détient ses abonnements exclusivement (pas de hoisting dans parent `effect`) — corrige `computed` stale après re-run d'`effect` parent (`reactivity.ts:141-159`).
- Cycle detection via `evaluatingComputeds` Set (`reactivity.ts:150`).

### 2.3 `effect` / `watch` / `resource`

- `effect(fn)` `reactivity.ts:264-288` — side-effect, doit avoir owner `createRoot` (`reactivity.ts:321`), sinon fuite inter-requêtes.
- `resource(() => fetch(...))` `reactivity.ts:198-242` — race-safe via `requestId`, expose `loading: Signal<boolean>` / `error: Signal<Error|null>`.

> **Invariants internes :** `activeCollector`, `activeScope`, `batchDepth` globaux; `track(signal)`/`registerCleanup`.

---

## 3. Couche 2 — Store Proxy (`state.ts`)

### 3.1 Types — `packages/nexil/src/core/state.ts:7-133`

```ts
export type StateScope = 'local' | 'shared' | 'route' | 'layout' | 'global' // legacy, hardcodé 'global' pour defineStore
export interface Store<T extends Serializable> {
  readonly scope: StateScope
  readonly value: Signal<T>
  readonly snapshot: () => T // cloneSerializable
  readonly set: (next: T | ((p: T) => T)) => void
  readonly setPath: (path: string, value: unknown) => void // "user.profile.name"
  readonly lens: <S>(path: string) => Signal<S> // Signal focus writable
  readonly select: <S>(sel: (v: T) => S) => ReadableSignal<S> // computed dérivé
  readonly subscribe: (l: () => void) => Unsubscribe
  readonly dispose: () => void
}
export interface CreateStoreOptions<T, A> {
  id: string
  state: () => T
  actions?: A
}
export interface DefineStoreOptions<T, G, A> {
  state: () => T
  getters?: G
  actions?: A
}
export type StoreInstance<T, G, A> = Store<T> & T & { [K in G]: R } & { [K in A]: PublicAction }
```

- `PublicAction<F,T>` `state.ts:111-118` strippe premier param `state`/`this`.
- `STORE_ID_PATTERN = /^[a-zA-Z0-9:_/-]+$/` `state.ts:135`, `pathSegments` valide `^[A-Za-z_$][\w$]*$` `state.ts:21-27`.
- `RESERVED_KEYS = {value,snapshot,set,setPath,lens,select,subscribe,dispose,scope}` `state.ts:147` — `warnIfReservedStateKeys` `state.ts:421` dev warn si état contient ces clés.

### 3.2 Helpers — `packages/nexil/src/core/state.ts:30-86`

- `getAtPath(value, segments)` / `setAtPath(value, segments, next)` `state.ts:30-58` — structural sharing immuable ; tableaux `[...copy]` avec `index` entier validé.
- `cloneSerializable` `state.ts:60-63` → `structuredClone` fallback `JSON.parse(JSON.stringify)`.
- `mergeStateForHMR(current, nextInitial)` `state.ts:65-86` — shallow top-level merge (préserve valeurs live, ajoute nouvelles clés clone, supprime disparues). Non deep (limitation documentée).
- `isSerializable` `packages/nexil/src/core/index.ts:63-83` — `null/string/boolean -> true`, `number -> isFinite`, objet `prototype === Object.prototype|null`, récursion `WeakSet` anti-cycle, `undefined` autorisé comme valeur d'objet (strippé par JSON).

### 3.3 `createPathProxy` — `packages/nexil/src/core/state.ts:446-541`

Cœur du Proxy transitif :

```ts
function createPathProxy<T>(rootSignal: Signal<T>, path: readonly string[]): unknown
```

- `get` trap :
  - `typeof prop==='symbol'` → `Reflect.get` avec `bind` (`state.ts:452-460`) — fixe `for...of`, `[...store.items]`, `Array.from` (`state.ts:298`).
  - Si `current` est tableau et `prop` ∈ `['push','pop','shift','unshift','splice','sort','reverse']` → wrapper copie `[...arr]` + `Array.prototype[prop].apply(copy,args)` + `batch(()=>{ newRoot=setAtPath(rootSignal, path, copy); isSerializable(newRoot); rootSignal.set(newRoot) })` `state.ts:467-485`.
  - Si valeur est objet/tableau → retourne `createPathProxy(rootSignal, [...path, prop])` (transitif).
  - Sinon valeur primitive.
- `set` trap `state.ts:496-505` → `batch(()=>{ newRoot=setAtPath(rootSignal,[...path, prop], value); isSerializable; rootSignal.set(newRoot) })`.

> Résultat : `store.user.profile.name = 'Eve'` et `store.items.push('a')` et `store.items[0].qty++` fonctionnent avec **1 seule notification** quand dans `action`.

### 3.4 `createProxiedStore` — `packages/nexil/src/core/state.ts:543-975`

```ts
function createProxiedStore<T, G, A>(params: {
  id
  initial
  scope
  getters?
  modularActions?
  unifiedActions?
  isModular
}): StoreInstance
```

- Valide `isSerializable(initial)` sinon `TypeError`.
- `signal = state(initial)` root unique ; `selectors: Set<ReadableSignal>` ; `getterSignals: Map<string,ReadableSignal>` ; `disposed`.
- `base: Store<T>` avec `value: signal`, `snapshot: cloneSerializable`, `set`, `setPath`, `lens` (computed + setValue), `select` (computed), `subscribe`, `dispose` (clear selectors+getters+signal + delete from `getStoreRegistry`/`getGlobalStoreRegistry` `state.ts:631-635`).
- **Proxy handler** `state.ts:660-776` :
  - `__nexil_isRealStore:true`, `__nexil_hmrUpdate`, `__nexil_getterSignals` cachés.
  - `get` : reserved → `base`, `gettersMap` → `gettersMap.get(prop)()`, `actionsMap` → wrap, état objet → `createPathProxy(signal,[prop])`, sinon `Reflect`.
  - `set` : `batch(()=>{ next={...cur,[prop]:value}; isSerializable; signal.set(next) })`.
- **Getters** `state.ts:780-793` : chaque `getter` → `computed(()=> getter.call(proxy, signal()))` (support `(state)=>V` et `function(){return this.x}`), stocké `getterSignals` + `gettersMap`.
- **Link pending** `state.ts:795-798` : `__linkPendingStorePathSignals(id, proxy)` branche `__nexil:store-path:pending`.
- **Actions** `state.ts:800-858` :
  - Modulaire `fn(state,...)` : `batch(()=>{ draft=cloneSerializable(signal()); fn(draft,...args); isSerializable(draft); signal.set(draft) })`.
  - Unified `fn(this,...)` : `draftWithGetters = new Proxy(draft, {get: si gettersMap.has(prop) recompute getter depuis draft })` pour `this.items.find(...).quantity++` et `this.totalPrice` lu dans action.
- **HMR** `state.ts:860-973` : `hmrUpdate(nextGetters, nextActions)` dispose anciens getters/actions, recrée `computed`/wrap, met à jour `currentGetters` refs pour `this`-actions lisant getters.

---

## 4. Couche 3 — Registre & Isolation Requête (`state.ts` + `index.ts`)

### 4.1 Constantes — `packages/nexil/src/core/state.ts:141-146`

```ts
GLOBAL_REGISTRY_KEY = '__NEXIL_STORES_GLOBAL_REGISTRY__' // Map<string,StoreInstance> in globalThis
GLOBAL_ACCESS_KEY = '__NEXIL_STORES_ACCESSED__' // Set<string> global
SCOPE_REGISTRY_KEY = '__nexil:stores:registry' // Map in ContextScope.values
SCOPE_ACCESS_KEY = '__nexil:stores:access' // Set in ContextScope.values
```

### 4.2 ALS + Explicit Stack — `packages/nexil/src/core/index.ts:171-267`

```ts
let contextAls: AlsStore | undefined // AsyncLocalStorage via process.getBuiltinModule('node:async_hooks') || require
function getAls(): AlsStore | undefined // lazy
const EXPLICIT_SCOPE_STACK_KEY = '__nexil:explicitScopeStack' // globalThis Array<ContextScope>
function getExplicitStack(): ContextScope[]
function getExplicitScope(): ContextScope | undefined // stack[stack.length-1]
export function getActiveScope(): ContextScope | undefined {
  return als?.getStore() ?? getExplicitScope()
}
export function runWithScope<T>(scope, fn): T {
  if (als) return als.run(scope, fn)
  stack.push(scope)
  try {
    result = fn()
  } finally {
    pop
  }
  if (isPromiseLike(result)) return result.finally(() => splice)
}
export function __resetAlsForTest(disable: boolean)
```

- Utilisé pour isoler **chaque requête HTTP** : `createRequestContext(request)` `index.ts:105-112` crée `scope = createContextScope()` marqué `scope.values.set('__nexil:request', true)` (ADR-012).
- `runWithScope(ctx.scope, async()=>{ useUserStore() ... })` garantit que deux `fetch` concurrents avec `await` interleaving ne se polluent pas (`packages/nexil/src/core/edge-isolation.test.ts:5`).

### 4.3 Registre walk — `packages/nexil/src/core/state.ts:195-241`

```ts
function getScopedRegistry(scope): Map {
  for (cur=scope; cur; cur=cur.parent) if (cur.values.has(SCOPE_REGISTRY_KEY)) return cur.values.get(...)
  // request marker ?
  let requestScope; for (cur=scope; cur; cur=cur.parent) if (cur.values.has('__nexil:request')) requestScope=cur
  if (requestScope) { create Map in requestScope if missing; return it }
  return getGlobalStoreRegistry()
}
function getStoreRegistry(): Map {
  const scope = getActiveScope() ?? globalThis.__nexil_buildRequestContext?.scope
  if (scope) return getScopedRegistry(scope)
  return getGlobalStoreRegistry()
}
function getAccessLog(): Set { /* même walk */ }
function recordStoreAccess(id){ getAccessLog().add(id) }
```

- `__getAccessedStoreIds(): readonly string[]` `state.ts:209` et `__clearAccessedStoreIds()` `state.ts:213`.
- **Conséquence :** Global hors request → `globalThis` partagé; sous `runWithScope(req.scope)` → per-request isolé; sous `Provider` child de req → walk trouve req registry → partage Global singleton à l'intérieur du `Provider` (test `context-store.test.ts`).

### 4.4 Hydration Cache — `packages/nexil/src/core/state.ts:303-315`

```ts
HYDRATION_CACHE_KEY = '__nexil:stores:hydration' // Map<string,unknown> in globalThis
function getHydrationCache(): Map
export function __consumeHydrationCache(id): unknown | undefined // get+delete
```

- SSR injecte `<script type="nexil/state" id="__NEXIL_STORES__">{"cart":{"count":7,"doubled":14}}</script>` `state.ts:264-269` ( `<` → `\u003c` ).
- Client `hydrateNexilStoresFromDocument()` `packages/nexil/src/client/index.ts:587` parse avant `bootstrapResumability`.

---

## 5. Couche 4 — StoreContext hiérarchique (`state.ts:defineStoreContext`)

### 5.1 Interface — `packages/nexil/src/core/state.ts:124-145`

```ts
export interface StoreContext<T, G, A> extends Context<StoreInstance<T, G, A>> {
  readonly storeId: string
  readonly create: (override?: Partial<T> | T) => StoreInstance<T, G, A>
  readonly ProviderWithAutoCreate: (props: {
    value?: StoreInstance
    children: Child | (() => Child)
    scope?: ContextScope
  }) => Child
}
```

- Étend `Context<T>` `index.ts:157-169` avec `id`, `defaultValue`, `Provider`, `useContext`, `use`.

### 5.2 `defineStoreContext` — `packages/nexil/src/core/state.ts:1250-1411`

```ts
export function defineStoreContext<T, G, A>(id, options: DefineStoreOptions<T, G, A>): StoreContext
```

- `assertStoreId(id)` `state.ts:135`, `stableId = 'nexil:store:'+id`.
- `innerCtx = createContext<StoreInstance|undefined>(undefined, stableId)` `index.ts:343` (stable registry `stableContextRegistry`).
- `create(override?)` → `initial = options.state()` merge `override` shallow si objets, `warnIfReservedStateKeys`, `createProxiedStore({id, initial, getters, unifiedActions, isModular:false})` **sans** registre (isolé).
- `getFallback(scope?)` — singleton per-request/global via `getStoreRegistry()` + HMR `mergeStateForHMR` + `hmrUpdate` + `__consumeHydrationCache` strip getters, `recordStoreAccess`.
- `originalUse = innerCtx.use.bind(innerCtx)`, `originalProvider = innerCtx.Provider.bind(innerCtx)` capturés avant override (anti-récursion `state.ts:1367`).
- `use = (scope?)=>{ const p=originalUse(scope); if(p!==undef){record; return p} return getFallback(scope) }`.
- `Provider = ({value?, children, scope})=>{ const v=value??create(); return originalProvider({value:v, children, scope}) }`.
- Augmentation `Object.defineProperty(sc,'storeId',...)` etc., retourne `innerCtx` casté `StoreContext`.

### 5.3 `defineStore` legacy — `packages/nexil/src/core/state.ts:1152-1224`

Même logique mais `useStore = ()=>StoreInstance` qui fait `registry.get(id)` + HMR + hydration + `createProxiedStore` + `registry.set` + `recordStoreAccess`. Pas de `Provider`.

### 5.4 `useContextProvider` — `packages/nexil/src/core/state.ts:1413`

```ts
export function useContextProvider<T>(
  ctx: Context<T>,
  value: T,
  scope?: ContextScope,
): ContextScope {
  return provideContext(scope ?? getActiveScope() ?? createContextScope(), ctx, value)
}
```

Sucre Qwik-like pour éviter JSX `Provider` nesting.

---

## 6. Couche 5 — Vite Plugin (`vite-plugin/src/*`)

### 6.1 `discoverStores` — `packages/vite-plugin/src/stores.ts:22-214`

```ts
export async function discoverStores(
  root,
): Promise<{ descriptors: StoreDescriptor[]; warnings: string[] }>
```

- Scanne `src/stores` :
  - Répertoire avec `store.ts` → `modular` (`store.ts` wins, warning collision `stores.ts:110`);
  - Répertoire avec `index.ts` sans `store.ts` → `unified-folder`;
  - Fichier `*.ts` hors `types.ts`/`actions.ts` → `unified-file`;
  - `toStoreId(relativePath)` `stores.ts:58` strip ext, `/index`, `/store`, slash normalize.
- Trie `descriptors.sort((a,b)=>a.id.localeCompare(b.id))`.

### 6.2 Virtual — `packages/vite-plugin/src/stores.ts:216-277`

- `generateVirtualBarrel(descriptors)` `stores.ts:216` → `export * from 'abs/path'` + `// store:id`.
- `generateStoresDTS` + `writeStoresDTS` `stores.ts:231,268` → `.nexil/stores.d.ts` avec `declare module '$stores/<id>'`.
- `resolveId/load` `packages/vite-plugin/src/index.ts:1919` expose `virtual:nexil-stores` + `$stores/<id>`.

### 6.3 `wrapActionsWithBatch` — `packages/vite-plugin/src/stores.ts:285-443`

- Parse `@babel/parser` `typescript,jsx`, `traverse` trouve `*Actions = {}` et `actions:{}` ;
- Pour chaque `ObjectMethod`/`ObjectProperty`→`FunctionExpression|ArrowFunctionExpression` avec `BlockStatement` → `return batch(()=>{inner})`, expression → `batch(()=>(expr))`, skip si déjà `batch(`, prepend `import {batch} from '@nexil/core'` si besoin, via `MagicString`.

### 6.4 `transformNexilSource` — `packages/vite-plugin/src/index.ts:812-2094`

- `classifyScopeCaptures` `index.ts:812` détecte `useXStore()`/`useX()` où hook ∈ `importMap` `$stores/*` ou `defineStore|defineStoreContext|createStore` regex `index.ts:561` `(?:defineStore|defineStoreContext|createStore)\s*\(\s*['"]` et `storeDefMatch` `index.ts:628,655` `(?:defineStore|defineStoreContext)\s*\(\s*['"]${storeId}['"]`.
- `directReactiveIdentifier` + `resolveStoreIdForBase` `index.ts:537-582` dérive `storeId` hook name `useCartStore→cart`.
- `extractStaticInitial` `index.ts:584` via `tryReadStoreState` lecture fichier store `state:()=>({count:0})` JSON-ish ou AST.
- Émet `data-nx-store-bind="storeId:path#target"` `index.ts:1469` pour `store.count` ou `bindText$={store.count}` et `data-nx-scope` pour `signal`/`ctx`.

---

## 7. Couche 6 — Client Runtime (`client/index.ts` + `vite-plugin/src/bootstrap.ts`)

### 7.1 Pending Map — `packages/nexil/src/core/state.ts:319-417` & `packages/nexil/src/client/index.ts:644-720`

```ts
STORE_PATH_PENDING_KEY = '__nexil:store-path:pending' // Map<string, Set<Signal>>
export function __getStorePathSignal(storeId, path): Signal
export function __linkPendingStorePathSignals(storeId, store)
```

- `__getStorePathSignal` :
  1. Si registre a `store` et `path` sans `.` et `__nexil_getterSignals` a `path` → retourne getter signal.
  2. Sinon `store.lens(path)`.
  3. Sinon check `pendingMap.get(key)` → réutilise premier pending (DOM et handler partagent même Signal).
  4. Sinon crée pending `state(initial)` seed depuis `getHydrationCache` → `document.getElementById('__NEXIL_STORES__')` parse → `__snapshotAccessedStores()[storeId]` → `null`, `pendingMap.set(key, {pending})`.
- `__linkPendingStorePathSignals` : pour chaque `key` commençant `storeId:`, récupère `signal` réel (`getterSignals` ou `lens`), `sig.set(signal())` + `signal.subscribe(()=>sig.set(signal()))`, `map.delete(key)`.

### 7.2 `hydrateNexilStoresFromDocument` — `packages/nexil/src/client/index.ts:587-601`

```ts
export function hydrateNexilStoresFromDocument() {
  const el = document.getElementById('__NEXIL_STORES__')
  if (!el) return
  const data = JSON.parse(el.textContent.replace(/\\u003c/g, '<'))
  const map = globalThis['__nexil:stores:hydration'] // Map
  for ([k, v] of Object.entries(data)) if (!map.has(k)) map.set(k, v)
}
export function hydrateNexilStateFromDocument() {
  hydrateNexilStoresFromDocument() /* __NEXIL_STATE__ + __NEXIL_SCOPE_SEEDS__ */
}
```

Appelé avant `bootstrapResumability` `client/index.ts:956`.

### 7.3 `getStorePathSignalClient` — `packages/nexil/src/client/index.ts:644`

Même logique générique sans hardcode `cart:doubled` (supprimé `client/index.ts:679`). Fallback générique via hydration.

### 7.4 `bindStorePathBindings` — `packages/nexil/src/client/index.ts:764-800`

```ts
function bindStorePathBindings(root, disposers) {
  for (el of root.querySelectorAll('[data-nx-store-bind]'))
    for (binding of parseStoreBindingAttribute(value))
      signal = getStorePathSignalClient(binding.storeId, binding.path)
  if (signal() == null && signal.set) signal.set(el.textContent.trim()) // preserve SSR text pour getter pending
  disposers.push(bindReadableSignalToDOM(signal, { node: el, target: binding.target }))
}
```

`parseStoreBindingAttribute` `client/index.ts:722` split `;` `#` `:` valide `storeId:path#target`.

### 7.5 `bootstrapResumability` — `packages/nexil/src/client/index.ts:956-1000`

```ts
export function bootstrapResumability(root = document, load = defaultChunkLoader) {
  hydrateNexilStateFromDocument()
  const cache = new Map()
  const disposers = []
  bindResumableDOMBindings(root, cache, disposers)
  bindStorePathBindings(root, disposers)
  const disposeGlobal = initGlobalEventDelegator(root, loader, cache)
  // fallback direct listeners
}
```

- `materializeScope` `client/index.ts:349-432` merge `data-nx-scope` ancestors, `kind:'value'|'signal'|'store'|'action'|'ctx'|'unsupported'`.
- `initGlobalEventDelegator` `client/index.ts:891` délégation `DELEGATED_EVENTS` `['click','input',...]`.

### 7.6 Runtimes production — `packages/vite-plugin/src/bootstrap.ts` (2kB) + `external-bindings.ts`

Minifiés mais même logique sans `cart:doubled` (supprimé). Contiennent `RESUMABILITY_BOOTSTRAP`, `RESUMABILITY_BINDINGS`, `RESUMABILITY_BINDINGS_EXTERNAL`.

---

## 8. Couche 7 — SSR & Edge (`cli` + `dev-server` + `state.ts:__NEXIL_STORES__`)

### 8.1 Snapshot — `packages/nexil/src/core/state.ts:225-270`

```ts
export function __snapshotAccessedStores(): Record<string,unknown> | undefined {
  const ids=__getAccessedStoreIds(); if(ids.length===0) return
  const registry=getStoreRegistry()
  for(id of ids){
    const snap=store.snapshot(); const outSnap={...snap}
    const getterSignals=store.__nexil_getterSignals
    for([k,sig] of getterSignals) try{ const v=sig(); if(isSerializable(v)) outSnap[k]=v }catch{}
    if(!isSerializable(outSnap)) { warn dev else throw; continue }
    out[id]=outSnap
  }
  return out
}
export function __getStoresScriptTag(): string|undefined {
  const data=__snapshotAccessedStores(); if(!data) return
  const json=JSON.stringify(data); const escaped=json.replace(/</g,'\\u003c')
  return `<script type="nexil/state" id="__NEXIL_STORES__">${escaped}</script>`
}
export function __hydrateStoresFromJson(json:string)
```

- Inclut getters sérializables (`doubled` etc.) pour `data-nx-store-bind` sans attendre chunk.
- `<` échappé anti-XSS.

### 8.2 Injection

- `packages/cli/src/index.ts:1603` `buildArtifacts` `runWithScope(generatedRequestContext.scope, ()=>__getStoresScriptTag())` puis `__clearAccessedStoreIds`.
- `packages/dev-server/src/index.ts:417` `nexilSSRPlugin` même `runWithScope(devRequestContext.scope)` per-route `home 42` / `cart 7`.
- Client `hydrate` avant `bootstrapResumability`.

### 8.3 Edge

```ts
// Cloudflare Workers
import { createRequestContext, runWithScope } from '@nexil/core'
export default { async fetch(req){
  const ctx=createRequestContext(req)
  return runWithScope(ctx.scope, async()=>{
    const html=renderToString(<App/>)
    const tag=__getStoresScriptTag()??''; __clearAccessedStoreIds()
    return new Response(html+tag, {headers:{'Content-Type':'text/html'}})
  })
}}
```

`runWithScope` explicit stack `index.ts:241` `stack.push` + `Promise.finally` splice.

---

## 9. Couche 8 — HMR & Sécurité

### 9.1 HMR — `packages/nexil/src/core/state.ts:65,860`

- `mergeStateForHMR` shallow top-level : préserve live `count:6` quand `name:'Ada'` ajouté, supprime clés disparues.
- `__nexil_hmrUpdate(nextGetters, nextActions)` dispose/recreate `computed`/`actionsMap`, `currentGetters` ref mise à jour pour `this`-actions lisant getters.
- `vite-plugin/src/index.ts:handleHotUpdate` refresh `storeDescriptors` + `.nexil/stores.d.ts` sans reset `globalThis.__NEXIL_STORES_GLOBAL_REGISTRY__`.

### 9.2 Sécurité

- `isSerializable` à chaque `create/set/proxy` `state.ts:60,498,505,581,667`; non-sérializable → `TypeError`.
- `<` échappé `\u003c` dans script tag `state.ts:268`.
- `__NEXIL_STORES__` public — jamais secrets (ne pas mettre `password`, mettre `user.id` seulement).
- `stored.x = ()=>{}` throw.

---

## 10. Flux complet — du `src/stores/cart.ts` au DOM

```
1. Autorisation  src/stores/cart.ts  defineStore('cart',{state:()=>({count:7}), getters:{doubled:s=>s.count*2}, actions:{inc(){this.count++}}})
2. Découverte    Vite discoverStores(root) → descriptor {id:'cart', kind:'unified-file', entry:'.../cart.ts'}
                 → virtual:nexil-stores barrel + $stores/cart alias + .nexil/stores.d.ts
                 → wrapActionsWithBatch → batch(()=>{draft.count++})
3. Composant     src/routes/index.tsx  import { useCartStore } from '$stores/cart'
                 export default ()=>{ const cart=useCartStore(); return <p>{cart.count}</p> <button onClick$={()=>cart.inc()}>Inc</button> }
4. Transform     classifyScopeCaptures → cart.count via String(cart.count) unwrap → ScopeCapture {kind:'signal', storeId:'cart', storePath:'count'}
                 → extractStaticInitial via tryReadStoreState('cart') → 7
                 → émet <p data-nx-store-bind="cart:count#text">7</p>
                 → onClick$ chunk header import cart, init store, map variable
5. SSR           runWithScope(req.scope, ()=> renderToString(<Index/>)) → useCartStore() → recordStoreAccess('cart') → signal 7
                 → snapshot {cart:{count:7, doubled:14}} → <script type="nexil/state" id="__NEXIL_STORES__">{"cart":{"count":7,"doubled":14}}</script>
6. Client load   hydrateNexilStoresFromDocument() parse JSON → Map cart->{count:7,doubled:14}
                 → bindStorePathBindings() find [data-nx-store-bind] → getStorePathSignalClient('cart','count') → pending state(7)
                 → getStorePathSignalClient('cart','doubled') → pending state(14) seed depuis hydration (pas hardcode)
7. Click         initGlobalEventDelegator → invokeResumableHandler → import chunk → `const cart=useCartStore()` → __linkPending → pending count linked à lens signal, pending doubled linked à getter signal
                 → cart.inc() → cloneSerializable({count:7}) → draft.count 8 → isSerializable → batch → signal.set({count:8}) → getter doubled recompute 16 → lens count notify → pending set(8) → DOM text 8 ; pending doubled set(16) → DOM 16
```

---

## 11. Vérification pratique — résultats des tests

- **Unit** `pnpm test` 31 août : `41/41` fichiers `332/332` tests (dont `context-store.test.ts` 10/10 hierarchical, `stores-proxy.test.ts` 15/15 Proxy, `hmr.test.ts` 6/6 shallow merge, `request-isolation.test.ts` 4/4 ALS, `edge-isolation.test.ts` 5/5 explicit stack).
- **Build** `pnpm build` `13` packages + `5` examples (basic-app, blog, ecommerce, hello, landing-workbench-showcase-practical) sans `node:net`/`node:crypto` browser error (dynamic imports `media.ts`/`og-image.ts`).
- **Pratique Node** (31 août, script `node --input-type=module` 30 assertions) :
  ```
  ✅ signal initial 0 / set 1 / updater 2 / computed 4/6 / batch single notify
  ✅ legacy snapshot / defineStore inc & proxy set & doubled
  ✅ modular rename / StoreContext fallback light & create dark & Provider overrides
  ✅ nested Provider nearest-wins outer|inner|outer / ALS reqA 1 vs reqB 2 / global fallback 0
  ✅ array push via action & proxy / isSerializable / provideContext / cart total
  === Practical state tests: 30 pass, 0 fail ===
  ```
- **CLI scaffold** `scaffoldStore` `split`/`unified`/`scoped` :
  - `src/stores/user/{types.ts,actions.ts,store.ts}` `createStore({id:'user'})`
  - `src/stores/cart.ts` `defineStore('cart')`
  - `src/stores/theme.ts` `defineStoreContext('theme')` avec commentaires Provider/use.
- **SSR** `__getStoresScriptTag` per-request `{"practical-ssr-a":{"count":42}}` vs `{"practical-ssr-a":{"count":7}}` isolés.

---

## 12. Annexe — fichiers clés

| Fichier                                         | Rôle                                  | Lignes critiques                                                                                                                                                                                         |
| ----------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/nexil/src/core/reactivity.ts`         | Signals                               | `14-26` Signal, `124-192` computed, `244-252` batch, `33-69` tracking                                                                                                                                    |
| `packages/nexil/src/core/index.ts`              | Context, ALS, serializable            | `63-83` isSerializable, `105-112` createRequestContext marqué, `171-267` ALS, `343-370` createContext                                                                                                    |
| `packages/nexil/src/core/state.ts`              | Store Proxy + registre + StoreContext | `21-58` path, `65-86` HMR merge, `124-145` StoreContext, `195-241` registre walk, `319-417` pending, `446-541` createPathProxy, `543-975` createProxiedStore, `1152-1413` defineStore/defineStoreContext |
| `packages/nexil/src/client/index.ts`            | Hydration + bindings                  | `587-601` hydrate, `644-720` getStorePathSignalClient générique, `764-800` bindStorePathBindings, `956-1000` bootstrap                                                                                   |
| `packages/vite-plugin/src/stores.ts`            | Découverte                            | `22-214` discover, `216-277` virtual/DTS, `285-443` wrap batch                                                                                                                                           |
| `packages/vite-plugin/src/index.ts`             | Transform                             | `561` hook, `628,655` storeDefMatch, `812` classify, `1469` emit bind                                                                                                                                    |
| `packages/vite-plugin/src/bootstrap.ts`         | Runtime prod                          | `RESUMABILITY_BOOTSTRAP/BINDINGS` (sans cart hardcode)                                                                                                                                                   |
| `packages/cli/src/index.ts`                     | Générateur                            | `321` scaffoldStore scoped, `1877` runCli parse                                                                                                                                                          |
| `packages/nexil/src/core/context-store.test.ts` | Tests hiérarchiques                   | `10` tests Provider                                                                                                                                                                                      |

---

_Document généré 31 août 2026 — vérifier contre `STATE_TYPES.md:756` et `plans/defineStore-refonte/review.md`._
