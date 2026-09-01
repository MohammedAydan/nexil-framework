export interface UserProfile {
  name: string
  email: string
  role: 'admin' | 'user' | 'guest'
}

export interface UserState {
  count: number
  profile: UserProfile | null
  isAuthenticated: boolean
  theme: 'light' | 'dark'
}
