const EARTH_RADIUS_MILES = 3958.8

export function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_MILES * c
}

const DEFAULT_DECAY_MILES = 5

export function proximityScore(distanceMiles, decayRadius = DEFAULT_DECAY_MILES) {
  if (distanceMiles <= 0) return 1.0
  return Math.exp(-distanceMiles / decayRadius)
}
