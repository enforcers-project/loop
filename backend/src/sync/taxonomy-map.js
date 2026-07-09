// Provider-taxonomy → Loop category mapping.
// Loop categories: music, nightlife, sports, networking, food, campus
// If no match is found, defaults to null (caller must handle — typically skip or assign 'music').

const TICKETMASTER_SEGMENT_MAP = {
  Music: 'music',
  Sports: 'sports',
  'Arts & Theatre': 'music',
  Film: 'nightlife',
  Miscellaneous: null,
}

const TICKETMASTER_GENRE_MAP = {
  // Music genres
  Rock: 'music',
  Pop: 'music',
  'Hip-Hop/Rap': 'music',
  'R&B': 'music',
  Country: 'music',
  Alternative: 'music',
  Metal: 'music',
  Classical: 'music',
  Jazz: 'music',
  Blues: 'music',
  Electronic: 'music',
  Folk: 'music',
  Latin: 'music',
  Reggae: 'music',
  World: 'music',
  Dance: 'music',
  Soul: 'music',
  Gospel: 'music',
  Punk: 'music',
  // Nightlife-leaning
  'Club/Dance': 'nightlife',
  Comedy: 'nightlife',
  Cabaret: 'nightlife',
  Burlesque: 'nightlife',
  // Sports
  Football: 'sports',
  Basketball: 'sports',
  Baseball: 'sports',
  Soccer: 'sports',
  Hockey: 'sports',
  Tennis: 'sports',
  Golf: 'sports',
  Boxing: 'sports',
  MMA: 'sports',
  Wrestling: 'sports',
  Motorsports: 'sports',
  'Ice Shows': 'sports',
  Equestrian: 'sports',
  Volleyball: 'sports',
  Rugby: 'sports',
  Cycling: 'sports',
  // Food/drink
  'Food & Drink': 'food',
  // Networking
  Conference: 'networking',
  'Seminar or Lecture': 'networking',
  'Trade Show': 'networking',
  // Campus
  College: 'campus',
}

const SEATGEEK_TAXONOMY_MAP = {
  concert: 'music',
  music_festival: 'music',
  theater: 'music',
  broadway_tickets_national: 'music',
  classical: 'music',
  classical_orchestral_instrumental: 'music',
  classical_opera: 'music',
  dance_performance_ballet: 'music',
  literary: 'networking',
  comedy: 'nightlife',
  film: 'nightlife',
  cirque_du_soleil: 'nightlife',
  family: 'nightlife',
  // Sports
  sports: 'sports',
  nfl: 'sports',
  nba: 'sports',
  mlb: 'sports',
  nhl: 'sports',
  mls: 'sports',
  ncaa_football: 'sports',
  ncaa_basketball: 'sports',
  ncaa_baseball: 'sports',
  ncaa_hockey: 'sports',
  ncaa_womens_basketball: 'sports',
  minor_league_baseball: 'sports',
  minor_league_hockey: 'sports',
  soccer: 'sports',
  tennis: 'sports',
  golf: 'sports',
  boxing: 'sports',
  mma: 'sports',
  wrestling: 'sports',
  auto_racing: 'sports',
  horse_racing: 'sports',
  rugby: 'sports',
  lacrosse: 'sports',
  volleyball: 'sports',
  swimming: 'sports',
  gymnastics: 'sports',
  // Networking-ish
  conference: 'networking',
  animal_sports: 'sports',
}

/**
 * Map a Ticketmaster event to a Loop category slug.
 * Checks genre first (more specific), then falls back to segment.
 */
export function mapTicketmasterCategory(classification) {
  if (!classification) return null

  const genre = classification.genre?.name
  if (genre && TICKETMASTER_GENRE_MAP[genre]) {
    return TICKETMASTER_GENRE_MAP[genre]
  }

  const segment = classification.segment?.name
  if (segment && TICKETMASTER_SEGMENT_MAP[segment]) {
    return TICKETMASTER_SEGMENT_MAP[segment]
  }

  return null
}

/**
 * Map a SeatGeek event to a Loop category slug.
 * Walks the taxonomies array and returns the first match.
 */
export function mapSeatgeekCategory(taxonomies) {
  if (!Array.isArray(taxonomies)) return null

  for (const tax of taxonomies) {
    const slug = tax.name?.toLowerCase().replace(/\s+/g, '_')
    if (slug && SEATGEEK_TAXONOMY_MAP[slug]) {
      return SEATGEEK_TAXONOMY_MAP[slug]
    }
    const parentSlug = tax.parent_id ? String(tax.parent_id) : null
    if (parentSlug && SEATGEEK_TAXONOMY_MAP[parentSlug]) {
      return SEATGEEK_TAXONOMY_MAP[parentSlug]
    }
  }

  return null
}

export const DEFAULT_CATEGORY = 'music'
