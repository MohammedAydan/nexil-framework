import { createStore } from '@nexil/core'
import type { UserState } from './types'
import { userActions } from './actions'

const initialState: UserState = {
  count: 5,
  profile: { name: 'Ada', email: 'ada@nexil.dev', role: 'admin' },
  isAuthenticated: true,
  theme: 'light',
}

export const useUserStore = createStore({
  id: 'user',
  state: () => initialState,
  actions: userActions,
})
