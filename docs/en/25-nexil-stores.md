# 25 — Nexil Stores: The State Management System

Nexil Stores is the official reactive state management system designed specifically for the Nexil framework. It bridges fine-grained signal reactivity with zero-hydration client resumability and multi-tenant SSR request isolation.

---

## 1. Core Principles

Nexil Stores is engineered around four non-negotiable architectural principles:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Nexil Stores Core                             │
├──────────────────────────┬──────────────────────────────────────────────┤
│ 1. Fine-Grained Signals  │ O(1) DOM updates via Signal lenses & proxies │
│ 2. Zero-Hydration        │ Materializes state only on first interaction │
│ 3. Strict Serializability│ Enforces JSON-only state across boundaries   │
│ 4. SSR Request Isolation │ AsyncLocalStorage & Edge Explicit Scopes     │
└──────────────────────────┴──────────────────────────────────────────────┘
```

1. **Fine-Grained Signals**: Backed by `@nexil/reactivity`. Changing a state property updates only the subscribed DOM text or attribute node without re-running the component function or diffing a virtual DOM.
2. **Zero-Hydration Resumability**: On initial page load, no component code or store JavaScript is loaded or executed. State accessed during SSR is embedded as a JSON snapshot in the HTML. DOM bindings link directly to pending reactive signals, and store logic is loaded on-demand when an event handler fires.
3. **Strict JSON-Serializability**: All store data must be pure JSON-serializable primitives, plain objects, or arrays. Functions, class instances, circular references, and non-serializable prototypes are rejected by `isSerializable`.
4. **Complete SSR Request Isolation**: Store instances are scoped per-request during server-side rendering, preventing state leakage across concurrent requests in Node.js, Cloudflare Workers, and Deno.

---

## 2. Store Styles: `defineStore` vs `createStore`

Nexil Stores supports two complementary authoring styles:

### A. Unified Stores (`defineStore`)

Unified stores keep state, computed getters, and actions in a single file. Actions use `this` to mutate state drafts or access getters.

```ts
// src/stores/cart.ts
import { defineStore } from '@nexil/state'

export interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
}

export interface CartState {
  items: CartItem[]
}

export const useCartStore = defineStore('cart', {
  state: (): CartState => ({
    items: [],
  }),
  getters: {
    totalItems: (state) => state.items.reduce((sum, item) => sum + item.quantity, 0),
    totalPrice(state) {
      return state.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    },
  },
  actions: {
    addItem(item: Omit<CartItem, 'quantity'>) {
      const existing = this.items.find((i) => i.id === item.id)
      if (existing) {
        existing.quantity += 1
      } else {
        this.items.push({ ...item, quantity: 1 })
      }
    },
    removeItem(id: string) {
      const index = this.items.findIndex((i) => i.id === id)
      if (index >= 0) {
        this.items.splice(index, 1)
      }
    },
    clear() {
      this.items = []
    },
  },
})
```

### B. Modular Stores (`createStore`)

Modular stores separate types, action reducers, and the store definition across distinct files in a dedicated directory.

```
src/stores/user/
├── types.ts    # State interfaces
├── actions.ts  # Exported action functions
└── store.ts    # Store instantiation via createStore
```

```ts
// src/stores/user/types.ts
export interface UserProfile {
  name: string
  email: string
}

export interface UserState {
  count: number
  profile: UserProfile
}
```

```ts
// src/stores/user/actions.ts
import type { UserState } from './types'

export const userActions = {
  setCount(state: UserState, count: number): void {
    state.count = count
  },
  updateProfile(state: UserState, profile: Partial<UserProfile>): void {
    Object.assign(state.profile, profile)
  },
}
```

```ts
// src/stores/user/store.ts
import { createStore } from '@nexil/state'
import type { UserState } from './types'
import { userActions } from './actions'

const initialState: UserState = {
  count: 0,
  profile: { name: 'Anonymous', email: '' },
}

export const useUserStore = createStore({
  id: 'user',
  state: () => initialState,
  actions: userActions,
})
```

---

## 3. Directory Conventions & Store Discovery

Nexil's Vite plugin automatically discovers stores placed inside `src/stores/`:

```
src/stores/
├── cart.ts                → Store ID: "cart" (Unified file)
├── settings/
│   └── index.ts          → Store ID: "settings" (Unified folder)
├── user/
│   ├── types.ts
│   ├── actions.ts
│   └── store.ts          → Store ID: "user" (Modular store)
└── admin/
    └── telemetry.ts      → Store ID: "admin/telemetry" (Nested ID)
