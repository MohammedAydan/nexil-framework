import { component } from '@nexil/core'
import { Link } from '@nexil/core/router'
import { useCartStore } from '$stores/cart'

export const seo = {
  title: 'Shop — Nexil Demo',
  description: 'File-based routing with For, Link, and cart store.',
}

const products = [
  { id: '1', name: 'Nexil Tee', price: 29, desc: 'Soft cotton, zero-hydration print' },
  { id: '2', name: 'Resumable Cap', price: 19, desc: 'Wakes only when you click' },
  { id: '3', name: 'Signal Hoodie', price: 59, desc: 'Fine-grained warmth' },
  { id: '42', name: 'Sample Item #42', price: 42, desc: 'Demo product for [id] route' },
]

export default component(() => {
  const cart = useCartStore()
  return (
    <div class="space-y-8">
      <header>
        <h1 class="text-3xl font-black tracking-tight text-white">Shop</h1>
        <p class="mt-2 text-slate-400">
          `src/routes/shop.tsx` + `shop/[id].tsx` — file-based, `routeLoader$` for data.
        </p>
        <p class="mt-2 text-sm text-slate-300">
          Cart: <b bindText$={cart.totalItems}>{String(cart.totalItems)}</b> items · $
          <b class="text-cyan-400" bindText$={cart.totalPrice}>
            {String(cart.totalPrice)}
          </b>
        </p>
      </header>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <div key={p.id} class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h3 class="font-bold text-white">{p.name}</h3>
            <p class="text-sm text-slate-400">{p.desc}</p>
            <p class="mt-2 text-lg font-black text-cyan-400">${p.price}</p>
            <div class="mt-4 flex gap-2">
              <button
                class="flex-1 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400"
                onClick$={() => cart.addItem(p)}
              >
                Add to cart
              </button>
              <Link
                href={`/shop/${p.id}`}
                class="rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:border-cyan-400"
              >
                View
              </Link>
            </div>
          </div>
        ))}
      </div>

      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">Routing</h2>
        <pre class="mt-2 overflow-auto rounded bg-slate-950 p-3 text-xs text-cyan-300">
          src/routes/shop.tsx → /shop src/routes/shop/[id].tsx → /shop/:id (routeLoader$)
          src/routes/_layout.tsx → shared header + Slot()
        </pre>
        <p class="mt-2 text-xs text-slate-500">
          Try{' '}
          <Link href="/shop/42" class="underline">
            /shop/42
          </Link>{' '}
          or{' '}
          <Link href="/shop/1" class="underline">
            /shop/1
          </Link>{' '}
          — `Link` swaps outlet without full reload.
        </p>
      </section>
    </div>
  )
})
