# Plan: Refonte defineStore → createContext-like (Hybride)

## Goal

Rendre `defineStore` fonctionnel comme `createContext` React tout en préservant la compatibilité Pinia/nanostores existante. Approche hybride additive : `defineStore` global reste, nouveau `defineStoreContext` hierarchical DI à la React/Qwik.

## Acceptance Criteria (testables)

- [ ] `const Cart = defineStoreContext('cart', {state, getters, actions})` retourne `StoreContext<StoreInstance>` avec `.Provider`, `.use()`, `.useContext()`, `.create()`
- [ ] `Cart.Provider({value: Cart.create({count:1}), children: ()=> Cart.use().count})` → `1`, provider imbriqué shadow `2`, hors provider fallback `defaultValue`
- [ ] Isolation ALS : `runWithScope(ctxA, ()=> Cart.use().count=1)` vs `ctxB count=2` concurrent, pas de fuite (Node + explicit stack edge)
- [ ] SSR `__NEXIL_STORES__` per-scope snapshot only accessed stores, `hydrate` avant `bootstrapResumability`
- [ ] `data-nx-store-bind="cart:count#text"` ET `data-nx-scope` ctx générique (plus de hardcodage `cart:doubled`)
- [ ] HMR shallow preserve live `Signal`
- [ ] `pnpm build && tsc -b && pnpm test (40 files) && e2e stores* 6/6` green
- [ ] `defineStore('cart', ...)` legacy inchangé (global singleton) — non-breaking

## Approach

1. **Core** `packages/nexil/src/core/state.ts` : ajouter `StoreContext` type + `defineStoreContext` qui wrap `createProxiedStore` + `createContext` interne stableId. Réutilise `ContextScope`/`getActiveScope`/`provideContext`/`runWithScope` de `packages/nexil/src/core/index.ts:95-370`. Génériciser pending getter (supprimer if cart:doubled).
2. **Vite** `packages/vite-plugin/src/stores.ts` + `index.ts` : `discoverStores` garde collision, `virtual:nexil-stores` exporte Contexts, `classifyScopeCaptures` étend détection `Cart.use()` → `kind:'ctx'` avec `data-nx-scope`.
3. **Client** `packages/nexil/src/client/index.ts` + `vite-plugin/src/bootstrap.ts`/`external-bindings.ts` : `bindStorePathBindings` générique getters via `__nexil_getterSignals`, `materializeScope` ctx.
4. **SSR** : `__snapshotAccessedStores` déjà per-scope `state.ts:186`; ajouter `__snapshotContextStores` helper si besoin, injection dans `cli`/`dev-server` déjà via `runWithScope`.
5. **CLI** : `nexil g store --scoped` template `defineStoreContext`.
6. **Tests** : `context-store.test.ts` + e2e `stores-context.spec.ts`.

## Scope

**IN:** API `defineStoreContext`, typage `StoreContext<T,G,A>`, pending générique, Vite ctx capture, CLI --scoped, docs, tests.
**OUT:** Suppression `defineStore` global, DevTools timeline, deep HMR merge, persistence plugin, suppression `Context.Provider` sync constraint (gardé, doc).

## Dependencies

- `@nexil/core` déjà (ALS, Context, serializable)
- `@babel/parser` + `magic-string` déjà vite-plugin

## Complexity: L

## Inspiration

- **Qwik** `createContextId`+`useContextProvider` stableId+Signal value + container serialization → appliqué stableId + valeur StoreInstance fine-grained
- **Astro/nanostores** `atom` flat global → justifie mode global par défaut
