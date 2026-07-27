// Brand-matched Google Maps styles, derived from the design tokens in
// index.css (cool purple/grey palette). Both the Discover map (EventsMap) and
// the event-detail map (EventMap) pull from here so a palette tweak lands in
// one place. Pass the active theme from ThemeContext to pick a variant.
//
// Style guide: keep the land calm (near-surface grey), water a faint lavender
// tint of --color-primary, and roads a pink wash of --color-accent/--color-loop
// — a purple→pink brand gradient. Tints stay muted so the category-colored
// pins remain the loudest thing on screen (the "Airbnb pattern").

// Light — grey land, lavender water, pink roads.
const LIGHT = [
  { elementType: 'geometry', stylers: [{ color: '#eeeef1' }] }, // ~ --color-surface
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b6b76' }] }, // --color-text-muted
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e3e6df' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#7a8a72' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#fbe4ee' }] }, // pale pink (~ --color-accent wash)
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fcc9dc' }] }, // brand pink
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#f7b0cb' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#fcc9dc' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e5e2f6' }] }, // ~ --color-primary-light
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#8a83c4' }] },
]

// Dark — matches the app's dark surfaces (--color-surface #17171d, card
// #1f1f27) with deep-violet water and raspberry-tinted highways.
const DARK = [
  { elementType: 'geometry', stylers: [{ color: '#17171d' }] }, // --color-surface (dark)
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a94' }] }, // --color-text-muted (dark)
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0b0f' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a2a33' }] }, // --color-border-light (dark)
  { featureType: 'poi', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1b241b' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#5c6b54' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f1f27' }] }, // --color-dark-card
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#0b0b0f' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#2c2230' }] }, // faint pink-tinted grey
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#40213a' }] }, // deep raspberry (~ --color-loop, dark)
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#5a2e4d' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#40213a' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#141221' }] }, // deep violet
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a4470' }] },
]

// Neutral background color for the map container while tiles load, so there's
// no flash of the wrong palette. Matches each variant's land color.
export const MAP_BG = { light: '#eeeef1', dark: '#17171d' }

export function getMapStyles(theme) {
  return theme === 'dark' ? DARK : LIGHT
}
