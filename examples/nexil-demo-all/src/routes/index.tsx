import { component, state, computed, batch, For, Show } from '@nexil/core'
import { Link } from '@nexil/core/router'
import { useCounterStore } from '$stores/counter'
import { useCartStore } from '$stores/cart'
import { useUserStore } from '$stores/user'
import { ThemeStore } from '$stores/theme'

export const seo = {
  title: 'Nexil Demo — All Features Live',
  description: 'Comprehensive demo of Nexil framework: signals, stores, StoreContext, context, resumability, routing, forms, media, and more.',
}

export default component(() => {
  // Local signals
  const localCount = state(0)
  const doubledLocal = computed(() => localCount() * 2)
  const theme = state<'light' | 'dark'>('light')

  // Global stores
  const counter = useCounterStore()
  const cart = useCartStore()
  const user = useUserStore()

  // Theme StoreContext (hierarchical) — fallback global
  const themeCtx = ThemeStore.use()
  const isDark = computed(() => themeCtx.mode === 'dark')

  const products = [
    { id: 'p1', name: 'Nexil Tee', price: 29 },
    { id: 'p2', name: 'Resumable Cap', price: 19 },
    { id: 'p3', name: 'Signal Hoodie', price: 59 },
  ]

  return (
    <div class="space-y-12">
      {/* Hero */}
      <section class="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-8 shadow-2xl">
        <p class="text-xs font-bold uppercase tracking-[0.3em] text-cyan-400">NEXIL · HTML-FIRST</p>
        <h1 class="mt-3 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">
          Ship HTML. <span class="text-cyan-400">Wake only the button.</span>
        </h1>
        <p class="mt-4 max-w-2xl text-slate-300">
          This demo implements <strong>every</strong> Nexil feature practically: signals, stores (unified/modular/context), context, resumability, routing, forms, media, SEO, and zero-hydration. Inspect the HTML — no JS before you click.
        </p>
        <div class="mt-6 flex flex-wrap gap-3">
          <Link href="/stores" class="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300">
            Explore Stores →
          </Link>
          <Link href="/shop" class="rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-200 hover:border-cyan-400">
            Go to Shop
          </Link>
          <span class="rounded-xl bg-slate-800 px-4 py-3 text-sm text-slate-400">Build: <code>pnpm build && pnpm start</code></span>
        </div>
      </section>

      {/* Local Signals */}
      <section class="grid gap-6 lg:grid-cols-2">
        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 class="text-lg font-bold text-white">Local Signals · Fine-Grained</h2>
          <p class="mt-1 text-sm text-slate-400">O(1) DOM updates, no VDOM. Try the buttons — only the text node changes.</p>
          <div class="mt-4 flex items-center gap-4">
            <button
              class="rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-200"
              onClick$={() => localCount.set((v) => v + 1)}
            >
              Local: {localCount()}
            </button>
            <span class="text-sm text-slate-300">
              doubled = <strong bindText$={doubledLocal} class="text-cyan-400">{String(doubledLocal())}</strong>
            </span>
            <button
              class="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300"
              onClick$={() =>
                batch(() => {
                  localCount.set(10)
                  theme.set('dark')
                })
              }
            >
              batch → 10 + dark
            </button>
          </div>
          <p class="mt-3 text-xs text-slate-500">theme: {theme()} · try batch to coalesce two sets into one flush</p>
        </div>

        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 class="text-lg font-bold text-white">Global Store · defineStore</h2>
          <p class="mt-1 text-sm text-slate-400">Singleton `src/stores/counter.ts` with `state`, `getters`, `actions`.</p>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <span class="text-sm text-slate-300">
              count: <strong class="text-white" bindText$={counter.count}>{String(counter.count)}</strong> · doubled:{' '}
              <strong class="text-cyan-400" bindText$={counter.doubled}>{String(counter.doubled)}</strong>
            </span>
            <button class="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950" onClick$={() => counter.inc()}>
              inc
            </button>
            <button class="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white" onClick$={() => counter.dec()}>
              dec
            </button>
            <button class="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white" onClick$={() => counter.reset()}>
              reset
            </button>
          </div>
          <p class="mt-2 text-xs text-slate-500">Survives Link navigation via `__NEXIL_STORES__` · isEven: {String(counter.isEven)}</p>
        </div>
      </section>

      {/* Modular + Cart */}
      <section class="grid gap-6 lg:grid-cols-2">
        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 class="text-lg font-bold text-white">Modular Store · createStore</h2>
          <p class="mt-1 text-sm text-slate-400">`src/stores/user/` split: `types.ts` + `actions.ts` + `store.ts`</p>
          <div class="mt-3 space-y-2 text-sm">
            <p class="text-slate-300">
              User: <strong class="text-white">{user.profile?.name ?? '—'}</strong> ({user.profile?.email}) · count:{' '}
              <span bindText$={user.count}>{String(user.count)}</span>
            </p>
            <div class="flex gap-2">
              <button class="rounded bg-white px-3 py-1 text-xs font-bold text-slate-900" onClick$={() => user.increment()}>
                +count
              </button>
              <button class="rounded bg-slate-800 px-3 py-1 text-xs text-white" onClick$={() => user.setProfile({ name: 'Eve', email: 'eve@nexil.dev', role: 'user' })}>
                set Eve
              </button>
              <button class="rounded bg-slate-800 px-3 py-1 text-xs text-white" onClick$={() => user.logout()}>
                logout
              </button>
            </div>
            <Show when={user.isAuthenticated}>
              <p class="text-xs text-emerald-400">✓ authenticated as {user.profile?.role}</p>
            </Show>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 class="text-lg font-bold text-white">Cart Store · Array Proxy</h2>
          <p class="mt-1 text-sm text-slate-400">`push`/`splice` are proxied → structural sharing + O(1) DOM.</p>
          <p class="mt-2 text-sm text-slate-300">
            Items: <span class="font-bold text-white" bindText$={cart.totalItems}>{String(cart.totalItems)}</span> · Total: $
            <span class="font-bold text-cyan-400" bindText$={cart.totalPrice}>{String(cart.totalPrice)}</span>
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            {products.map((p) => (
              <button key={p.id} class="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950" onClick$={() => cart.addItem(p)}>
                + {p.name}
              </button>
            ))}
            <button class="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white" onClick$={() => cart.clear()}>
              clear
            </button>
          </div>
          <div class="mt-3">
            <For each={cart.items}>
              {(item: any) => (
                <div class="flex items-center justify-between rounded bg-slate-800 px-3 py-2 text-xs">
                  <span>{item.name} × {item.quantity}</span>
                  <span>${item.price * item.quantity}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </section>

      {/* Theme StoreContext + Context */}
      <section class="grid gap-6 lg:grid-cols-2">
        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 class="text-lg font-bold text-white">StoreContext · defineStoreContext</h2>
          <p class="mt-1 text-sm text-slate-400">Hierarchical like React `createContext` — nearest Provider wins.</p>
          <p class="mt-3 text-sm text-slate-300">
            Mode: <strong class={isDark() ? 'text-violet-400' : 'text-amber-400'}>{themeCtx.mode}</strong> · accent:{' '}
            {themeCtx.accent}
          </p>
          <div class="mt-3 flex gap-2">
            <button class="rounded bg-white px-3 py-1 text-xs font-bold text-slate-900" onClick$={() => themeCtx.toggle()}>
              toggle
            </button>
            <button class="rounded bg-slate-800 px-3 py-1 text-xs text-white" onClick$={() => ThemeStore.create({ mode: 'dark' })}>
              create isolated (demo)
            </button>
          </div>
          <p class="mt-2 text-xs text-slate-500">Try <Link href="/context" class="underline">/context</Link> for nested Providers demo.</p>
        </div>

        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 class="text-lg font-bold text-white">Resumability · onClick$</h2>
          <p class="mt-1 text-sm text-slate-400">No JS until first interaction. Check `data-nx-scope` in HTML.</p>
          <button
            class="mt-3 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-3 text-sm font-black text-white shadow-lg"
            onClick$={({ element }) => {
              element.textContent = 'Woke! ' + new Date().toLocaleTimeString()
              element.classList.add('ring-2', 'ring-white')
            }}
          >
            Click to wake (resumable)
          </button>
          <p class="mt-2 text-xs text-slate-500">This handler is a lazy chunk `/nexil-chunks/chunk_*.js` loaded on demand.</p>
        </div>
      </section>

      {/* Shop preview */}
      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="text-lg font-bold text-white">Shop Preview · For + Link + routeLoader$</h2>
        <div class="mt-4 grid gap-4 sm:grid-cols-3">
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/shop/${p.id}`}
              class="rounded-xl border border-slate-700 bg-slate-800 p-4 hover:border-cyan-400 hover:bg-slate-700"
            >
              <p class="font-bold text-white">{p.name}</p>
              <p class="text-sm text-cyan-400">${p.price}</p>
              <p class="mt-2 text-xs text-slate-400">View →</p>
            </Link>
          ))}
        </div>
        <p class="mt-4 text-xs text-slate-500">
          Dynamic route `shop/[id].tsx` uses `routeLoader$` for per-request data. Try <Link href="/shop/p2" class="underline">/shop/p2</Link>.
        </p>
      </section>

      {/* Footer links */}
      <section class="flex flex-wrap gap-2">
        {[
          { href: '/stores', label: 'Stores Playground' },
          { href: '/forms', label: 'Forms & Actions' },
          { href: '/media', label: 'Media & Images' },
          { href: '/labs', label: 'Labs (resource/effect)' },
          { href: '/about', label: 'About' },
        ].map((l) => (
          <Link key={l.href} href={l.href} class="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
            {l.label}
          </Link>
        ))}
      </section>
    </div>
  )
})
