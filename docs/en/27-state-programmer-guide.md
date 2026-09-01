# Nexil — Guide Programmeur État

> **Pour qui :** développeur qui écrit `src/routes`, `src/components`, `src/stores` avec `npm run dev`  
> **Version :** 0.2.3 — 31 août 2026  
> **Prérequis :** `pnpm install`, `pnpm build` déjà vert, `docs/en/25-nexil-stores.md` lu  
> **Style :** copier-coller prêt, anti-patterns inclus, checklist avant merge

---

## Table des matières

1. [Arbre de décision — quoi utiliser quand](#1-arbre-de-décision--quoi-utiliser-quand)
2. [Démarrage rapide — 5 minutes](#2-démarrage-rapide--5-minutes)
3. [Signaux locaux (`state`, `computed`, `batch`)](#3-signaux-locaux-state-computed-batch)
4. [Stores globaux (`defineStore` / `createStore`)](#4-stores-globaux-definestore--createstore)
5. [Stores hiérarchiques (`defineStoreContext` = `createContext` React)](#5-stores-hiérarchiques-definestorecontext--createcontext-react)
6. [Contexte simple (`createContext`)](#6-contexte-simple-createcontext)
7. [Bindings DOM fine-grained (`data-nx-store-bind`)](#7-bindings-dom-fine-grained-data-nx-store-bind)
8. [Actions, batch et `this`](#8-actions-batch-et-this)
9. [CLI Générateur (`nexil g store`)](#9-cli-générateur-nexil-g-store)
10. [Cuisine complète — 4 exemples copiables](#10-cuisine-complète--4-exemples-copiables)
11. [SSR / SSG / Edge — isoler chaque requête](#11-ssr--ssg--edge--isoler-chaque-requête)
12. [Anti-patterns & pièges vus en prod](#12-anti-patterns--pièges-vus-en-prod)
13. [Checklist avant PR](#13-checklist-avant-pr)
14. [API rapide (import map)](#14-api-rapide-import-map)

---

## 1. Arbre de décision — quoi utiliser quand

```
Besoin d'état ?
├─ Un seul composant, toggle/input draft → state(0)  [local]
├─ Dérivé pur (total = price*qty) → computed(()=> price()*qty)
├─ Partagé entre header + drawer, survit Link ?
│   ├─ Non hiérarchique (cart, theme global) → defineStore('cart', ...) [global singleton]
│   └─ Hiérarchique (locale/layout, admin vs user) → defineStoreContext('locale', ...) + Provider [hierarchical]
├─ Injection arbre sans store (theme Signal, user) → createContext(state('light'))
├─ Gros store métier avec types/actions séparés → createStore({id:'user', state, actions:userActions}) [modular]
└─ Registre générique (plugin) → createStateRegistry().getOrCreate('shared','cart', init)
```

| Cas                         | API           | Survit `Link` ?                                      | Isolé requête ?                                    | Exemple                    |
| --------------------------- | ------------- | ---------------------------------------------------- | -------------------------------------------------- | -------------------------- |
| `state(0)`                  | `@nexil/core` | non (local)                                          | par closure, `state('light')` capturé sérializable | toggle menu                |
| `defineStore`               | `@nexil/core` | oui (`__NEXIL_STORES__` global)                      | oui `runWithScope(req.scope)`                      | cart global                |
| `defineStoreContext`        | `@nexil/core` | oui si `global` + snapshot, mais shadow par Provider | oui + nested                                       | locale `fr` vs `en` layout |
| `createContext`             | `@nexil/core` | non (pas sérialisé)                                  | oui via `ContextScope`                             | theme Signal               |
| `createStore({id})` modular | `@nexil/core` | oui                                                  | oui                                                | user complexe              |

> Règle d'or : **la plus petite portée qui marche**. Ne mets pas tout en `global`.

---

## 2. Démarrage rapide — 5 minutes

```bash
pnpm create-nexil my-app # ou npx create-nexil@latest
cd my-app
pnpm install
pnpm --filter ./packages/nexil build # déjà fait en monorepo
pnpm dev # http://localhost:5173
```

```ts
// src/stores/counter.ts — 1 fichier, 10 lignes
import { defineStore } from '@nexil/core'
export const useCounter = defineStore('counter', {
  state: () => ({ count: 0 }),
  getters: { doubled: (s) => s.count * 2 },
  actions: {
    inc() {
      this.count++
    },
  },
})
```

```tsx
// src/routes/index.tsx
import { useCounter } from '$stores/counter'
export default function Index() {
  const counter = useCounter()
  return (
    <main>
      <p>
        Count: {counter.count} — doubled: {counter.doubled}
      </p>
      <button onClick$={() => counter.inc()}>Inc</button>
    </main>
  )
}
```

`pnpm build` génère `<p data-nx-store-bind="counter:count#text">0</p>` + `<script id="__NEXIL_STORES__">{"counter":{"count":0,"doubled":0}}</script>` — zéro JS au load, DOM mis à jour en O(1) au clic.

---

## 3. Signaux locaux (`state`, `computed`, `batch`)

### 3.1 `state<T>(initial)`

```ts
import { state, computed, batch, effect } from '@nexil/core'

const count = state(0) // Signal<number>
const theme = state<'light' | 'dark'>('light') // union verrouillée

count.set(1)
count.set((p) => p + 1)
count.setValue(1) // direct, même si T est fonction

// ❌ count.value = 1 // readonly
```

Options `equals` : `state<string[]>(['a'], {equals:(a,b)=> a.length===b.length && a.every((v,i)=>v===b[i])})` `packages/nexil/src/core/reactivity.ts:9`.

### 3.2 `computed`

```ts
const price = state(100),
  qty = state(2)
const total = computed(() => price() * qty()) // ReadableSignal<number>
console.log(total()) // 200, lazy, memo
// ❌ computed(()=>{ price.set(0); return price()}) // cycle → throw
```

### 3.3 `batch`

```ts
const first = state('Sarah'),
  last = state('Ali')
batch(() => {
  first.set('Noor')
  last.set('Ali')
}) // 1 notification, pas 2
// ⚠️ batch(...) dans onClick$ n'est PAS resumable (import bare dans chunk). Préfère actions ou sets séquentiels (runtime coalesce déjà).
```

### 3.4 `effect` / `watch`

```ts
import { effect, watch, createRoot, onCleanup } from '@nexil/core'

const c = state(0)
const stop = effect(() => {
  document.title = String(c())
})
// stop() dispose ; toujours dans createRoot per requête/composant, jamais module-level
```

### 3.5 Capturer dans `onClick$` — règle JSON-literal

```ts
export default component(()=>{
  const count = state(0)          // ✅ literal → sérialisé data-nx-scope
  const items = state(load())     // ❌ unsupported → build warn, clic ne matérialise pas
  return <button onClick$={()=> count.set(count()+1)}>{count()}</button>
})
```

Multiple handlers sur même `state(0)` partagent une seule instance browser keyée `nx:signal:<hash>` `packages/nexil/src/client/index.ts:893`.

---

## 4. Stores globaux (`defineStore` / `createStore`)

### 4.1 Unified `defineStore` — petit/moyen store

```ts
// src/stores/cart.ts
import { defineStore } from '@nexil/core'
export interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
}
export const useCartStore = defineStore('cart', {
  state: (): { items: CartItem[] } => ({ items: [] }),
  getters: {
    totalItems: (s) => s.items.reduce((sum, i) => sum + i.quantity, 0),
    totalPrice(s) {
      return s.items.reduce((sum, i) => sum + i.price * i.quantity, 0)
    },
  },
  actions: {
    addItem(item: Omit<CartItem, 'quantity'>) {
      const ex = this.items.find((i) => i.id === item.id)
      if (ex) ex.quantity += 1
      else this.items.push({ ...item, quantity: 1 })
    },
    clear() {
      this.items = []
    },
  },
})
// usage
const cart = useCartStore()
cart.addItem({ id: '1', name: 'Book', price: 10 })
console.log(cart.totalPrice) // 10
cart.items.push({ id: '2', name: 'Pen', price: 2, quantity: 3 }) // proxy array
```

- `this` dans actions = draft proxy avec getters recomputés depuis draft (`this.totalPrice` lu pendant `add` voit draft).
- `getters` deviennent `store.totalItems` (lecture `signal` computed `packages/nexil/src/core/state.ts:780`).

### 4.2 Modular `createStore` — gros store équipe

```
src/stores/user/
├── types.ts    // interfaces UserState
├── actions.ts  // export const userActions = { setCount(state:UserState, n){ state.count=n } }
└── store.ts    // createStore
```

```ts
// types.ts
export interface UserState {
  count: number
  profile: { name: string }
}
// actions.ts
import type { UserState } from './types'
export const userActions = {
  increment(state: UserState) {
    state.count += 1
  },
  setName(state: UserState, name: string) {
    state.profile.name = name
  },
}
// store.ts
import { createStore } from '@nexil/core'
import type { UserState } from './types'
import { userActions } from './actions'
const initialState: UserState = { count: 0, profile: { name: 'Ada' } }
export const useUserStore = createStore({
  id: 'user',
  state: () => initialState,
  actions: userActions,
})
// usage : même proxy
const user = useUserStore()
user.increment()
user.profile.name = 'Eve' // proxy
user.setName('Noor') // via action
```

### 4.3 Legacy `createStore(initial, scope)` — gardé

```ts
const legacy = createStore({ x: 1 }, 'local') // scope legacy, toujours supporté
```

---

## 5. Stores hiérarchiques (`defineStoreContext` = `createContext` React)

> **Quand :** `locale` différente par `admin/settings` layout, `theme` override par section, `user` mock par test. Inspiré Qwik `createContextId` (stableId) + Astro `atom` plat pour global par défaut — hybride.

### 5.1 Déclarer

```ts
// src/stores/theme.ts
import { defineStoreContext } from '@nexil/core'
export interface ThemeState {
  mode: 'light' | 'dark'
}
export const Theme = defineStoreContext('theme', {
  state: (): ThemeState => ({ mode: 'light' }),
  getters: {},
  actions: {
    toggle() {
      this.mode = this.mode === 'light' ? 'dark' : 'light'
    },
  },
})
// Note : exporte un Context, pas un hook. Nommez `Theme` ou `ThemeContext` pour claireté.
```

`stableId = 'nexil:store:theme'` → Vite stable hash pour code-splitting.

### 5.2 Consommer

```ts
// sans Provider → fallback singleton per-request (comme defineStore)
const theme = Theme.use() // 'light'
theme.toggle() // 'dark'

// avec Provider — nearest-wins React
import { Theme } from '$stores/theme'
const custom = Theme.create({mode:'dark'}) // frais isolé
Theme.Provider({
  value: custom,
  children: ()=> {
    console.log(Theme.use().mode) // 'dark' (provided)
    return <Layout/>
  }
})
// auto-create si value omise
Theme.Provider({ children: ()=> <App/> }) // crée via Theme.create() implicitement
```

### 5.3 Imbriqué (shadow)

```ts
const outer = Theme.create({ mode: 'outer' })
const inner = Theme.create({ mode: 'inner' })
Theme.Provider({
  value: outer,
  children: () => {
    console.log(Theme.use().mode) // 'outer'
    const res = Theme.Provider({ value: inner, children: () => Theme.use().mode })
    console.log(res) // 'inner'
    console.log(Theme.use().mode) // 'outer' encore (isolé runWithScope)
    return null
  },
})
```

### 5.4 Survie Link & isolation requête

```ts
// Global singleton survit Link (via __NEXIL_STORES__)
// Hierarchical shadow survit seulement dans sous-arbre Provider, mais chaque requête HTTP isolée :
import { createRequestContext, runWithScope } from '@nexil/core'

export async function handle(req: Request){
  const ctx = createRequestContext(req)
  return runWithScope(ctx.scope, async()=>{
    // chaque req a son Theme.use() isolé 1 vs 2
    Theme.use().mode = 'dark'
    const html = renderToString(<App/>)
    const tag = __getStoresScriptTag()??'' // seulement stores accessed dans cette req
    __clearAccessedStoreIds()
    return new Response(html+tag)
  })
}
```

Test pratique (30 pass) montre `reqA n=1` vs `reqB n=2` concurrent `runWithScope` isolés `packages/nexil/src/core/context-store.test.ts`.

### 5.5 Helper `useContextProvider`

```ts
import { useContextProvider } from '@nexil/core'
const nextScope = useContextProvider(Theme, Theme.create({ mode: 'dark' }), ctx.scope)
// nextScope à passer manuellement à children si besoin
```

---

## 6. Contexte simple (`createContext`)

Pour injection sans store (Signal ou valeur nue) :

```ts
import { createContext, state } from '@nexil/core'
const ThemeCtx = createContext(state<'light'|'dark'>('light'), 'app:theme')

export function Section(){
  const theme = state<'light'|'dark'>('dark')
  return ThemeCtx.Provider({
    value: theme,
    children: ()=> <button onClick$={()=> ThemeCtx.use().set('light')}>light</button>
  })
}
// lecture
const t = ThemeCtx.use() // ou useContext(ThemeCtx)
```

- `provideContext(scope, ctx, val)` `index.ts:276` → child scope immuable.
- `Provider` children **doivent** être `()=>Child` sync `index.ts:299` — sinon `throw synchronously`. Pour async : `withContext(scope, ctx, val, run)`.
- Valeurs **non sérialisées** par défaut → pas de `__NEXIL_STORES__`; utiliser `defineStore` global si survie browser nécessaire `docs/en/07-state-and-reactivity.md:146`.

---

## 7. Bindings DOM fine-grained (`data-nx-store-bind`)

Le compilateur Vite `packages/vite-plugin/src/index.ts:1469` émet :

```tsx
const cart = useCartStore()
// avant
<p>{cart.count}</p>           // auto → <p data-nx-store-bind="cart:count#text">0</p>
// explicite
<p bindText$={cart.count}>0</p> // même
<p bindText$={cart.user.profile.name}>Ada</p> // nested
<p bindText$={cart.doubled}>14</p> // getter (seed via __NEXIL_STORES__)
```

- Directives : `bindText$`, `bindValue$`, `bindChecked$`, `bindDisabled$`, `bindHidden$`, `bindClass$`, `bindStyle$`, `bindHref$`, `bindSrc$`, `bindAriaLabel$` → `packages/nexil/src/client/index.ts:764`.
- Runtime `bindStorePathBindings` `client/index.ts:764` via `getStorePathSignalClient` `client/index.ts:644` avec pending Map `__nexil:store-path:pending` `state.ts:319`.
- **Anti-patterns** `STATE_TYPES.md` :
  - `String(store.count)` non binding — utiliser `{store.count}` ou `bindText$`.
  - `batch(()=>...)` dans `onClick$` non resumable — utiliser actions.
  - `computed` local non resumable pour binding texte — préférer getter store `doubled`.
  - `store.count` `MemberExpression` auto-bind supporté depuis Level 2 (sinon `String()` wrapper nécessaire avant).

---

## 8. Actions, batch et `this`

### 8.1 Unified `this`

```ts
actions:{
  add(item){
    // this = StoreInstance draft proxy, batch → 1 flush
    const ex = this.items.find(i=> i.id===item.id)
    if(ex) ex.quantity+=1
    else this.items.push({...item, quantity:1})
    // lire getter dans action : this.totalPrice est recomputé depuis draft (proxy draftWithGetters state.ts:828)
  }
}
```

### 8.2 Modular `state`

```ts
export const cartActions = {
  add(state: CartState, item: CartItem) {
    state.items.push(item)
  }, // state = draft clone
}
```

Vite `wrapActionsWithBatch` `stores.ts:285` wrappe déjà chaque action `batch(()=>{...})` au build, runtime `createProxiedStore` `state.ts:805` fait aussi `batch` — double sûr.

### 8.3 Batch manuel

```ts
import { batch } from '@nexil/core'
batch(() => {
  cart.count += 1
  cart.total += 10
}) // si hors action, sinon action suffit
```

---

## 9. CLI Générateur (`nexil g store`)

```bash
nexil g store cart --unified          # src/stores/cart.ts defineStore
nexil g store user --split            # src/stores/user/{types.ts,actions.ts,store.ts} createStore
nexil g store theme --scoped          # src/stores/theme.ts defineStoreContext (hierarchical)
nexil g store admin/cart --unified    # id "admin/cart" nested
nexil g store --help                  # liste
```

- Templates `packages/cli/src/index.ts:321` — `capName` PascalCase, `id` normalisé slash, `count` exemple.
- Collisions : `store.ts` wins sur `*.ts`, warning `stores.ts:110`; types/actions ignorés.
- Vérif : `pnpm --filter ./packages/cli test -- src/generate-store.test.ts` 6/6 + `scaffoldStore` pratique split/unified/scoped 3 passés `GUIDE` §11.

---

## 10. Cuisine complète — 4 exemples copiables

### 10.1 Compteur global (résumé zéro)

```ts
// stores/counter.ts
import { defineStore } from '@nexil/core'
export const useCounter = defineStore('counter', {
  state:()=>({ count:0 }),
  getters:{ doubled: s=> s.count*2 },
  actions:{ inc(){ this.count++ } }
})
// routes/index.tsx
import { useCounter } from '$stores/counter'
export default function Home(){
  const c = useCounter()
  return <><span bindText$={c.count}>0</span><span bindText$={c.doubled}>0</span><button onClick$={()=> c.inc()}>+1</button></>
}
// SSR tag : <script id="__NEXIL_STORES__">{"counter":{"count":0,"doubled":0}}</script>
```

### 10.2 Cart panier (array + batch)

```ts
// stores/cart.ts voir §4.1
// usage direct mutation proxy aussi batchée
cart.items.push({ id: '2', quantity: 1 }) // 1 flush
```

### 10.3 Theme layout hiérarchique (StoreContext)

```tsx
// stores/theme.ts defineStoreContext('theme', {state:()=>({mode:'light'}), actions:{toggle(){ this.mode=this.mode==='light'?'dark':'light'}}})
// _layout.tsx
import { Theme } from '$stores/theme'
export default function Layout(props, ctx) {
  // ctx.scope fourni par renderer
  return Theme.Provider({
    value: Theme.create({ mode: 'dark' }), // ou sans value → auto
    scope: ctx.scope,
    children: () => (
      <div>
        <Header />
        <slot />
      </div>
    ),
  })
}
// Header.tsx
import { Theme } from '$stores/theme'
export function Header() {
  const theme = Theme.use()
  return <button onClick$={() => theme.toggle()}>Mode: {theme.mode}</button>
}
// test nested shadow voir §5.3
```

### 10.4 Per-request user (Edge)

```ts
// stores/user.ts defineStore('user', ...)
import { createRequestContext, runWithScope, defineStore } from '@nexil/core'
const useUser = defineStore('user', { state:()=>({ id:'anon' }), getters:{}, actions:{ login(){ this.id='u_42' }}})
export async function fetch(req:Request){
  const ctx = createRequestContext(req)
  return runWithScope(ctx.scope, async()=>{
    const user = useUser()
    user.login() // isolé req
    const html = renderToString(<App/>)
    const tag = __getStoresScriptTag()??'' // {"user":{"id":"u_42"}}
    __clearAccessedStoreIds()
    return new Response(html+tag)
  })
}
```

---

## 11. SSR / SSG / Edge — isoler chaque requête

- **Node** : `AsyncLocalStorage` auto `index.ts:179` — aucun code, `runWithScope` fait tout.
- **Cloudflare/Deno** : stack explicite `index.ts:241` `__nexil:explicitScopeStack` + `Promise.finally` pop — **toujours `await runWithScope`** sinon fuite.
- **Snapshot** `state.ts:225` seulement `ids` `recordStoreAccess` → JSON → `<` escaped → `hydrateNexilStoresFromDocument` `client/index.ts:587` avant `bootstrapResumability`.
- Vérif pratique : `__getStoresScriptTag` per-route `{"practical-ssr-a":{"count":42}}` vs `{"practical-ssr-a":{"count":7}}` isolés (test SSR §11).

---

## 12. Anti-patterns & pièges vus en prod

| Erreur                                                           | Pourquoi                                       | Fix                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `state(new Date())`                                              | `Date` prototype fail `isSerializable` throw   | `state('2026-08-31T00:00:00Z')` + parse                        |
| `defineStore('x',{state:()=>({fn:()=>{}})})`                     | fonction non sérializable `state.ts:60` throw  | données seules, fonctions hors état                            |
| `s.value = 1`                                                    | `value` readonly getter                        | `s.set(1)` / `s.count++` proxy                                 |
| `computed(()=>{count.set(1);return count()})`                    | cycle throw                                    | jamais écrire dans computed                                    |
| Module `effect(()=> routeSignal())`                              | sans owner → fuite inter-requêtes              | `createRoot` per requête                                       |
| `store.setPath('user..name','x')`                                | `user..` invalide segment `state.ts:21` throw  | `'user.profile.name'`                                          |
| Tout en `global`                                                 | couplage + survit Link                         | préférer `local/route`                                         |
| `state(load())` capturé `onClick$`                               | non JSON literal → `unsupported`               | `resource(()=>load())`                                         |
| `store.select(()=>Date.now())`                                   | impur, casse memo                              | `(v)=> v.items.length` pur                                     |
| Clé `value`                                                      | shadow `Store.value` dev warn `RESERVED_KEYS`  | renommer `amount`                                              |
| `String(signal())` JSX                                           | non binding, compiler skip `String()`          | `{signal()}` ou `bindText$`                                    |
| `batch(()=>...)` dans `onClick$`                                 | bare import non résolu chunk                   | sets séquentiels                                               |
| `<Ctx.Provider><span>{Ctx.use()}</span></Ctx.Provider>`          | enfant évalué avant `scope` set `index.ts:299` | `Ctx.Provider({value, children:()=><span>{Ctx.use()}</span>})` |
| `mergeStateForHMR` deep                                          | shallow top-level seulement `state.ts:65`      | remplacer objet imbriqué entier                                |
| `fire-and-forget runWithScope(scope, async()=>...)` sans `await` | stack explicite fuite                          | `await runWithScope`                                           |
| `store.value` comme clé d'état                                   | dev warn `value`                               | renommer                                                       |
| `cart:doubled` hardcode                                          | supprimé générique                             | seed via `__NEXIL_STORES__`                                    |

---

## 13. Checklist avant PR

```
□ Chaque type étend Serializable — isSerializable throw au set
□ state() initial JSON literal si capturé onClick$ — pnpm build sans warn unsupported, data-nx-scope présent
□ computed pur synchrone sans set, pas de cycle
□ effect/watch/resource avec owner createRoot et dispose
□ Stores sensibles non global, pas de secrets dans nexil-state.js / __NEXIL_STORES__ public
□ Clés /^[a-zA-Z0-9:_/-]+$/ et path /^[A-Za-z_$][\w$]*$/, pas de reserved keys
□ snapshot() clone détaché jamais muté pour affecter live
□ Requête privée via createRequestContext + runWithScope, jamais singleton module
□ Selectors purs (value)=>..., pas de side effect
□ batch seulement transaction vraie
□ HMR shallow top-level attendu, deep shape → remplacer branche entière
□ Edge await runWithScope
□ pnpm build && pnpm typecheck && pnpm test (41/41 332/332) && pnpm lint
```

---

## 14. API rapide (import map)

| Quoi                                                                                                                                                                         | Depuis                                | Type                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------- |
| `Serializable`, `isSerializable`                                                                                                                                             | `@nexil/core`                         | type+guard `index.ts:1,63`             |
| `state`, `useState`, `computed`, `effect`, `watch`, `batch`, `untrack`, `createRoot`, `onCleanup`, `resource`                                                                | `@nexil/core`                         | fns `reactivity.ts`                    |
| `Signal<T>`, `ReadableSignal<T>`, `Resource<T>`                                                                                                                              | `@nexil/core`                         | types `reactivity.ts:14`               |
| `Store<T>`, `StoreInstance<T,G,A>`, `StateRegistry`, `CreateStoreOptions`, `DefineStoreOptions`, `StoreContext<T,G,A>`                                                       | `@nexil/core`                         | types `state.ts:7,92,124`              |
| `createStore` (legacy `initial,scope` + `id,state,actions`), `defineStore`, `defineStoreContext`, `createStateRegistry`, `useContextProvider`                                | `@nexil/core`                         | fns `state.ts:979,1152,1250,1409,1413` |
| `createContext`, `createContextScope`, `provideContext`, `withContext`, `Context<T>`, `ContextScope`, `getActiveScope`, `runWithScope`, `createRequestContext`, `useContext` | `@nexil/core`                         | fns `index.ts:105,343`                 |
| `For`, `Show`, `ErrorBoundary`, `Suspense`, `Form`, `SubmitButton`                                                                                                           | `@nexil/core`                         | comps `index.ts:128-439`               |
| `$stores/*`, `virtual:nexil-stores`                                                                                                                                          | `vite-plugin` discovery               | virtual `stores.ts:216`                |
| `__getStoresScriptTag`, `__snapshotAccessedStores`, `hydrateNexilStoresFromDocument`                                                                                         | `@nexil/core` / `client/index.ts:587` | SSR `state.ts:225`                     |

> Anciens `@nexil/reactivity` / `@nexil/state` existent mais réexportent `@nexil/core` — préférer `@nexil/core`.

---

_Dernière vérif : `pnpm test` 41/41 332/332, `practical_state_test.mjs` 30 pass, `scaffoldStore` split/unified/scoped 3 pass, `__NEXIL_STORES__` per-request isolé `practical-ssr-a 42 vs 7` — 31 août 2026 contre `packages/nexil/src/core/state.ts:1444`, `client/index.ts:1363`, `reactivity.ts:323`._
