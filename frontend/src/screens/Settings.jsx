import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun, LogOut, User, MapPin, Pencil, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { cn } from '../lib/utils'
import { AddressPicker } from '../components/AddressPicker'
import { InlineAlert } from '../components/primitives'

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
