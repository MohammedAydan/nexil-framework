import { defineStore } from '@nexil/core'

export interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
}

export interface CartState {
  items: CartItem[]
  coupon: string | null
}

export const useCartStore = defineStore('cart', {
  state: (): CartState => ({ items: [], coupon: null }),
  getters: {
    totalItems: (state) => state.items.reduce((s, i) => s + i.quantity, 0),
    totalPrice: (state) => state.items.reduce((s, i) => s + i.price * i.quantity, 0),
    hasItems: (state) => state.items.length > 0,
  },
  actions: {
    addItem(item: Omit<CartItem, 'quantity'>) {
      const ex = this.items.find((i) => i.id === item.id)
      if (ex) ex.quantity += 1
      else this.items.push({ ...item, quantity: 1 })
    },
    removeItem(id: string) {
      this.items = this.items.filter((i) => i.id !== id)
    },
    incQty(id: string) {
      const it = this.items.find((i) => i.id === id)
      if (it) it.quantity += 1
    },
    decQty(id: string) {
      const it = this.items.find((i) => i.id === id)
      if (it) {
        it.quantity -= 1
        if (it.quantity <= 0) this.items = this.items.filter((i) => i.id !== id)
      }
    },
    clear() {
      this.items = []
      this.coupon = null
    },
    applyCoupon(code: string) {
      this.coupon = code
    },
  },
})
