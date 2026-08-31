import { createStore } from '@nexil/state'
import type { UserState } from './types'
import { userActions } from './actions'

const initialState: UserState = {
  count: 5,
  user: { profile: { name: 'Ada' } },
}

export const useUserStore = createStore({
  id: 'user',
  state: () => initialState,
  actions: userActions,
})
