import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun, LogOut, User, MapPin, Cake, Pencil, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { cn } from '../lib/utils'
import { AddressPicker } from '../components/AddressPicker'
import { InlineAlert, RoleSelector } from '../components/primitives'

// Loop's minimum age is 13 (COPPA) — mirrors the backend validator in
// PUT /users/:id/birthdate and the onboarding DOB slide.
const MIN_AGE = 13

// Whole-years age from a 'YYYY-MM-DD' string, or NaN if unparseable.
function ageFromIso(iso) {
  if (!iso) return NaN
  const dob = new Date(`${iso}T12:00:00Z`)
  if (isNaN(dob.getTime())) return NaN
  const now = new Date()
  let age = now.getUTCFullYear() - dob.getUTCFullYear()
  const md = now.getUTCMonth() - dob.getUTCMonth()
  if (md < 0 || (md === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1
  return age
}

// The latest DOB that satisfies MIN_AGE, as 'YYYY-MM-DD' — used as the date
// input's `max` so the picker itself blocks under-13 selections.
function maxBirthdateIso() {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - MIN_AGE)
  return d.toISOString().slice(0, 10)
}

// Format 'YYYY-MM-DD' for display (e.g. "Jan 5, 2000"). Falls back to the raw
// string if it doesn't parse.
function formatBirthdate(iso) {
  if (!iso) return null
  const d = new Date(`${iso}T12:00:00Z`)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

// Radius presets shown in the picker. Stored on the user in kilometers to match
// the backend column + the recommender's earth_distance math; displayed in
// miles because US-based users think in miles. The 40 km default matches the
// backend Prisma default (schema.prisma: location_radius_km default 40).
const RADIUS_OPTIONS = [
  { km: 8, label: '5 mi' },
  { km: 16, label: '10 mi' },
  { km: 40, label: '25 mi' },
  { km: 80, label: '50 mi' },
  { km: 160, label: '100 mi' },
]

// Round to the nearest preset so a legacy `40` (default) or a hand-picked
// value still highlights the closest chip.
function nearestRadius(km) {
  if (km == null) return 40
  let best = RADIUS_OPTIONS[0].km
  let dist = Math.abs(RADIUS_OPTIONS[0].km - km)
  for (const opt of RADIUS_OPTIONS) {
    const d = Math.abs(opt.km - km)
    if (d < dist) {
      dist = d
      best = opt.km
    }
  }
  return best
}

function kmToMiles(km) {
  return Math.round(km * 0.621371)
}

/* Row wrapper for a labeled control inside a settings card. */
function Row({ title, description, children }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-light px-5 py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{title}</div>
        {description && <div className="mt-0.5 text-xs text-text-secondary">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

/* Full-width row that stacks its label above the child control — used for the
   location editor where the picker + radius chips need the full card width. */
function StackedRow({ title, description, children }) {
  return (
    <div className="border-b border-border-light px-5 py-4 last:border-b-0">
      <div className="text-sm font-semibold text-ink">{title}</div>
      {description && <div className="mt-0.5 text-xs text-text-secondary">{description}</div>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

function LocationEditor({ user, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [address, setAddress] = useState(() =>
    user?.homeCity
      ? {
          city: user.homeCity,
          lat: user.homeLat,
          lng: user.homeLng,
          placeId: user.homePlaceId ?? null,
        }
      : null,
  )
  const [radiusKm, setRadiusKm] = useState(() => nearestRadius(user?.locationRadiusKm))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { saveLocation } = useApp()
  const toast = useToast()

  const currentAddressLabel = user?.homeCity || 'Not set'
  const currentRadiusLabel = user?.locationRadiusKm
    ? `${kmToMiles(user.locationRadiusKm)} mi`
    : '25 mi'

  const cancel = () => {
    setEditing(false)
    setError('')
    setAddress(
      user?.homeCity
        ? {
            city: user.homeCity,
            lat: user.homeLat,
            lng: user.homeLng,
            placeId: user.homePlaceId ?? null,
          }
        : null,
    )
    setRadiusKm(nearestRadius(user?.locationRadiusKm))
  }

  const save = async () => {
    if (!address?.city) {
      setError('Pick an address or city first.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await saveLocation({
        city: address.city,
        lat: address.lat,
        lng: address.lng,
        placeId: address.placeId,
        radiusKm,
      })
      if (res?.pending) {
        toast.info('Saved locally — will sync when you sign in.')
      } else {
        toast.success('Location updated.')
      }
      setEditing(false)
      onSaved?.()
    } catch (err) {
      setError(err?.message || 'Could not save location. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2">
          <MapPin size={16} className="mt-0.5 flex-shrink-0 text-text-muted" />
          <div className="min-w-0">
            <div className="truncate text-sm text-text-primary">{currentAddressLabel}</div>
            <div className="mt-0.5 text-xs text-text-secondary">
              Showing events within {currentRadiusLabel}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-button border border-border-light bg-white px-3 text-sm font-medium text-text-secondary hover:border-text-muted"
        >
          <Pencil size={14} />
          Edit
        </button>
      </div>
    )
  }

  return (
    <div>
      <AddressPicker
        value={address}
        onChange={setAddress}
        placeholder="e.g. 415 Mission St, San Francisco"
      />

      <div className="mt-5">
        <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
          Search radius
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {RADIUS_OPTIONS.map((opt) => {
            const active = radiusKm === opt.km
            return (
              <button
                key={opt.km}
                type="button"
                onClick={() => setRadiusKm(opt.km)}
                aria-pressed={active}
                className={cn(
                  'rounded-pill border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-white'
                    : 'border-border-light bg-white text-text-secondary hover:border-text-muted',
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <InlineAlert message={error} className="mt-3" />

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="inline-flex h-10 items-center gap-1.5 rounded-button border border-border-light bg-white px-4 text-sm font-medium text-text-secondary hover:border-text-muted"
        >
          <X size={14} />
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !address?.city}
          className={cn(
            'inline-flex h-10 items-center gap-1.5 rounded-button px-4 text-sm font-semibold text-white transition-colors',
            saving || !address?.city
              ? 'cursor-not-allowed bg-surface text-text-muted'
              : 'bg-accent active:scale-95',
          )}
        >
          {saving ? 'Saving…' : 'Save location'}
        </button>
      </div>
    </div>
  )
}

// Date-of-birth editor. Birthdate is captured at onboarding, but users who
// skipped it (or signed up before it shipped) had no way to add one — which
// left them permanently blocked from age-restricted events by the RSVP gate.
// This closes that gap: a native date input wired to the same
// PUT /users/:id/birthdate as onboarding, with the same MIN_AGE=13 floor.
function BirthdateEditor({ user }) {
  const { saveBirthDate } = useApp()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(user?.birthDate ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const current = formatBirthdate(user?.birthDate)

  const cancel = () => {
    setEditing(false)
    setError('')
    setValue(user?.birthDate ?? '')
  }

  const save = async () => {
    if (!value) {
      setError('Pick your date of birth.')
      return
    }
    const age = ageFromIso(value)
    if (!Number.isFinite(age) || age < MIN_AGE) {
      setError(`You must be at least ${MIN_AGE} to use Loop.`)
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await saveBirthDate(value)
      if (res?.pending) {
        toast.info('Saved locally — will sync when you sign in.')
      } else {
        toast.success('Date of birth updated.')
      }
      setEditing(false)
    } catch (err) {
      setError(err?.message || 'Could not save your date of birth. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2">
          <Cake size={16} className="mt-0.5 flex-shrink-0 text-text-muted" />
          <div className="min-w-0">
            <div className="truncate text-sm text-text-primary">{current || 'Not set'}</div>
            <div className="mt-0.5 text-xs text-text-secondary">
              {current
                ? 'Used to verify you meet age-restricted events.'
                : 'Add it to RSVP to age-restricted events.'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-button border border-border-light bg-white px-3 text-sm font-medium text-text-secondary hover:border-text-muted"
        >
          <Pencil size={14} />
          {current ? 'Edit' : 'Add'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <input
        type="date"
        value={value}
        max={maxBirthdateIso()}
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.currentTarget.showPicker?.()}
        aria-label="Date of birth"
        className="loop-input w-full rounded-input border border-border-light bg-white px-4 py-3 text-sm text-text-primary"
      />

      <InlineAlert message={error} className="mt-3" />

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="inline-flex h-10 items-center gap-1.5 rounded-button border border-border-light bg-white px-4 text-sm font-medium text-text-secondary hover:border-text-muted"
        >
          <X size={14} />
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !value}
          className={cn(
            'inline-flex h-10 items-center gap-1.5 rounded-button px-4 text-sm font-semibold text-white transition-colors',
            saving || !value
              ? 'cursor-not-allowed bg-surface text-text-muted'
              : 'bg-accent active:scale-95',
          )}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// The notification toggles the backend recognizes (mirrors NOTIFICATION_KEYS in
// backend/src/users/routes.js). A null prefs map means the user has never set
// them — treated as all-on, matching the backend default.
const NOTIFICATION_ROWS = [
  {
    key: 'rsvps',
    title: 'RSVPs',
    description: 'When your RSVP is confirmed or an event you’re going to changes.',
  },
  { key: 'messages', title: 'Messages', description: 'When someone sends you a new message.' },
  {
    key: 'event_reminders',
    title: 'Event reminders',
    description: 'A nudge before an event you’re attending starts.',
  },
  { key: 'follows', title: 'New followers', description: 'When someone follows you.' },
]

/* Accessible on/off switch for a single preference row. */
function Toggle({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-border-light',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

/* Notification preferences card. Reads the stored prefs (defaulting a null map
   to all-on), and persists each toggle immediately via saveNotificationPrefs —
   optimistically flipping the switch, rolling back + toasting on failure. */
function NotificationPrefs({ user }) {
  const { saveNotificationPrefs } = useApp()
  const toast = useToast()
  // Local mirror so a toggle feels instant; seeded from the user's stored prefs.
  const [prefs, setPrefs] = useState(() => {
    const stored = user?.notificationPrefs ?? {}
    return Object.fromEntries(NOTIFICATION_ROWS.map((r) => [r.key, stored[r.key] ?? true]))
  })
  const [savingKey, setSavingKey] = useState(null)

  const onToggle = async (key, next) => {
    if (savingKey) return
    const prev = prefs[key]
    setPrefs((p) => ({ ...p, [key]: next })) // optimistic
    setSavingKey(key)
    try {
      await saveNotificationPrefs({ [key]: next })
    } catch (err) {
      setPrefs((p) => ({ ...p, [key]: prev })) // roll back
      toast.error(err?.message || 'Could not save preference. Try again.')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <>
      {NOTIFICATION_ROWS.map((row) => (
        <Row key={row.key} title={row.title} description={row.description}>
          <Toggle
            label={row.title}
            checked={prefs[row.key]}
            disabled={savingKey != null}
            onChange={(next) => onToggle(row.key, next)}
          />
        </Row>
      ))}
    </>
  )
}

/* Role card. The same RoleSelector shown in the edit-profile modal, wired to
   updateRole — switching here instantly flips the nav "Create" link, the
   profile pill, and organizer-only tabs (context's adopt re-derives role +
   isHost). The parent owns the busy state; a no-op reselect is a no-op. */
function RolePrefs({ user }) {
  const { updateRole } = useApp()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const onSelect = async (preset) => {
    if (busy) return
    setBusy(true)
    try {
      await updateRole(preset)
      toast.success('Role updated.')
    } catch (err) {
      toast.error(err?.message || 'Could not update role. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return <RoleSelector user={user} onSelect={onSelect} busy={busy} />
}

export function Settings() {
  const navigate = useNavigate()
  const { user, logout } = useApp()
  const { theme, setTheme } = useTheme()

  const onLogout = async () => {
    await logout()
    navigate('/')
  }

  const themeBtn = (value, Icon, label) => {
    const active = theme === value
    return (
      <button
        onClick={() => setTheme(value)}
        aria-pressed={active}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-button px-3 text-sm font-medium transition-colors',
          active
            ? 'border border-primary bg-primary-light text-primary'
            : 'border border-border-light bg-white text-text-secondary hover:border-text-muted',
        )}
      >
        <Icon size={15} />
        {label}
      </button>
    )
  }

  return (
    <div className="loop-container py-8">
      <h1 className="font-display text-3xl font-bold text-ink">Settings</h1>
      <p className="mt-1 text-sm text-text-secondary">Manage your account and preferences.</p>

      <section className="mt-6 overflow-hidden rounded-card border border-border-light bg-white">
        <Row title="Profile" description={user?.email || 'View and edit your public profile.'}>
          <button
            onClick={() => navigate('/profile')}
            className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border-light bg-white px-3 text-sm font-medium text-text-secondary hover:border-text-muted"
          >
            <User size={15} />
            View profile
          </button>
        </Row>

        <Row title="Appearance" description="Choose light or dark mode.">
          <div className="flex gap-2">
            {themeBtn('light', Sun, 'Light')}
            {themeBtn('dark', Moon, 'Dark')}
          </div>
        </Row>
      </section>

      {user && (
        <section className="mt-4 overflow-hidden rounded-card border border-border-light bg-white">
          <StackedRow
            title="Location"
            description="Set your address to see events near you. The radius controls how far out we search."
          >
            <LocationEditor user={user} />
          </StackedRow>
          <StackedRow
            title="Date of birth"
            description="Used to verify your age for age-restricted events. Only you can see this."
          >
            <BirthdateEditor user={user} />
          </StackedRow>
        </section>
      )}

      {user && (
        <section className="mt-4 overflow-hidden rounded-card border border-border-light bg-white">
          <StackedRow
            title="I'm here as"
            description="Switch between attending and organizing anytime. This sets the badge on your profile and unlocks event creation."
          >
            <RolePrefs user={user} />
          </StackedRow>
        </section>
      )}

      {user && (
        <section className="mt-4 overflow-hidden rounded-card border border-border-light bg-white">
          <div className="border-b border-border-light px-5 pb-2 pt-4">
            <h2 className="text-sm font-semibold text-ink">Notifications</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Choose what Loop notifies you about.
            </p>
          </div>
          <NotificationPrefs user={user} />
        </section>
      )}

      <section className="mt-4 overflow-hidden rounded-card border border-border-light bg-white">
        <Row title="Log out" description="Sign out of your Loop account.">
          <button
            onClick={onLogout}
            className="inline-flex h-9 items-center gap-1.5 rounded-button border border-accent bg-white px-3 text-sm font-semibold text-accent hover:bg-accent/5"
          >
            <LogOut size={15} />
            Log out
          </button>
        </Row>
      </section>
    </div>
  )
}
