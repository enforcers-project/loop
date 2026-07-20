import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { cn } from '../lib/utils'
import { FormField, PasswordField, InlineAlert, inputClass } from '../components/primitives'

// Two roles only. Hosting pickup runs is an Organizer sub-capability toggled
// below (not a role) — a plain attendee can't host. See planning §3/§10.
const ROLES = [
  { id: 'attendee', label: 'Attendee', blurb: 'Discover & RSVP' },
  { id: 'organizer', label: 'Organizer', blurb: 'Create & manage events' },
]

// Google OAuth Web client id (same value the backend verifies against). It's not
// a secret — it ships to the browser — but lives in env for parity/config. When
// unset, the Google button is hidden and email auth is the only path.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const GSI_SRC = 'https://accounts.google.com/gsi/client'

// Load the Google Identity Services script once (idempotent across mounts) and
// report `ready` when `window.google.accounts.id` exists. Polls rather than
// relying on the load event, so it works whether the script is still loading or
// was already injected by a prior mount.
function useGoogleScript(enabled) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!enabled) return
    if (!document.querySelector(`script[src="${GSI_SRC}"]`)) {
      const script = document.createElement('script')
      script.src = GSI_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
    // Poll for availability (the callback runs async, so no cascading render).
    // The first tick fires ~immediately, covering the already-loaded case too.
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        setReady(true)
        clearInterval(timer)
      }
    }, 50)
    return () => clearInterval(timer)
  }, [enabled])
  return ready
}

