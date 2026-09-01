import { component, For } from '@nexil/core'
import { Link } from '@nexil/core/router'
import { useCartStore } from '$stores/cart'

export const seo = {
  title: 'Cart — Nexil Demo',
  description: 'Cart store with fine-grained bindings and Link persistence.',
}

export default component(() => {
  const cart = useCartStore()
  return (
    <div class="space-y-8">
      <header>
        <h1 class="text-3xl font-black tracking-tight text-white">Your Cart</h1>
        <p class="mt-2 text-slate-400">
          Global store `src/stores/cart.ts` — survives `Link` outlet swaps via `__NEXIL_STORES__`.
        </p>
      </header>

      <div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div class="flex items-center justify-between">
          <p class="text-sm text-slate-300">
            Items:{' '}
            <b class="text-white" bindText$={cart.totalItems}>
              {String(cart.totalItems)}
            </b>{' '}
            · Total: $
            <b class="text-cyan-400" bindText$={cart.totalPrice}>
              {String(cart.totalPrice)}
            </b>
          </p>
          <button
            class="rounded-lg bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700"
            onClick$={() => cart.clear()}
          >
            Clear
          </button>
        </div>

        <div class="mt-4 space-y-2">
          <For each={cart.items}>
            {(item: any) => (
              <div class="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800 p-3">
                <div>
                  <p class="text-sm font-bold text-white">{item.name}</p>
                  <p class="text-xs text-slate-400">
                    ${item.price} × {item.quantity}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    class="rounded bg-slate-700 px-2 py-1 text-xs text-white"
                    onClick$={() => cart.decQty(item.id)}
                  >
                    −
                  </button>
                  <span class="w-6 text-center text-sm text-white">{item.quantity}</span>
                  <button
                    class="rounded bg-cyan-500 px-2 py-1 text-xs font-bold text-slate-950"
                    onClick$={() => cart.incQty(item.id)}
                  >
                    +
                  </button>
                  <button
                    class="rounded bg-red-900/50 px-2 py-1 text-xs text-red-300"
                    onClick$={() => cart.removeItem(item.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </For>
          {cart.items.length === 0 && (
            <p class="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
              Cart is empty.{' '}
              <Link href="/shop" class="text-cyan-400 underline">
                Add items from shop
              </Link>
              .
            </p>
          )}
        </div>

        <div class="mt-6 flex gap-3">
          <Link
            href="/shop"
            class="flex-1 rounded-xl bg-cyan-500 py-3 text-center text-sm font-bold text-slate-950 hover:bg-cyan-400"
          >
            Continue shopping
          </Link>
          <button
            class="flex-1 rounded-xl border border-slate-700 py-3 text-sm font-bold text-slate-300"
            onClick$={() => {
              const coupon = prompt('Coupon code?') ?? ''
              if (coupon) cart.applyCoupon(coupon)
            }}
          >
            Coupon: {cart.coupon ?? '—'}
          </button>
        </div>
      </div>

      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">How persistence works</h2>
        <pre class="mt-3 overflow-auto rounded bg-slate-950 p-4 text-xs text-cyan-300">
          {`<script type="nexil/state" id="__NEXIL_STORES__">{"cart":{"items":[...]}}<\/script>
data-nx-store-bind="cart:totalItems#text"`}
        </pre>
        <p class="mt-2 text-xs text-slate-500">
          Only accessed stores are serialized. `&lt;` escaped as `\u003c` — XSS safe.
        </p>
      </section>
    </div>
  )
})
