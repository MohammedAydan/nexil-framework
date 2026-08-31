import { defineStore } from "@nexil/core"
export const useSharedCart = defineStore("shared-cart", {
  state: () => ({ total: 0, withTax: 0 }),
  getters: {},
  actions: { add() { this.total++; this.withTax = Number((this.total * 1.1).toFixed(2)) } }
})
