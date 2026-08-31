import type { UserState } from './types'

export const userActions = {
  increment(state: UserState): void {
    state.count += 1
  },
  setName(state: UserState, name: string): void {
    state.user.profile.name = name
  },
  doubleInc(state: UserState): void {
    state.count += 1
    state.count += 1
  },
}
