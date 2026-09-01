import { component, state, batch } from '@nexil/core'
import { useCounterStore } from '$stores/counter'
import { useCartStore } from '$stores/cart'
import { useUserStore } from '$stores/user'

export const seo = {
  title: 'Stores Playground — Nexil Demo',
  description: 'Unified, modular, and array-proxy stores with batch and lens.',
}

export default component(() => {
  const counter = useCounterStore()
  const cart = useCartStore()
  const user = useUserStore()
  const local = state(0)

  return (
    <div class="space-y-8">
      <header>
        <h1 class="text-3xl font-black tracking-tight text-white">Stores Playground</h1>
        <p class="mt-2 text-slate-400">
          Three styles, one engine: `defineStore` (unified), `createStore` (modular), and proxy
          arrays.
        </p>
      </header>

      {/* Unified counter */}
      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">Unified · `src/stores/counter.ts`</h2>
        <pre class="mt-2 overflow-auto rounded bg-slate-950 p-3 text-xs text-cyan-300">
          defineStore('counter', {'{'} state, getters, actions {'}'})
        </pre>
        <div class="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span class="text-slate-300">
            count{' '}
            <b class="text-white" bindText$={counter.count}>
              {String(counter.count)}
            </b>{' '}
            · doubled{' '}
            <b class="text-cyan-400" bindText$={counter.doubled}>
              {String(counter.doubled)}
            </b>{' '}
            · isEven <b>{String(counter.isEven)}</b>
          </span>
          <button
            class="rounded bg-cyan-400 px-3 py-1 text-xs font-bold text-slate-950"
            onClick$={() => counter.inc()}
          >
            inc
          </button>
          <button
            class="rounded bg-slate-800 px-3 py-1 text-xs text-white"
            onClick$={() => counter.dec()}
          >
            dec
          </button>
          <button
            class="rounded bg-slate-800 px-3 py-1 text-xs text-white"
            onClick$={() =>
              batch(() => {
                counter.inc()
                counter.inc()
              })
            }
          >
            batch +2
          </button>
        </div>
        <p class="mt-2 text-xs text-slate-500">
          Direct `counter.count = 5` also works (proxy + `isSerializable` guard).
        </p>
      </section>

      {/* Modular user */}
      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">Modular · `src/stores/user/`</h2>
        <pre class="mt-2 overflow-auto rounded bg-slate-950 p-3 text-xs text-cyan-300">
          store.ts + types.ts + actions.ts → createStore({'{'}id:'user'{'}'})
        </pre>
        <div class="mt-4 space-y-3 text-sm">
          <p class="text-slate-300">
            {user.profile ? `${user.profile.name} <${user.profile.email}>` : 'Guest'} · count{' '}
            <span bindText$={user.count}>{String(user.count)}</span>
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              class="rounded bg-white px-3 py-1 text-xs font-bold text-slate-900"
              onClick$={() => user.increment()}
            >
              increment
            </button>
            <button
              class="rounded bg-slate-800 px-3 py-1 text-xs text-white"
              onClick$={() =>
                user.setProfile({ name: 'Noor', email: 'noor@nexil.dev', role: 'user' })
              }
            >
              become Noor
            </button>
            <button
              class="rounded bg-slate-800 px-3 py-1 text-xs text-white"
              onClick$={() => user.toggleTheme()}
            >
              toggle theme ({user.theme})
            </button>
            <button
              class="rounded bg-slate-800 px-3 py-1 text-xs text-white"
              onClick$={() => {
                if (user.profile) user.profile.name = 'Ali'
              }}
            >
              proxy: name = Ali
            </button>
          </div>
          <p class="text-xs text-slate-500">
            Nested `user.profile.name` is a transitive proxy — no manual spread.
          </p>
        </div>
      </section>

      {/* Cart array proxy */}
      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">Array Proxy · Cart</h2>
        <p class="mt-1 text-sm text-slate-400">
          `push`/`splice` etc. are wrapped → `batch` + `setAtPath`.
        </p>
        <p class="mt-3 text-sm text-slate-300">
          total <b bindText$={cart.totalItems}>{String(cart.totalItems)}</b> · ${' '}
          <b class="text-cyan-400" bindText$={cart.totalPrice}>
            {String(cart.totalPrice)}
          </b>
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            class="rounded bg-cyan-500 px-3 py-1 text-xs font-bold text-slate-950"
            onClick$={() => cart.addItem({ id: 'x1', name: 'Demo Item', price: 10 })}
          >
            add Demo (10)
          </button>
          <button
            class="rounded bg-slate-800 px-3 py-1 text-xs text-white"
            onClick$={() => cart.items.push({ id: 'x2', name: 'Via push', price: 5, quantity: 1 })}
          >
            via push
          </button>
          <button
            class="rounded bg-slate-800 px-3 py-1 text-xs text-white"
            onClick$={() => cart.clear()}
          >
            clear
          </button>
        </div>
        <p class="mt-3 text-xs text-slate-500">
          Try `cart.items[0].quantity++` — proxy handles indices.
        </p>
      </section>

      {/* Lens / Select */}
      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">Lens & Select</h2>
        <p class="mt-2 text-sm text-slate-400">
          <code>counter.lens('count')</code> is a writable Signal focus;{' '}
          <code>counter.select(s =&gt; s.count)</code> is a computed.
        </p>
        <div class="mt-3 flex gap-2">
          <button
            class="rounded bg-white px-3 py-1 text-xs font-bold text-slate-900"
            onClick$={() => {
              const lens = counter.lens('count')
              lens.set((v: number) => v + 5)
            }}
          >
            lens +5
          </button>
          <span class="text-xs text-slate-500">
            local: {local()} · lens demo increments counter by 5 via `lens.set`
          </span>
        </div>
      </section>
    </div>
  )
})
