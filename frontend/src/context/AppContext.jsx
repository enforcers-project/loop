import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
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
  // Ids the user has toggled this session (RSVP / follow). Hydration fetches
  // can resolve *after* a click — especially on a cold-started backend — and a
  // blind setGoingIds/setFollowingIds would overwrite the optimistic change
  // with the stale pre-click server snapshot (the RSVP looks like it reverted
  // until a reload). These refs let hydration keep server truth for untouched
  // ids while preserving whatever the user just did.
  const goingTouched = useRef(new Set())
  const followTouched = useRef(new Set())
  const savedTouched = useRef(new Set())
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
      if (cancelled) return
      // Server truth, then re-apply anything toggled while the fetch was in
      // flight so a slow response can't clobber an in-session follow/unfollow.
      setFollowingIds((prev) => {
        const next = new Set(ids)
        for (const id of followTouched.current) {
          if (prev.has(id)) next.add(id)
          else next.delete(id)
        }
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Hydrate the RSVP ("going") set on the same login/refresh boundary, so the
  // "Going" highlight survives a reload. Best-effort — api.goingEvents swallows
  // its own errors; clears on logout below.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    api.goingEvents(user.id).then((ids) => {
      if (cancelled) return
      // Server truth, then re-apply anything toggled while the fetch was in
      // flight so a slow response can't clobber an in-session RSVP/cancel.
      setGoingIds((prev) => {
        const next = new Set(ids)
        for (const id of goingTouched.current) {
          if (prev.has(id)) next.add(id)
          else next.delete(id)
        }
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Hydrate the saved ("bookmark") set on the same login/refresh boundary, so
  // the SaveBtn highlight and the profile "Saved" tab survive a reload. Without
  // this, savedIds started empty on every refresh and the Saved tab was always
  // blank. Best-effort — api.savedEvents swallows its own errors; clears on
  // logout below. Same touched-ref reconciliation as the going/follow sets.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    api.savedEvents(user.id).then((ids) => {
      if (cancelled) return
      setSavedIds((prev) => {
        const next = new Set(ids)
        for (const id of savedTouched.current) {
          if (prev.has(id)) next.add(id)
          else next.delete(id)
        }
        return next
      })
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
    goingTouched.current = new Set()
    followTouched.current = new Set()
    savedTouched.current = new Set()
    // Drop the assistant's persisted thread id so the next signed-in user
    // doesn't inherit the previous session's conversation.
    try {
      sessionStorage.removeItem('loop.assistantConversationId')
    } catch {
      // sessionStorage can throw in private-mode iframes — non-fatal.
    }
  }, [])

  const setInterests = useCallback((ids) => setInterestsState(ids), [])

  // Upload a new profile picture and adopt the refreshed user so every screen
  // reading `user.avatar` updates immediately (no /me round-trip). Throws on
  // failure so the caller can surface a toast and stop its spinner.
  const updateAvatar = useCallback(
    async (file) => {
      const self = await api.uploadAvatar(user?.id, file)
      const clientUser = toClientUser(self)
      adopt(clientUser)
      return clientUser
    },
    [user?.id, adopt],
  )

  // Edit name / handle / bio and adopt the refreshed user so the profile header
  // and nav update immediately. Throws on failure (e.g. 409 handle taken) so the
  // caller can surface a toast and keep the form open.
  const updateProfile = useCallback(
    async (fields) => {
      const self = await api.updateProfile(user?.id, fields)
      const clientUser = toClientUser(self)
      adopt(clientUser)
      return clientUser
    },
    [user?.id, adopt],
  )

  // Persist the user's home city + coords and mirror them onto the local user
  // so any screen reading `user.homeCity/homeLat/homeLng` sees the fresh value
  // without waiting for a /me refresh.
  const saveLocation = useCallback(
    async ({ city, lat, lng, placeId }) => {
      const res = await api.saveLocation(user?.id, { city, lat, lng, placeId })
      setUser((prev) =>
        prev ? { ...prev, homeCity: city, homeLat: lat ?? null, homeLng: lng ?? null } : prev,
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

  // Adjust the logged-in user's own "following" count so their profile header
  // reflects a follow/unfollow immediately (clamped at 0). No-op when logged out.
  const bumpFollowing = useCallback((delta) => {
    setUser((prev) =>
      prev ? { ...prev, following: Math.max(0, (prev.following ?? 0) + delta) } : prev,
    )
  }, [])

  // Save toggle with optimistic UI. Mirrors toggleGoing: flips savedIds
  // immediately, then persists to the backend for a real (UUID) event, rolling
  // back on failure. Every persist writes an interaction_events row and
  // rebuilds the user's preference vector, so a refresh sees personalization.
  const setSavedFlag = useCallback((id, on) => {
    setSavedIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const toggleSaved = useCallback(
    async (id) => {
      if (!requireAuth()) return null
      const wasSaved = savedIds.has(id)
      const willSave = !wasSaved
      savedTouched.current.add(id) // survive an in-flight hydration overwrite
      setSavedFlag(id, willSave) // optimistic

      // Mock events can't persist — leave the optimistic state and return.
      if (!isUuid(id)) return willSave

      try {
        if (willSave) await api.save(id)
        else await api.saveCancel(id)
        return willSave
      } catch (err) {
        setSavedFlag(id, wasSaved) // roll back
        toast.error(err.message || 'Could not update save. Please try again.')
        return wasSaved
      }
    },
    [requireAuth, savedIds, setSavedFlag, toast],
  )

  // RSVP toggle with optimistic UI. Flips goingIds immediately, then persists to
  // the backend for a real (UUID) event, rolling back on failure. Mock seed
  // events (non-UUID ids) have no backend row, so they toggle in-memory only.
  const setGoingFlag = useCallback((id, on) => {
    setGoingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const toggleGoing = useCallback(
    async (id) => {
      if (!requireAuth()) return null
      const wasGoing = goingIds.has(id)
      const willGo = !wasGoing
      goingTouched.current.add(id) // survive an in-flight hydration overwrite
      setGoingFlag(id, willGo) // optimistic

      // Mock events can't persist — leave the optimistic state and return.
      if (!isUuid(id)) return willGo

      try {
        if (willGo) await api.rsvp(id)
        else await api.rsvpCancel(id)
        return willGo
      } catch (err) {
        setGoingFlag(id, wasGoing) // roll back
        toast.error(err.message || 'Could not update RSVP. Please try again.')
        return wasGoing
      }
    },
    [requireAuth, goingIds, setGoingFlag, toast],
  )

  const toggleFollow = useCallback(
    async (id) => {
      if (!requireAuth()) return null
      const wasFollowing = followingIds.has(id)
      const willFollow = !wasFollowing
      followTouched.current.add(id) // survive an in-flight hydration overwrite
      setFollowFlag(id, willFollow) // optimistic
      // Bump the viewer's own "following" count so their profile header updates
      // immediately (the followee's follower_count is handled on their profile).
      bumpFollowing(willFollow ? 1 : -1)

      // Mock organizers can't persist — leave the optimistic state and return.
      if (!isUuid(id)) return willFollow

      try {
        if (willFollow) await api.follow(id)
        else await api.unfollow(id)
        return willFollow
      } catch (err) {
        setFollowFlag(id, wasFollowing) // roll back
        bumpFollowing(willFollow ? -1 : 1) // undo the optimistic count change
        // A 409 on follow (or 404 on unfollow) means the server already agrees
        // with our target state — treat as success rather than a scary error.
        if ((willFollow && err.status === 409) || (!willFollow && err.status === 404)) {
          setFollowFlag(id, willFollow)
          bumpFollowing(willFollow ? 1 : -1) // re-apply the count we just rolled back
          return willFollow
        }
        toast.error(err.message || 'Could not update follow. Please try again.')
        return wasFollowing
      }
    },
    [requireAuth, followingIds, setFollowFlag, bumpFollowing, toast],
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
        updateAvatar,
        updateProfile,
        saveLocation,
        toggleSaved,
        toggleGoing,
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
