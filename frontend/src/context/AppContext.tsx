import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { SelfUser } from '../lib/types'

type Role = 'attendee' | 'organizer' | 'promoter' | 'sportsHost'

interface AppState {
  user: SelfUser | null
  isLoggedIn: boolean
  role: Role
  interests: string[]
  savedIds: Set<string>
  goingIds: Set<string>
  followingIds: Set<string>
  login: (user: SelfUser, role?: Role) => void
  logout: () => void
  setInterests: (ids: string[]) => void
  toggleSaved: (id: string) => void
  toggleGoing: (id: string) => void
  toggleFollow: (id: string) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SelfUser | null>(null)
  const [role, setRole] = useState<Role>('attendee')
  const [interests, setInterestsState] = useState<string[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [goingIds, setGoingIds] = useState<Set<string>>(new Set())
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set(['org-lagos']))

  const login = useCallback((u: SelfUser, r: Role = 'attendee') => {
    setUser(u)
    setRole(r)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setRole('attendee')
  }, [])

  const setInterests = useCallback((ids: string[]) => setInterestsState(ids), [])

  const toggle = (set: (fn: (s: Set<string>) => Set<string>) => void) => (id: string) =>
    set((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <AppContext.Provider
      value={{
        user,
        isLoggedIn: !!user,
        role,
        interests,
        savedIds,
        goingIds,
        followingIds,
        login,
        logout,
        setInterests,
        toggleSaved: toggle(setSavedIds),
        toggleGoing: toggle(setGoingIds),
        toggleFollow: toggle(setFollowingIds),
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
