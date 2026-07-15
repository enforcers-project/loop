import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { api, toClientUser } from '../lib/api'
import { useModal } from './ModalContext'

// Loop has two roles. Hosting pickup runs is an Organizer sub-capability
// (`isHost`), not a role — a plain attendee can never host. See planning §3/§10.

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const { authGate } = useModal()
  const [user, setUser] = useState(null)
  const [role, setRole] = useState('attendee')
  const [isHost, setIsHost] = useState(false)
  const [interests, setInterestsState] = useState([])
  const [savedIds, setSavedIds] = useState(new Set())
  const [goingIds, setGoingIds] = useState(new Set())
  const [followingIds, setFollowingIds] = useState(new Set(['org-lagos']))
  // Auth is unknown until the first me() check resolves; guards let route
  // protection wait instead of bouncing a logged-in user on refresh.
  const [authReady, setAuthReady] = useState(false)

  // Adopt a resolved SelfUser (from signup/login/me) into context state.
  const adopt = useCallback((clientUser) => {
    setUser(clientUser)
    setRole(clientUser?.role ?? 'attendee')
    setIsHost(clientUser?.role === 'organizer' && !!clientUser?.isHost)
  }, [])

  // Hydrate the session on mount: the JWT cookie is HttpOnly, so the only way
  // to know if we're logged in is to ask the server. Runs once.
  useEffect(() => {
    let cancelled = false
    api.auth
      .me()
      .then((self) => {
        if (!cancelled && self) adopt(toClientUser(self))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAuthReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [adopt])

  // Real login: POST /auth/login, then adopt the returned user. Throws on bad
  // credentials so the Auth screen can surface the message.
  const login = useCallback(
    async (email, password) => {
      const res = await api.auth.login(email, password)
      const clientUser = toClientUser(res?.user)
      adopt(clientUser)
      return clientUser
    },
    [adopt],
  )

  // Real signup: POST /auth/signup (backend sets the cookie), then adopt.
  const signup = useCallback(
    async (payload) => {
      const res = await api.auth.signup(payload)
      const clientUser = toClientUser(res?.user)
      adopt(clientUser)
      return clientUser
    },
    [adopt],
  )

  // Google sign-in: exchange the Google id_token for a Loop session, then adopt.
  // Returns { user, isNew } so the Auth screen can route a first-time Google user
  // to onboarding and a returning one to the feed. `extras` (role/is_host) only
  // matter when the Google account is new; the backend ignores them otherwise.
  const loginWithGoogle = useCallback(
    async (idToken, extras) => {
      const res = await api.auth.google(idToken, extras)
      const clientUser = toClientUser(res?.user)
      adopt(clientUser)
      return { user: clientUser, isNew: !!res?.is_new }
    },
    [adopt],
  )

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } catch {
      // Even if the network call fails, clear local state so the UI reflects
      // logged-out immediately.
    }
    setUser(null)
    setRole('attendee')
    setIsHost(false)
    setInterestsState([])
    setSavedIds(new Set())
    setGoingIds(new Set())
  }, [])

  const setInterests = useCallback((ids) => setInterestsState(ids), [])

  // Gate a logged-out user before a member-only action (save/RSVP/follow):
  // opens the "log in to continue" dialog and returns false so the toggle is
  // a no-op. Returns true when the caller may proceed.
  const requireAuth = useCallback(() => {
    if (user) return true
    authGate()
    return false
  }, [user, authGate])

  const toggle = (set) => (id) => {
    if (!requireAuth()) return
    set((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <AppContext.Provider
      value={{
        user,
        isLoggedIn: !!user,
        authReady,
        role,
        isHost,
        interests,
        savedIds,
        goingIds,
        followingIds,
        login,
        signup,
        loginWithGoogle,
        logout,
        requireAuth,
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
