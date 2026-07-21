import { Link } from 'react-router-dom'
import { MapPin, Settings as SettingsIcon } from 'lucide-react'
import { useApp } from '../context/AppContext'

// Approximate miles for display — the backend stores + queries in km, but US
// users think in miles. Rounded so 40km reads as "25 mi" (the default).
function kmToMiles(km) {
  return Math.round(km * 0.621371)
}

/**
 * NearMeChip — a compact status pill that surfaces the user's current "near
 * me" location + radius under the For You / Discover feed header, and links
 * to Settings where they can change it. Renders nothing when the user is
 * logged out or hasn't set a location yet (Onboarding still handles that
 * first-touch path).
 */
export function NearMeChip({ className = '' }) {
  const { user } = useApp()
  if (!user?.homeCity) return null
  const radiusKm = user.locationRadiusKm ?? 40
  const label = `${kmToMiles(radiusKm)} mi of ${user.homeCity}`
  return (
    <Link
      to="/settings"
      className={`inline-flex max-w-full items-center gap-1.5 rounded-pill border border-border-light bg-white px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary ${className}`}
      aria-label={`Near me: within ${label}. Tap to change.`}
      title="Change your location or radius"
    >
      <MapPin size={12} className="flex-shrink-0" />
      <span className="truncate">{label}</span>
      <SettingsIcon size={12} className="flex-shrink-0 opacity-60" />
    </Link>
  )
}
