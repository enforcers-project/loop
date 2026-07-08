import { createContext, useContext, useState, useCallback } from 'react'

// Loop has two roles. Hosting pickup runs is an Organizer sub-capability
// (`isHost`), not a role — a plain attendee can never host. See planning §3/§10.

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState('attendee')
  const [isHost, setIsHost] = useState(false)
  const [interests, setInterestsState] = useState([])
  const [savedIds, setSavedIds] = useState(new Set())
  const [goingIds, setGoingIds] = useState(new Set())
  const [followingIds, setFollowingIds] = useState(new Set(['org-lagos']))

  const login = useCallback((u, r = 'attendee', host = false) => {
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

  const setInterests = useCallback((ids) => setInterestsState(ids), [])

  const toggle = (set) => (id) =>
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
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
