import { defineStore } from "@nexil/core"
export const useCounter = defineStore("counter", {
  state: () => ({ count: 0, doubled: 0 }),
  getters: {},
  actions: { inc() { this.count++; this.doubled = this.count * 2 }, dec() { this.count--; this.doubled = this.count * 2 }, reset() { this.count = 0; this.doubled = 0 } }
})
