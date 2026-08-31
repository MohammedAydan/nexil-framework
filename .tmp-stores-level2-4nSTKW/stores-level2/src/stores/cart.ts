import { defineStore } from '@nexil/state'

export interface CartState {
  count: number
}

export const useCartStore = defineStore('cart', {
  state: (): CartState => ({ count: 3 }),
  getters: {
    doubled: (state) => state.count * 2,
  },
  actions: {
    inc() {
      this.count += 1
    },
    dec() {
      this.count -= 1
    },
  },
})