export function Auth() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { login, signup, loginWithGoogle } = useApp()
  const [mode, setMode] = useState(params.get('mode') === 'login' ? 'login' : 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('attendee')
  const [isHost, setIsHost] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Inline error shown right above the submit button (instead of a bottom-of-
  // screen toast), so the feedback appears where the user is looking.
  const [error, setError] = useState('')
  // Set when a Google *login* found no account and we flipped to signup, so we
  // can nudge the user to click "Continue with Google" once more to finish.
  const [googleSignupHint, setGoogleSignupHint] = useState(false)

  // Hosting is organizer-only; drop the flag if they aren't signing up as one.
  const wantsHost = role === 'organizer' && isHost

  // --- Google sign-in ---------------------------------------------------------
  const googleEnabled = !!GOOGLE_CLIENT_ID
  const gsiReady = useGoogleScript(googleEnabled)
  const googleBtnRef = useRef(null)

  // Called with Google's credential (an id_token) once the user picks an account.
  // The selected role/host flags ride along and are only honored for a brand-new
  // Google account; a first-timer lands on onboarding, a returning user on /feed.
  const handleGoogle = useCallback(
    async (response) => {
      const next = params.get('next')
      try {
        const { isNew } = await loginWithGoogle(response.credential, {
          // On the Log in screen, "intent: login" tells the backend to refuse a
          // brand-new Google identity instead of auto-creating an account.
          intent: mode === 'login' ? 'login' : 'signup',
          role,
          organizer_kind: role === 'organizer' ? 'organizer' : undefined,
          is_host: wantsHost,
        })
        navigate(next || (isNew ? '/onboarding' : '/feed'))
      } catch (err) {
        // No account yet while trying to log in → send them to Sign up.
        if (err.status === 404) {
          setError('No Loop account found — sign up to get started.')
          setMode('signup')
          setGoogleSignupHint(true)
          return
        }
        setError(err.message || 'Google sign-in failed. Please try again.')
      }
    },
    [loginWithGoogle, navigate, params, mode, role, wantsHost],
  )

  // Initialize GSI and render Google's official button into the placeholder once
  // the script is ready. Google requires their own rendered button to obtain an
  // id_token in the browser (a custom-styled button can't), so we render theirs.
  useEffect(() => {
    if (!googleEnabled || !gsiReady || !googleBtnRef.current) return
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogle,
    })
    googleBtnRef.current.replaceChildren() // clear any prior render (mode/role change)
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: mode === 'signup' ? 'signup_with' : 'signin_with',
    })
  }, [googleEnabled, gsiReady, handleGoogle, mode])

  const submit = async () => {
    if (submitting) return
    setError('')
    // Client-side guard mirrors the backend contract (email + 8-char password).
    if (!email.trim()) return setError('Enter your email.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')

    // A gated redirect (ProtectedRoute / authGate) parks the intended path in
    // ?next=; return there after login, else the sensible default per mode.
    const next = params.get('next')
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await signup({
          email: email.trim(),
          password,
          role,
          display_name: name.trim() || undefined,
          organizer_kind: role === 'organizer' ? 'organizer' : undefined,
          is_host: wantsHost,
        })
        navigate(next || '/onboarding')
      } else {
        await login(email.trim(), password)
        navigate(next || '/feed')
      }
    } catch (err) {
      // Surface the backend's real message (bad credentials, email taken, …).
      setError(err.message || 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-5 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center">
          <img src="/logo.png" alt="Loop" className="h-8 w-auto" />
        </Link>

        <div className="rounded-card border border-border-light bg-white p-6 shadow-card sm:p-8">
          {/* current-mode heading — one operation at a time; switch via the link below */}
          <h1 className="mb-6 text-center text-xl font-semibold text-ink">
            {mode === 'signup' ? 'Sign up' : 'Log in'}
          </h1>

          {/* social auth — Google renders its own button into this slot */}
          {googleEnabled && (
            <>
              {mode === 'signup' && googleSignupHint && (
                <p className="mb-3 rounded-button bg-primary/5 px-3 py-2 text-center text-xs text-text-secondary">
                  Almost there: tap “Continue with Google” again to finish creating your account.
                </p>
              )}
              <div ref={googleBtnRef} className="flex min-h-[44px] justify-center" />
              <div className="my-5 flex items-center gap-3 text-xs text-text-muted">
                <span className="h-px flex-1 bg-border-light" /> or{' '}
                {mode === 'signup' ? 'sign up' : 'log in'} with email
                <span className="h-px flex-1 bg-border-light" />
              </div>
            </>
          )}

          {/* form */}
          <div className="space-y-4">
            {mode === 'signup' && (
              <FormField label="Full name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                  className={inputClass}
                />
              </FormField>
            )}
            <FormField label="Email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={inputClass}
              />
            </FormField>
            <FormField label="Password">
              <PasswordField
                value={password}
                onChange={setPassword}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </FormField>

            {/* role selector — signup only */}
            {mode === 'signup' && (
              <div>
                <span className="mb-1.5 block text-[13px] font-medium text-text-secondary">
                  I’m joining as
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRole(r.id)}
                      className={cn(
                        'rounded-button border px-3 py-2.5 text-left transition-colors',
                        role === r.id
                          ? 'border-primary bg-primary text-white'
                          : 'border-border-light bg-white text-text-secondary hover:border-text-muted',
                      )}
                    >
                      <span className="block text-sm font-semibold">{r.label}</span>
                      <span
                        className={cn(
                          'block text-xs',
                          role === r.id ? 'text-white/80' : 'text-text-muted',
                        )}
                      >
                        {r.blurb}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Host is an organizer sub-capability — only offered to organizers. */}
                {role === 'organizer' && (
                  <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-button border border-border-light bg-white px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isHost}
                      onChange={(e) => setIsHost(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border-light text-primary"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink">
                        I host pickup sports runs
                      </span>
                      <span className="block text-xs text-text-muted">
                        Unlocks rosters, positions &amp; skill levels
                      </span>
                    </span>
                  </label>
                )}
              </div>
            )}

            {/* inline error — sits right above the button the user just clicked */}
            <InlineAlert message={error} />

            <button
              onClick={submit}
              disabled={submitting}
              className="w-full rounded-button bg-accent py-3 text-sm font-semibold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? mode === 'signup'
                  ? 'Creating account…'
                  : 'Logging in…'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Log in'}
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-text-secondary">
          {mode === 'signup' ? 'Already have an account? ' : 'New to Loop? '}
          <button
            onClick={() => {
              setMode(mode === 'signup' ? 'login' : 'signup')
              setGoogleSignupHint(false) // manual switch clears the finish-signup nudge
              setError('') // drop any stale error from the other mode
            }}
            className="font-semibold text-primary"
          >
            {mode === 'signup' ? 'Log in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}
