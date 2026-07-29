import { useEffect, useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { AddressPicker } from './AddressPicker'

// Approximate miles for display — the backend stores + queries in km, but US
// users think in miles. Rounded so 40km reads as "25 mi" (the default).
function kmToMiles(km) {
  return Math.round(km * 0.621371)
}
function milesToKm(mi) {
  return Math.round(mi / 0.621371)
}

const RADIUS_MIN_MI = 1
const RADIUS_MAX_MI = 100

/**
 * NearMePopover — the "near me" status pill plus an inline popover to adjust the
 * search location + radius *for this session only*. Applying calls
 * `onApply({ lat, lng, city, radiusKm })`; the parent holds it as a transient
 * override, so a reload reverts to the profile's saved location (nothing is
 * persisted here — unlike Settings). "Reset" clears back to the profile via
 * `onReset()`.
 *
 * `override` is the parent's current override (or null when following the
 * profile), so the pill shows what's actually driving the feed.
 */
export function NearMePopover({ override, onApply, onReset, className = '' }) {
  const { user } = useApp()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // The place + radius shown in the pill: the active override, else the profile.
  const activeCity = override?.city ?? user?.homeCity ?? null
  const activeRadiusKm = override?.radiusKm ?? user?.locationRadiusKm ?? 40

  // Draft state while the popover is open, seeded from whatever's active.
  const [place, setPlace] = useState(null) // { city, lat, lng, placeId } | null
  const [radiusMi, setRadiusMi] = useState(kmToMiles(activeRadiusKm))

  // Open the popover, seeding the draft from the active place + radius so it
  // reflects current state. Seeding here (not in an effect) avoids a cascading
  // render on open.
  const openPopover = () => {
    setPlace(
      override?.lat != null
        ? { city: override.city, lat: override.lat, lng: override.lng }
        : user?.homeLat != null
          ? { city: user.homeCity, lat: user.homeLat, lng: user.homeLng }
          : null,
    )
    setRadiusMi(kmToMiles(activeRadiusKm))
    setOpen(true)
  }

  // Dismiss on outside click / Escape, like the app's other popovers.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null

  const apply = () => {
    // A radius-only change (no new place) still needs a coordinate to filter by;
    // fall back to the profile's home coords when the user didn't pick a place.
    const lat = place?.lat ?? user.homeLat
    const lng = place?.lng ?? user.homeLng
    const city = place?.city ?? user.homeCity ?? null
    const radiusKm = milesToKm(radiusMi)
    if (lat != null && lng != null) {
      onApply({ lat, lng, city, radiusKm })
    } else if (city) {
      // No coordinates anywhere (profile is city-only) — send a city match with
      // the chosen radius carried for when the place later resolves to coords.
      onApply({ city, radiusKm })
    }
    setOpen(false)
  }

  const reset = () => {
    onReset()
    setOpen(false)
  }

  const pillLabel = activeCity
    ? `${kmToMiles(activeRadiusKm)} mi of ${activeCity}`
    : 'Set your location'

  return (
    <div ref={wrapRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPopover())}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-border-light bg-white px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary"
        title="Adjust location or radius for this search"
      >
        <MapPin size={12} className="flex-shrink-0" />
        <span className="truncate">{pillLabel}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Adjust search location"
          className="absolute left-0 top-full z-30 mt-1.5 w-[min(320px,calc(100vw-2rem))] rounded-card border border-border-light bg-white p-4 shadow-hero"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">Search near</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-full p-1 text-text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>

          <AddressPicker value={place} onChange={setPlace} placeholder="Search a city or address" />

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs">
              <label htmlFor="near-radius" className="font-medium text-text-secondary">
                Radius
              </label>
              <span className="font-semibold text-ink">{radiusMi} mi</span>
            </div>
            <input
              id="near-radius"
              type="range"
              min={RADIUS_MIN_MI}
              max={RADIUS_MAX_MI}
              value={radiusMi}
              onChange={(e) => setRadiusMi(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-button px-3 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={apply}
              className="rounded-button bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Apply
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-text-muted">
            Only for this search — your saved location isn&apos;t changed.
          </p>
        </div>
      )}
    </div>
  )
}
