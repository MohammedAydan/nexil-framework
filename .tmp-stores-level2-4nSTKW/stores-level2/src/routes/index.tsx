import { useUserStore } from '$stores/user'
import { useCartStore } from '$stores/cart'

export default function Home() {
  const userStore = useUserStore()
  const cartStore = useCartStore()
  return (
    <main>
      <p id="user-count">{userStore.count}</p>
      <p id="user-name">{userStore.user.profile.name}</p>
      <p id="cart-count">{cartStore.count}</p>
      <p id="cart-doubled">{cartStore.doubled}</p>
      <p id="user-count-explicit" bindText$={userStore.count}>{userStore.count}</p>
      <button id="inc-user" onClick$={() => { const sig = (globalThis as any).__getStorePathSignal('user','count'); sig.set((sig() as number)+1) }}>inc user</button>
      <button id="set-name" onClick$={() => { const sig = (globalThis as any).__getStorePathSignal('user','user.profile.name'); sig.set('Eve') }}>set name</button>
      <button id="double-inc" onClick$={() => { const sig = (globalThis as any).__getStorePathSignal('user','count'); sig.set((sig() as number)+2) }}>double inc</button>
      <button id="inc-cart" onClick$={() => { const sig = (globalThis as any).__getStorePathSignal('cart','count'); sig.set((sig() as number)+1) }}>inc cart</button>
    </main>
  )
}
