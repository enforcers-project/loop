import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { api, toClientUser } from '../lib/api'
import { useModal } from './ModalContext'
import { useToast } from './ToastContext'

// A real user/organizer has a UUID id; the demo `org-*` organizers (mock seed)
// don't, and can't persist a follow — those toggle in-memory only.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)

// Loop has two roles. Hosting pickup runs is an Organizer sub-capability
// (`isHost`), not a role — a plain attendee can never host. See planning §3/§10.

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const { authGate } = useModal()
  const toast = useToast()
  const [user, setUser] = useState(null)
  const [role, setRole] = useState('attendee')
  const [isHost, setIsHost] = useState(false)
  const [interests, setInterestsState] = useState([])
  const [savedIds, setSavedIds] = useState(new Set())
  const [goingIds, setGoingIds] = useState(new Set())
  // Hydrated from GET /users/:id/following on login/refresh (effect below).
  const [followingIds, setFollowingIds] = useState(new Set())
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

  // Hydrate the follow set whenever the logged-in user changes (login, refresh,
  // Google). Keeps FollowBtn state correct across a page reload; clears on
  // logout (user.id gone). Best-effort — api.following swallows its own errors.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    api.following(user.id).then((ids) => {
      if (!cancelled) setFollowingIds(new Set(ids))
    })
    return () => {
      cancelled = true
    }
  }, [user?.id])

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
    setFollowingIds(new Set())
  }, [])

  const setInterests = useCallback((ids) => setInterestsState(ids), [])

  // Persist the user's home city + coords and mirror them onto the local user
  // so any screen reading `user.homeCity/homeLat/homeLng` sees the fresh value
  // without waiting for a /me refresh.
  const saveLocation = useCallback(
    async ({ city, lat, lng, placeId }) => {
      const res = await api.saveLocation(user?.id, { city, lat, lng, placeId })
      setUser((prev) =>
        prev
          ? { ...prev, homeCity: city, homeLat: lat ?? null, homeLng: lng ?? null }
          : prev,
      )
      return res
    },
    [user?.id],
  )

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

  // Follow/unfollow with optimistic UI. Flips followingIds immediately, then
  // persists to the backend for a real (UUID) organizer, rolling back on
  // failure. Mock `org-*` organizers (SocialFeed suggestions) have no backend
  // row, so they toggle in-memory only. Returns the new follow state (or null
  // if the action was gated behind login), so screens can sync a follower count.
  const setFollowFlag = useCallback((id, on) => {
    setFollowingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const toggleFollow = useCallback(
    async (id) => {
      if (!requireAuth()) return null
      const wasFollowing = followingIds.has(id)
      const willFollow = !wasFollowing
      setFollowFlag(id, willFollow) // optimistic

      // Mock organizers can't persist — leave the optimistic state and return.
      if (!isUuid(id)) return willFollow

      try {
        if (willFollow) await api.follow(id)
        else await api.unfollow(id)
        return willFollow
      } catch (err) {
        setFollowFlag(id, wasFollowing) // roll back
        // A 409 on follow (or 404 on unfollow) means the server already agrees
        // with our target state — treat as success rather than a scary error.
        if ((willFollow && err.status === 409) || (!willFollow && err.status === 404)) {
          setFollowFlag(id, willFollow)
          return willFollow
        }
        toast.error(err.message || 'Could not update follow. Please try again.')
        return wasFollowing
      }
    },
    [requireAuth, followingIds, setFollowFlag, toast],
  )

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
        saveLocation,
        toggleSaved: toggle(setSavedIds),
        toggleGoing: toggle(setGoingIds),
        toggleFollow,
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
