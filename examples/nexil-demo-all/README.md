# Nexil Demo — All Features Live

> **Scaffold:** `pnpm create nexil nexil-demo-all --yes --ts --template fullstack --tailwind`  
> **Stack:** `@nexil/core` `0.2.5` + `@nexil/vite-plugin` + `@nexil/cli` + `vite` `7` + `tailwind` `4` + `pnpm` `10`  
> **Location:** `examples/nexil-demo-all` (workspace) + `../nexil-demo-all` (standalone via `pnpm create`)

This demo implements **every** Nexil feature practically and completely — not stubs.

## Run

```bash
# from framework root
pnpm install
pnpm --filter nexil-demo-all dev      # http://localhost:5173
pnpm --filter nexil-demo-all build    # Nexil build completed.
pnpm --filter nexil-demo-all typecheck
pnpm --filter nexil-demo-all check    # budget

# standalone (outside monorepo, as created via pnpm create)
cd ../nexil-demo-all
pnpm install
pnpm dev
pnpm build && pnpm start
```

## Routes (file-based, `src/routes/`)

| Route | File | Feature |
|-------|------|---------|
| `/` | `index.tsx` | `state`, `computed`, `batch`, `For`/`Show`, `useCounterStore`/`useCartStore`/`useUserStore`, `ThemeStore` StoreContext, `Link`, `onClick$` resumability |
| `/about` | `about.tsx` | Static SSR, SEO `export const seo` |
| `/stores` | `stores.tsx` | Unified `defineStore` + modular `createStore` + array proxy `push`/`splice` + `lens`/`select` |
| `/context` | `context.tsx` | `createContext` (value) + `defineStoreContext` hierarchical (nearest-wins, `Provider` nesting, explicit `scope`) |
| `/shop` | `shop.tsx` | `For`, `Link`, cart `addItem` via store proxy |
| `/shop/[id]` | `shop/[id].tsx` | Dynamic `routeLoader$` per-request, `Link` back |
| `/cart` | `cart.tsx` | Global `cart` store survives `Link` via `__NEXIL_STORES__`, `data-nx-store-bind="cart:totalItems#text"` O(1) |
| `/forms` | `forms.tsx` | `Form` + `SubmitButton` + `action` (`src/actions/newsletter.ts`) progressive, `bindValue$` |
| `/media` | `media.tsx` | Tailwind, `sharp` image pipeline, SEO |
| `/labs` | `labs.tsx` | `resource`, `effect`, `watch`, `batch` coalesce, `For`/`Show` |

Layout `src/routes/_layout.tsx` uses `element` + `Link` + `Slot` with sticky header and 8 nav links.

## Stores (`src/stores/`)

| Store | File | API | State | Getters | Actions |
|-------|------|-----|-------|---------|---------|
| `counter` | `counter.ts` | `defineStore('counter')` unified | `count: number` | `doubled`, `isEven` | `inc`/`dec`/`setCount`/`reset` (`this`) |
| `cart` | `cart.ts` | `defineStore('cart')` unified | `items: CartItem[]`, `coupon` | `totalItems`, `totalPrice`, `hasItems` | `addItem`/`removeItem`/`incQty`/`decQty`/`clear`/`applyCoupon` (proxy array) |
| `user` | `user/` | `createStore({id:'user'})` modular | `count`, `profile`, `isAuthenticated`, `theme` | — | `setProfile`/`logout`/`toggleTheme`/`increment` (draft `state`) |
| `theme` | `theme.ts` | `defineStoreContext('theme')` hierarchical | `mode`, `accent` | `isDark` | `toggle`/`setMode`/`setAccent` — `Provider`/`use`/`create` |

Discovery: `src/stores/*` → `discoverStores` → `virtual:nexil-stores` + `$stores/*` + `.nexil/stores.d.ts`.

Scaffold: `nexil g store counter --unified`, `nexil g store user --split`, `nexil g store theme --scoped`.

## State Primitives

