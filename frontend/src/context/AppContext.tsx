import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { SelfUser } from '../lib/types'

// Loop has two roles. Hosting pickup runs is an Organizer sub-capability
// (`isHost`), not a role — a plain attendee can never host. See planning §3/§10.
export type Role = 'attendee' | 'organizer'

interface AppState {
  user: SelfUser | null
  isLoggedIn: boolean
  role: Role
  isHost: boolean
  interests: string[]
  savedIds: Set<string>
  goingIds: Set<string>
  followingIds: Set<string>
  login: (user: SelfUser, role?: Role, isHost?: boolean) => void
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
  const [isHost, setIsHost] = useState(false)
  const [interests, setInterestsState] = useState<string[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [goingIds, setGoingIds] = useState<Set<string>>(new Set())
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set(['org-lagos']))

  const login = useCallback((u: SelfUser, r: Role = 'attendee', host = false) => {
    setUser(u)
    setRole(r)
    // Hosting is an organizer-only capability; an attendee can never be a host.
    setIsHost(r === 'organizer' && host)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setRole('attendee')
    setIsHost(false)
  }, [])

  const setInterests = useCallback((ids: string[]) => setInterestsState(ids), [])

  const toggle = (set: (fn: (s: Set<string>) => Set<string>) => void) => (id: string) =>
    set((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <AppContext.Provider
      value={{
        user,
        isLoggedIn: !!user,
        role,
        isHost,
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