```

### Collision Rules

1. **Modular Wins**: If both `src/stores/user/store.ts` and `src/stores/user.ts` exist, the modular `store.ts` takes precedence and a build warning is emitted.
2. **Helper Files Ignored**: Files named `types.ts` and `actions.ts` are recognized as modular store dependencies and are not registered as standalone stores.

---

## 4. CLI Scaffolding (`nexil g store`)

The Nexil CLI provides built-in generators to scaffold stores following official conventions:

```bash
# Generate a unified store (src/stores/cart.ts)
nexil g store cart --unified

# Generate a modular store (src/stores/user/{types.ts, actions.ts, store.ts})
nexil g store user --split

# Generate a nested store (src/stores/admin/analytics.ts)
nexil g store admin/analytics --unified
```

Alias: `nexil generate store <name>` or `nexil g store <name>`.

---

## 5. Path Aliases: How `$stores/*` Works

When you configure `@nexil/vite-plugin`, it provides virtual module resolution and TypeScript types:

1. **Virtual Barrel**: `import { useCartStore } from 'virtual:nexil-stores'` imports all discovered stores.
2. **Path Aliases**: `import { useCartStore } from '$stores/cart'` or `import { useUserStore } from '$stores/user'` imports the specific store module directly.
3. **Type Declaration**: On server start or build, Vite automatically writes `.nexil/stores.d.ts`, ensuring instant autocompletion and type validation.

---

## 6. How SSR, `__NEXIL_STORES__`, and Zero-Hydration Work

```
  Server Render (SSR)                 Browser Initial Load             First User Click
 ─────────────────────               ──────────────────────           ───────────────────
  1. Component reads store            1. HTML received with text       1. onClick$ fires
  2. Store marked as accessed         2. <script id="__NEXIL_STORES__"> 2. Store chunk loads
  3. JSON snapshot emitted:              parsed by bootstrap           3. Signals linked
     <script type="nexil/state"       3. data-nx-store-bind            4. Action executes
      id="__NEXIL_STORES__">             connected to signals             atomically
     {"user":{"count":5}}             4. ZERO JS executed
```

1. **SSR Recording**: During server rendering, any store accessed by a component is recorded in the active request's access log.
2. **Script Injection**: The server serializes only the accessed stores into `<script type="nexil/state" id="__NEXIL_STORES__">`. All `<` characters are escaped as `\u003c` to eliminate XSS vulnerabilities.
3. **Direct DOM Bindings**: HTML elements with `{store.count}` or `bindText$={store.count}` receive a `data-nx-store-bind="storeId:path#target"` attribute.
4. **Client Bootstrap**: The client bootstrap script parses the JSON tag into memory. DOM nodes subscribe to pending signals immediately.
5. **Zero Hydration**: No component functions are executed on load. When a user clicks an interactive button, the handler chunk imports the store, links pending signals to the live store instance, and applies updates seamlessly.

---

## 7. Edge Runtime Support (Cloudflare Workers & Deno)

In Node.js, request isolation is handled automatically via `AsyncLocalStorage`. In serverless edge environments where ALS may not be globally enabled, `@nexil/core` provides an explicit scope stack:

```ts
// Cloudflare Workers fetch handler
import { createRequestContext, runWithScope } from '@nexil/core'
import { __getStoresScriptTag, __clearAccessedStoreIds } from '@nexil/state'

export default {
  async fetch(request: Request): Promise<Response> {
    const ctx = createRequestContext(request)
    return runWithScope(ctx.scope, async () => {
      const html = renderApp(ctx)
      const storeScript = __getStoresScriptTag() ?? ''
      __clearAccessedStoreIds()

      return new Response(html + storeScript, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    })
  },
}
```

By wrapping the request lifetime in `runWithScope(ctx.scope, ...)`, concurrent asynchronous requests remain completely isolated with zero state leaks.

---

## 8. Current Capabilities & Limitations

### Capabilities

- Transparent structural sharing via deep Proxies.
- Array mutation methods (`push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`) trigger reactive flushes without manual spreading.
- AST-level batch wrapping for actions.
- Automatic fine-grained DOM bindings via `data-nx-store-bind`.
- Shape-preserving HMR during development.

### Honest Limitations

1. **Direct Sequential Mutations Outside Actions**:
   Mutating `store.a = 1; store.b = 2;` outside an action triggers two synchronous notification ticks. Use actions or wrap sequential writes in `batch(() => { ... })`.
2. **HMR Deep Merge**:
   Development schema changes are merged at the top-level. Adding a new property inside a deeply nested object will replace the nested object rather than deep-merging during HMR.
3. **Reserved State Keys**:
   State properties named `value`, `snapshot`, `set`, `setPath`, `lens`, `select`, `subscribe`, `dispose`, or `scope` shadow the Store API methods and emit a development warning. Use distinct domain property names (e.g. `count`, `currentValue`).