```ts
import { state, computed, batch, effect, resource, For, Show } from '@nexil/core'
const count = state(0)
const doubled = computed(() => count() * 2)
batch(() => { count.set(10); theme.set('dark') }) // 1 flush
effect(() => { logs.set([...logs(), `count=${count()}`]) })
const user = resource(async () => fetch('/api/user').then(r=>r.json()))
<For each={['A','B']}>{(x:string)=> <div>{x}</div>}</For>
<Show when={count() > 3} fallback={<p>≤3</p>}><p>>3</p></Show>
```

## Context

```ts
import { createContext } from '@nexil/core'
const Ctx = createContext<string>('default', 'demo:simple')
Ctx.Provider({ value: 'outer', children: () => Ctx.use() }) // 'outer'
Ctx.Provider({ value: 'outer', children: () => Ctx.Provider({ value: 'inner', children: () => Ctx.use() }) }) // inner shadow

import { ThemeStore } from '$stores/theme'
const custom = ThemeStore.create({ mode: 'dark' })
ThemeStore.Provider({ value: custom, children: () => ThemeStore.use().mode }) // 'dark'
```

## Resumability (`$`)

```tsx
<button onClick$={({ element }) => { element.textContent = 'Woke! ' + new Date().toLocaleTimeString() }}>
  Click to wake (resumable)
</button>
```

Compiles to `data-nx-scope` + lazy chunk `/nexil-chunks/chunk_*.js` loaded on demand. No JS before click.

Store bindings: `bindText$={cart.totalItems}` → `data-nx-store-bind="cart:totalItems#text"` O(1) via `getStorePathSignal` + `__NEXIL_STORES__` hydration.

## Actions & Forms (`src/actions/newsletter.ts`)

```ts
import { action } from 'nexil/server' // actually '@nexil/core/server' via alias
export const newsletter = action({
  validate: (input) => {
    const email = String((input as any).email ?? '').trim()
    if (!email.includes('@')) throw new Error('Valid email required')
    return { email }
  },
  async handle(_event, { email }) {
    await new Promise(r=>setTimeout(r,200))
    return { ok: true, email }
  },
})
```

Usage `forms.tsx`: `<Form action={newsletter}><input name="email" bindValue$={email} /><SubmitButton>Subscribe</SubmitButton></Form>` — progressive: without JS POSTs, with JS `enhanceForms()` intercepts.

## Media, CSS, SEO

- `src/styles.css` → `@import "tailwindcss"` + `vite.config.ts` `tailwindcss()`
- `public/` images → `sharp` emits WebP/AVIF (`nexil build` + `benchmarks/build-media.mjs`)
- SEO per route: `export const seo = { title, description, canonical, image }` → `renderHead`

## Build & Check

```bash
pnpm --filter nexil-demo-all build      # Nexil build completed.
pnpm --filter nexil-demo-all typecheck  # tsc --noEmit (paths $stores/* via tsconfig)
pnpm --filter nexil-demo-all check      # budget
```

Build output: `dist/client/index.html` contains `<script type="nexil/state" id="__NEXIL_STORES__">`, `data-nx-store-bind`, `data-nx-scope`, lazy chunks in `dist/client/nexil-chunks/`.

## Verification

- `pnpm --filter nexil-demo-all build` ✅
- `pnpm test` (framework) 41/41 332/332 ✅
- `pnpm test:e2e` (framework) 33/33 ✅ (including `stores-level2` `cart:doubled` 8)
- Practical `node --input-type=module` 30 assertions ✅ (signals, stores, StoreContext nested, ALS isolated)

## Next

- `pnpm --filter nexil-demo-all dev` → edit `src/routes/index.tsx` to see HMR shape-preserving (`mergeStateForHMR`)
- Try `Link` navigation `/` → `/shop` → `/cart` — cart survives (global), theme fallback vs Provider
- Inspect `http://localhost:5173/` HTML for `__NEXIL_STORES__` and `data-nx-store-bind`
