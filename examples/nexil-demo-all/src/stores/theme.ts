import { defineStoreContext } from '@nexil/core'

export interface ThemeState {
  mode: 'light' | 'dark'
  accent: string
}

export const ThemeStore = defineStoreContext('theme', {
  state: (): ThemeState => ({ mode: 'light', accent: 'indigo' }),
  getters: {
    isDark: (s) => s.mode === 'dark',
  },
  actions: {
    toggle() {
      this.mode = this.mode === 'light' ? 'dark' : 'light'
    },
    setMode(mode: 'light' | 'dark') {
      this.mode = mode
    },
    setAccent(color: string) {
      this.accent = color
    },
  },
})
