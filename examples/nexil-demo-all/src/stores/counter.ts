import { defineStore } from '@nexil/core'

export interface CounterState {
  count: number
}

export const useCounterStore = defineStore('counter', {
  state: (): CounterState => ({ count: 0 }),
  getters: {
    doubled: (state) => state.count * 2,
    isEven: (state) => state.count % 2 === 0,
  },
  actions: {
    inc() {
      this.count += 1
    },
    dec() {
      this.count -= 1
    },
    setCount(n: number) {
      this.count = n
    },
    reset() {
      this.count = 0
    },
  },
})
