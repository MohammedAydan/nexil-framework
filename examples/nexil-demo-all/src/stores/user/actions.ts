import type { UserState, UserProfile } from './types'

export const userActions = {
  setProfile(state: UserState, profile: UserProfile) {
    state.profile = profile
    state.isAuthenticated = true
  },
  logout(state: UserState) {
    state.profile = null
    state.isAuthenticated = false
  },
  toggleTheme(state: UserState) {
    state.theme = state.theme === 'light' ? 'dark' : 'light'
  },
  increment(state: UserState) {
    state.count += 1
  },
  setCount(state: UserState, n: number) {
    state.count = n
  },
}
