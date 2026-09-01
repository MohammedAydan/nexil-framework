import { component } from '@nexil/core'
import { Link } from '@nexil/core/router'
import { routeLoader$ } from '@nexil/core/server'
import { useCartStore } from '$stores/cart'

export const seo = {
  title: 'Product — Nexil Demo',
  description: 'Dynamic route with routeLoader$.',
}

export const useProduct = routeLoader$(async (event) => {
  const id = event.params.id as string
  const catalog: Record<string, { name: string; price: number; desc: string }> = {
    '1': { name: 'Nexil Tee', price: 29, desc: 'Soft cotton, zero-hydration print' },
    '2': { name: 'Resumable Cap', price: 19, desc: 'Wakes only when you click' },
    '3': { name: 'Signal Hoodie', price: 59, desc: 'Fine-grained warmth' },
    '42': { name: 'Sample Item #42', price: 42, desc: 'Demo product for [id] route' },
  }
  const product = catalog[id] ?? {
    name: `Item #${id}`,
    price: 9,
    desc: 'Unknown item — still resumable',
  }
  return { id, ...product }
})

export default component(
  ({ data }: { data?: { id: string; name: string; price: number; desc: string } }) => {
    const cart = useCartStore()
    if (!data) return <p class="text-slate-400">Loading…</p>
    return (
      <div class="space-y-6">
        <Link href="/shop" class="text-sm text-cyan-400 hover:underline">
          ← Back to shop
        </Link>
        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p class="text-xs font-bold uppercase tracking-[0.3em] text-cyan-400">
            PRODUCT #{data.id}
          </p>
          <h1 class="mt-2 text-3xl font-black tracking-tight text-white">{data.name}</h1>
          <p class="mt-2 text-slate-400">{data.desc}</p>
          <p class="mt-4 text-2xl font-black text-cyan-400">${data.price}</p>
          <div class="mt-6 flex gap-3">
            <button
              class="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-400"
              onClick$={() => cart.addItem({ id: data.id, name: data.name, price: data.price })}
            >
              Add to cart — $<span bindText$={cart.totalPrice}>{String(cart.totalPrice)}</span>
            </button>
            <Link
              href="/cart"
              class="rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-200"
            >
              View cart ({String(cart.totalItems)})
            </Link>
          </div>
          <p class="mt-4 text-xs text-slate-500">
            Loader: `routeLoader$(async (event) =&gt; event.params.id)` — per-request, serializable,
            SSR streaming.
          </p>
        </div>
      </div>
    )
  },
)
