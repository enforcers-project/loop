import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp, type Role } from '../context/AppContext'
import { cn } from '../lib/utils'
import { FormField, PasswordField, inputClass } from '../components/primitives'

type Mode = 'signup' | 'login'

// Two roles only. Hosting pickup runs is an Organizer sub-capability toggled
// below (not a role) — a plain attendee can't host. See planning §3/§10.
const ROLES: { id: Role; label: string; blurb: string }[] = [
  { id: 'attendee', label: 'Attendee', blurb: 'Discover & RSVP' },
  { id: 'organizer', label: 'Organizer', blurb: 'Create & manage events' },
]

export function Auth() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useApp()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'login' ? 'login' : 'signup')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('attendee')
  const [isHost, setIsHost] = useState(false)

  // Hosting is organizer-only; drop the flag if they aren't signing up as one.
  const wantsHost = role === 'organizer' && isHost

  const submit = () => {
    const handle = '@' + (email.split('@')[0] || 'you')
    const avatar = 'https://i.pravatar.cc/150?img=1'
    const self =
      mode === 'signup'
        ? { id: 'user-demo', email, name: name || 'Alex Carter', role, handle, avatar }
        : { id: 'user-demo', email, name: 'Alex Carter', role: 'attendee', handle, avatar }
    login(self, mode === 'signup' ? role : 'attendee', mode === 'signup' && wantsHost)
    navigate(mode === 'signup' ? '/onboarding' : '/feed')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-5 py-10">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-6 flex items-center justify-center gap-2 font-display text-2xl font-bold text-ink"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary">
            <span className="block h-3.5 w-3.5 rounded-full border-[3px] border-white" />
          </span>
          Loop
        </Link>

        <div className="rounded-card border border-border-light bg-white p-6 shadow-card sm:p-8">
          {/* mode toggle */}
          <div className="mb-6 flex rounded-button bg-surface p-1">
            {(['signup', 'login'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 rounded-[8px] py-2 text-sm font-semibold transition-colors',
                  mode === m ? 'bg-white text-ink shadow-sm' : 'text-text-secondary',
                )}
              >
                {m === 'signup' ? 'Sign up' : 'Log in'}
              </button>
            ))}
          </div>

          {/* social auth */}
          <div className="space-y-2.5">
            <button className="flex w-full items-center justify-center gap-2 rounded-button border border-border-light bg-white py-2.5 text-sm font-semibold text-ink hover:bg-surface">
              <img src="https://www.google.com/favicon.ico" alt="" className="h-4 w-4" />
              Continue with Google
            </button>
            <button className="flex w-full items-center justify-center gap-2 rounded-button border border-border-light bg-white py-2.5 text-sm font-semibold text-ink hover:bg-surface">
              Continue with Apple
            </button>
          </div>

          <div className="my-5 flex items-center gap-3 text-xs text-text-muted">
            <span className="h-px flex-1 bg-border-light" /> or{' '}
            {mode === 'signup' ? 'sign up' : 'log in'} with email
            <span className="h-px flex-1 bg-border-light" />
          </div>

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
                type="email"
                placeholder="you@example.com"
                className={inputClass}
              />
            </FormField>
            <FormField label="Password">
              <PasswordField />
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

            <button
              onClick={submit}
              className="w-full rounded-button bg-accent py-3 text-sm font-semibold text-white transition-transform active:scale-95"
            >
              {mode === 'signup' ? 'Create account' : 'Log in'}
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-text-secondary">
          {mode === 'signup' ? 'Already have an account? ' : 'New to Loop? '}
          <button
            onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
            className="font-semibold text-primary"
          >
            {mode === 'signup' ? 'Log in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}
