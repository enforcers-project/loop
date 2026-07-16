// Google Maps JS SDK loader (Places library). A lightweight idempotent
// wrapper around Google's own <script> loader so multiple components can
// `await` it without racing or double-injecting.
//
// Requires the browser-safe key in `VITE_GOOGLE_MAPS_KEY` (frontend/.env).
// The key ships to the client by design; restrict it in Google Cloud (HTTP
// referrer + APIs: Maps JavaScript, Places, Geocoding).

const CALLBACK_NAME = '__loopGoogleMapsReady'
let loadingPromise = null

export function isGoogleMapsConfigured() {
  return !!import.meta.env.VITE_GOOGLE_MAPS_KEY
}

// Resolve once `google.maps.places` is available. Returns the `google` global,
// or rejects if the key isn't configured / the script fails to load.
export function loadGoogleMaps() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser'))
  }
  if (window.google?.maps?.places) return Promise.resolve(window.google)
  if (loadingPromise) return loadingPromise

  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY
  if (!key) {
    return Promise.reject(new Error('VITE_GOOGLE_MAPS_KEY is not set'))
  }

  loadingPromise = new Promise((resolve, reject) => {
    window[CALLBACK_NAME] = () => {
      if (window.google?.maps?.places) resolve(window.google)
      else reject(new Error('Google Maps loaded but places library is missing'))
    }
    const script = document.createElement('script')
    // `loading=async` opts into the modern loader (no console warning);
    // `libraries=places` pulls in AutocompleteService.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      key,
    )}&libraries=places&loading=async&callback=${CALLBACK_NAME}`
    script.async = true
    script.defer = true
    script.onerror = () => {
      loadingPromise = null
      reject(new Error('Failed to load Google Maps script'))
    }
    document.head.appendChild(script)
  })
  return loadingPromise
}

// Ask the browser for the user's current position, then reverse-geocode with
// Google to get a display-friendly "City, ST" string. Requires HTTPS (or
// localhost) and user permission.
export async function getCurrentLocation() {
  if (!navigator.geolocation) {
    throw new Error("Your browser doesn't support geolocation")
  }
  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    })
  }).catch((err) => {
    // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
    const map = {
      1: 'Location permission denied. Enable it in your browser to use this.',
      2: 'Location unavailable right now — try again in a moment.',
      3: 'Location request timed out.',
    }
    throw new Error(map[err.code] || 'Could not get your location')
  })

  const { latitude: lat, longitude: lng } = position.coords
  const google = await loadGoogleMaps()
  const geocoder = new google.maps.Geocoder()
  const { results } = await geocoder.geocode({ location: { lat, lng } }).catch(() => ({
    results: [],
  }))

  return { lat, lng, city: cityFromGeocode(results) || 'Current location', placeId: null }
}

// Extract a "City, ST" (or country fallback) string from a geocoder result set.
export function cityFromGeocode(results) {
  if (!Array.isArray(results) || results.length === 0) return null
  for (const r of results) {
    const comps = r.address_components || []
    const locality = comps.find((c) => c.types.includes('locality'))?.long_name
    const admin1 = comps.find((c) => c.types.includes('administrative_area_level_1'))?.short_name
    const country = comps.find((c) => c.types.includes('country'))?.short_name
    if (locality) {
      return admin1 ? `${locality}, ${admin1}` : country ? `${locality}, ${country}` : locality
    }
  }
  return results[0].formatted_address || null
}
