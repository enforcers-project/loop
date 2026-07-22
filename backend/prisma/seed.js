import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Deterministic pseudo-random number in [0, 1) from a string seed. Used to
 * generate stable "plausible" RSVP/save counts across reseeds so the demo UI
 * has social proof without pretending the same event has different popularity
 * each time. Simple FNV-ish mix — good enough for jitter, not cryptography.
 */
function hashUnit(seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // Fold to unsigned, divide by 2^32 for [0, 1).
  return (h >>> 0) / 4294967296
}

/**
 * Seed a plausible RSVP + save count for a demo event. Reads capacity as the
 * upper bound (an event never has more RSVPs than seats), then draws a fill
 * ratio from a deterministic distribution keyed by slug + is_sports:
 *   - sports/pickup runs → 40–85% filled (small squads, real signup pressure)
 *   - regular events     → 25–75% filled (median event; some hot, some cold)
 *   - free + high-cap    → wider, headliners fill deeper
 * Saves track ~35–55% of the RSVP count (people who bookmark but haven't RSVPd).
 */
function seedCounts(evt) {
  const cap = evt.capacity ?? 100
  const r1 = hashUnit(evt.slug)
  const r2 = hashUnit(`${evt.slug}:save`)
  let fillLow, fillHigh
  if (evt.isSports) {
    fillLow = 0.4
    fillHigh = 0.85
  } else if (evt.isFree && cap >= 200) {
    fillLow = 0.35
    fillHigh = 0.8
  } else {
    fillLow = 0.25
    fillHigh = 0.75
  }
  const fill = fillLow + r1 * (fillHigh - fillLow)
  const rsvpCount = Math.max(1, Math.min(cap, Math.round(cap * fill)))
  const saveRatio = 0.35 + r2 * 0.2
  const saveCount = Math.round(rsvpCount * saveRatio)
  return { rsvpCount, saveCount }
}

// Seeded organizer Users (UUID PKs) so the follow graph + OrganizerProfile
// work end-to-end against the DB (the rest of the demo organizers are
// mock-only). Fixed ids keep profile URLs stable across reseeds.
// password_hash null = a seed-only account you can't log into (log in as
// any other user to follow it). One organizer per category so every seeded
// event gets host attribution — critical for "who's hosting?" parity across
// the feed. music + nightlife share Lagos Nights (that's the flagship
// organizer with posts/stories already tied to its slug-linked events).
const ORGANIZER = {
  id: '00000000-0000-4000-8000-000000000026',
  email: 'lagosnights@loop.demo',
  role: 'organizer',
  organizerKind: 'promoter',
  isHost: false,
  displayName: 'Lagos Nights',
  handle: 'lagosnights',
  isVerified: true,
  avatarUrl: 'https://i.pravatar.cc/150?img=13',
  coverImageUrl: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200&q=80',
  bio: 'Bringing the biggest Afrobeats & Amapiano nights to the Bay. Rooftops, warehouses, good vibes only.',
  homeCity: 'San Francisco',
}

// Additional per-category organizers so every seeded event has a host.
// Same shape as ORGANIZER; schema only permits organizerKind values
// { organizer, promoter } — 'sports_host' is not a valid enum, so the
// sports organizer uses isHost=true on top of organizerKind='promoter'
// to signal "hosts pickup runs" without breaking Prisma validation.
const SPORTS_ORGANIZER = {
  id: '00000000-0000-4000-8000-000000000027',
  email: 'baypickup@loop.demo',
  role: 'organizer',
  organizerKind: 'promoter',
  isHost: true,
  displayName: 'Bay Area Pickup',
  handle: 'baypickup',
  isVerified: true,
  avatarUrl: 'https://i.pravatar.cc/150?img=14',
  coverImageUrl: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1200&q=80',
  bio: 'Weekly pickup runs across the Bay — soccer, hoops, volleyball, running clubs. All levels, real ballers.',
  homeCity: 'Oakland',
}

const NETWORKING_ORGANIZER = {
  id: '00000000-0000-4000-8000-000000000028',
  email: 'techbay@loop.demo',
  role: 'organizer',
  organizerKind: 'promoter',
  isHost: false,
  displayName: 'TechBay Collective',
  handle: 'techbay',
  isVerified: true,
  avatarUrl: 'https://i.pravatar.cc/150?img=15',
  coverImageUrl: 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=1200&q=80',
  bio: 'Meetups, mixers, and career fairs for Bay Area builders. Free events, warm intros.',
  homeCity: 'San Francisco',
}

const FOOD_ORGANIZER = {
  id: '00000000-0000-4000-8000-000000000029',
  email: 'tasteofthetown@loop.demo',
  role: 'organizer',
  organizerKind: 'promoter',
  isHost: false,
  displayName: 'Taste of the Town',
  handle: 'tasteofthetown',
  isVerified: true,
  avatarUrl: 'https://i.pravatar.cc/150?img=16',
  coverImageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1200&q=80',
  bio: 'Pop-ups, tastings, and food festivals across the Bay. If it eats or drinks, we cover it.',
  homeCity: 'San Francisco',
}

const CAMPUS_ORGANIZER = {
  id: '00000000-0000-4000-8000-000000000030',
  email: 'campusunion@loop.demo',
  role: 'organizer',
  organizerKind: 'promoter',
  isHost: false,
  displayName: 'Campus Union',
  handle: 'campusunion',
  isVerified: true,
  avatarUrl: 'https://i.pravatar.cc/150?img=17',
  coverImageUrl: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=1200&q=80',
  bio: 'Cal + Bay Area campus events. Block parties, study jams, film nights, hackathons.',
  homeCity: 'Berkeley',
}

// Category → organizer user id lookup. Music + nightlife share Lagos Nights.
const ORGANIZER_BY_CATEGORY = {
  music: ORGANIZER.id,
  nightlife: ORGANIZER.id,
  sports: SPORTS_ORGANIZER.id,
  networking: NETWORKING_ORGANIZER.id,
  food: FOOD_ORGANIZER.id,
  campus: CAMPUS_ORGANIZER.id,
}

const ALL_ORGANIZERS = [
  ORGANIZER,
  SPORTS_ORGANIZER,
  NETWORKING_ORGANIZER,
  FOOD_ORGANIZER,
  CAMPUS_ORGANIZER,
]

// Demo attendee accounts. Fixed UUIDs so the social graph (post comments,
// future follows, etc.) stays stable across reseeds. They exist to hydrate the
// SocialFeed comment threads with plausible-looking non-organizer voices —
// posts are still authored exclusively by ORGANIZER above.
const ATTENDEES = [
  {
    id: '00000000-0000-4000-8000-000000000031',
    email: 'mayac@loop.demo',
    role: 'attendee',
    isHost: false,
    displayName: 'Maya Chen',
    handle: 'mayac',
    avatarUrl: 'https://i.pravatar.cc/150?img=47',
    homeCity: 'San Francisco',
  },
  {
    id: '00000000-0000-4000-8000-000000000032',
    email: 'dev_e@loop.demo',
    role: 'attendee',
    isHost: false,
    displayName: 'Devon Ellis',
    handle: 'dev_e',
    avatarUrl: 'https://i.pravatar.cc/150?img=52',
    homeCity: 'San Francisco',
  },
  {
    id: '00000000-0000-4000-8000-000000000033',
    email: 'amaraosei@loop.demo',
    role: 'attendee',
    isHost: false,
    displayName: 'Amara Osei',
    handle: 'amaraosei',
    avatarUrl: 'https://i.pravatar.cc/150?img=48',
    homeCity: 'San Francisco',
  },
  {
    id: '00000000-0000-4000-8000-000000000034',
    email: 'kainaka@loop.demo',
    role: 'attendee',
    isHost: false,
    displayName: 'Kai Nakamura',
    handle: 'kainaka',
    avatarUrl: 'https://i.pravatar.cc/150?img=15',
    homeCity: 'San Francisco',
  },
  {
    id: '00000000-0000-4000-8000-000000000035',
    email: 'sofiareyes@loop.demo',
    role: 'attendee',
    isHost: false,
    displayName: 'Sofia Reyes',
    handle: 'sofiareyes',
    avatarUrl: 'https://i.pravatar.cc/150?img=44',
    homeCity: 'San Francisco',
  },
]

// Roster-only demo users. Kept separate from ATTENDEES so the SocialFeed's
// "commenters are attendees" invariant stays intact — these accounts exist
// purely to fill sports-run rosters so the picker's per-slot open/full state
// matches the "N signed up" counter for the larger runs (up to 30 players).
// Fixed UUIDs so reseeds land the same names on the same slots.
const ROSTER_PLAYERS = [
  ['00000000-0000-4000-8000-000000000041', 'jordan_b', 'Jordan Baker', 1],
  ['00000000-0000-4000-8000-000000000042', 'nyla_p', 'Nyla Patel', 2],
  ['00000000-0000-4000-8000-000000000043', 'liam_ok', "Liam O'Kelly", 3],
  ['00000000-0000-4000-8000-000000000044', 'zoe_kim', 'Zoe Kim', 4],
  ['00000000-0000-4000-8000-000000000045', 'marcus_w', 'Marcus Wallace', 5],
  ['00000000-0000-4000-8000-000000000046', 'priya_r', 'Priya Rao', 6],
  ['00000000-0000-4000-8000-000000000047', 'ben_song', 'Ben Song', 7],
  ['00000000-0000-4000-8000-000000000048', 'aisha_m', 'Aisha Mensah', 8],
  ['00000000-0000-4000-8000-000000000049', 'ethan_l', 'Ethan Larsen', 9],
  ['00000000-0000-4000-8000-000000000050', 'ruby_d', 'Ruby Diallo', 10],
  ['00000000-0000-4000-8000-000000000051', 'noah_ch', 'Noah Chan', 11],
  ['00000000-0000-4000-8000-000000000052', 'iris_g', 'Iris Garza', 12],
  ['00000000-0000-4000-8000-000000000053', 'theo_ah', 'Theo Ahmed', 13],
  ['00000000-0000-4000-8000-000000000054', 'lena_pf', 'Lena Pfeifer', 14],
  ['00000000-0000-4000-8000-000000000055', 'ollie_h', 'Ollie Hart', 16],
  ['00000000-0000-4000-8000-000000000056', 'zara_t', 'Zara Thompson', 17],
  ['00000000-0000-4000-8000-000000000057', 'reyansh_j', 'Reyansh Joshi', 18],
  ['00000000-0000-4000-8000-000000000058', 'harper_e', 'Harper Ellis', 19],
  ['00000000-0000-4000-8000-000000000059', 'caleb_ny', 'Caleb Nyong', 20],
  ['00000000-0000-4000-8000-000000000060', 'maya_z', 'Maya Zhao', 21],
  ['00000000-0000-4000-8000-000000000061', 'diego_v', 'Diego Vega', 22],
  ['00000000-0000-4000-8000-000000000062', 'freya_l', 'Freya Lund', 23],
  ['00000000-0000-4000-8000-000000000063', 'omar_h', 'Omar Haddad', 25],
  ['00000000-0000-4000-8000-000000000064', 'ada_o', 'Ada Okonkwo', 26],
  ['00000000-0000-4000-8000-000000000065', 'sami_ka', 'Sami Karimi', 27],
].map(([id, handle, displayName, imgId]) => ({
  id,
  email: `${handle}@loop.demo`,
  role: 'attendee',
  isHost: false,
  displayName,
  handle,
  avatarUrl: `https://i.pravatar.cc/150?img=${imgId}`,
  homeCity: 'San Francisco',
}))

// Every demo user the seed knows about — attendees fill both social comments
// and sports rosters, roster-players fill only rosters.
const ROSTER_POOL = [...ATTENDEES, ...ROSTER_PLAYERS]

const CATEGORIES = [
  { slug: 'music', name: 'Music', colorHex: '#6D5EFC', icon: 'music-note', sortOrder: 0 },
  { slug: 'nightlife', name: 'Nightlife', colorHex: '#FF2E74', icon: 'moon', sortOrder: 1 },
  { slug: 'sports', name: 'Sports', colorHex: '#16C784', icon: 'trophy', sortOrder: 2 },
  { slug: 'networking', name: 'Networking', colorHex: '#2D8CFF', icon: 'people', sortOrder: 3 },
  { slug: 'food', name: 'Food', colorHex: '#FFB020', icon: 'restaurant', sortOrder: 4 },
  { slug: 'campus', name: 'Campus', colorHex: '#FF7A45', icon: 'school', sortOrder: 5 },
]

const INTERESTS = [
  { slug: 'afrobeats', label: 'Afrobeats', category: 'music', icon: 'headphones', sortOrder: 0 },
  { slug: 'hiphop', label: 'Hip-Hop', category: 'music', icon: 'mic', sortOrder: 1 },
  { slug: 'house', label: 'House / EDM', category: 'music', icon: 'disc', sortOrder: 2 },
  { slug: 'live-bands', label: 'Live Bands', category: 'music', icon: 'guitar', sortOrder: 3 },
  {
    slug: 'rooftop',
    label: 'Rooftop Parties',
    category: 'nightlife',
    icon: 'sparkles',
    sortOrder: 0,
  },
  { slug: 'clubbing', label: 'Clubbing', category: 'nightlife', icon: 'disco-ball', sortOrder: 1 },
  { slug: 'lounges', label: 'Lounges', category: 'nightlife', icon: 'cocktail', sortOrder: 2 },
  { slug: 'day-party', label: 'Day Parties', category: 'nightlife', icon: 'sun', sortOrder: 3 },
  { slug: 'soccer', label: 'Soccer', category: 'sports', icon: 'football', sortOrder: 0 },
  { slug: 'basketball', label: 'Basketball', category: 'sports', icon: 'basketball', sortOrder: 1 },
  { slug: 'volleyball', label: 'Volleyball', category: 'sports', icon: 'volleyball', sortOrder: 2 },
  { slug: 'running', label: 'Running Clubs', category: 'sports', icon: 'footprints', sortOrder: 3 },
  { slug: 'startups', label: 'Startups', category: 'networking', icon: 'rocket', sortOrder: 0 },
  { slug: 'tech', label: 'Tech Meetups', category: 'networking', icon: 'cpu', sortOrder: 1 },
  {
    slug: 'career',
    label: 'Career Fairs',
    category: 'networking',
    icon: 'briefcase',
    sortOrder: 2,
  },
  {
    slug: 'creators',
    label: 'Creator Mixers',
    category: 'networking',
    icon: 'palette',
    sortOrder: 3,
  },
  { slug: 'foodie', label: 'Food Festivals', category: 'food', icon: 'utensils', sortOrder: 0 },
  { slug: 'brunch', label: 'Brunch', category: 'food', icon: 'coffee', sortOrder: 1 },
  { slug: 'popups', label: 'Pop-ups', category: 'food', icon: 'store', sortOrder: 2 },
  { slug: 'tastings', label: 'Tastings', category: 'food', icon: 'wine', sortOrder: 3 },
  {
    slug: 'campus-life',
    label: 'Campus Life',
    category: 'campus',
    icon: 'graduation-cap',
    sortOrder: 0,
  },
  { slug: 'greek', label: 'Greek Life', category: 'campus', icon: 'landmark', sortOrder: 1 },
  { slug: 'clubs-orgs', label: 'Clubs & Orgs', category: 'campus', icon: 'users', sortOrder: 2 },
  { slug: 'study-jams', label: 'Study Jams', category: 'campus', icon: 'book-open', sortOrder: 3 },
]

// Bay Area demo events — real venues, real coordinates
const EVENTS = [
  // ── MUSIC (10 events) ──
  {
    slug: 'afrobeats-warehouse-night',
    title: 'Afrobeats & Amapiano Warehouse Night',
    description:
      'A high-energy night of Afrobeats, Amapiano, and dancehall in a raw warehouse space. Multiple DJs, live percussion, and dancers. Dress to impress.',
    category: 'music',
    venueName: 'The Midway SF',
    address: '900 Marin St, San Francisco, CA 94124',
    city: 'San Francisco, CA',
    lat: 37.7527,
    lng: -122.3876,
    startsAt: '2026-07-18T22:00:00-07:00',
    endsAt: '2026-07-19T03:00:00-07:00',
    priceMin: 25,
    priceMax: 45,
    isFree: false,
    capacity: 500,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',
  },
  {
    slug: 'hiphop-cypher-oakland',
    title: 'Hip-Hop Cypher: Open Mic & Freestyle',
    description:
      'Bring bars or just vibes. Open mic for rappers, poets, and singers. Live DJ, beat battles, and a cipher that goes all night.',
    category: 'music',
    venueName: 'The New Parish',
    address: '1743 San Pablo Ave, Oakland, CA 94612',
    city: 'Oakland, CA',
    lat: 37.8074,
    lng: -122.2729,
    startsAt: '2026-07-20T20:00:00-07:00',
    endsAt: '2026-07-20T23:30:00-07:00',
    priceMin: 10,
    priceMax: 15,
    isFree: false,
    capacity: 200,
    ageMin: 18,
    ageLabel: '18+',
    flyerUrl: 'https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?w=800',
  },
  {
    slug: 'house-music-sunset-cruise',
    title: 'House Music Sunset Cruise',
    description:
      'Deep house and disco on the Bay. Board at Pier 40, sail past the Golden Gate at sunset with two decks of sound.',
    category: 'music',
    venueName: 'Pier 40 - SF Bay Cruise',
    address: 'Pier 40, San Francisco, CA 94107',
    city: 'San Francisco, CA',
    lat: 37.7862,
    lng: -122.3862,
    startsAt: '2026-07-26T17:00:00-07:00',
    endsAt: '2026-07-26T22:00:00-07:00',
    priceMin: 55,
    priceMax: 85,
    isFree: false,
    capacity: 300,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
  },
  {
    slug: 'live-jazz-thursdays',
    title: 'Live Jazz Thursdays',
    description:
      'A rotating cast of Bay Area jazz musicians in an intimate setting. Wine, cocktails, and soulful improvisations every Thursday.',
    category: 'music',
    venueName: "Yoshi's Oakland",
    address: '510 Embarcadero W, Oakland, CA 94607',
    city: 'Oakland, CA',
    lat: 37.7955,
    lng: -122.2789,
    startsAt: '2026-07-17T19:30:00-07:00',
    endsAt: '2026-07-17T22:30:00-07:00',
    priceMin: 20,
    priceMax: 35,
    isFree: false,
    capacity: 150,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=800',
  },
  {
    slug: 'r-and-b-karaoke-night',
    title: 'R&B Karaoke Night',
    description:
      'Sing your heart out to 90s and 2000s R&B classics. Hosted by a live DJ with a full sound system. Drink specials all night.',
    category: 'music',
    venueName: 'Pandora Karaoke & Bar',
    address: '50 Mason St, San Francisco, CA 94102',
    city: 'San Francisco, CA',
    lat: 37.7842,
    lng: -122.4094,
    startsAt: '2026-07-19T21:00:00-07:00',
    endsAt: '2026-07-20T01:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 80,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800',
  },
  {
    slug: 'reggae-in-the-park',
    title: 'Reggae in the Park',
    description:
      'Laid-back Sunday reggae, roots, and dub in Golden Gate Park. Bring blankets, food, and good energy. Family friendly.',
    category: 'music',
    venueName: 'Golden Gate Park - Hellman Hollow',
    address: 'Hellman Hollow, San Francisco, CA 94117',
    city: 'San Francisco, CA',
    lat: 37.7694,
    lng: -122.4862,
    startsAt: '2026-07-27T13:00:00-07:00',
    endsAt: '2026-07-27T18:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 2000,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1508854710579-5cecc3a9ff17?w=800',
  },
  {
    slug: 'latin-salsa-night',
    title: 'Salsa & Bachata Night',
    description:
      'Live salsa band followed by open dancing. Beginner lesson at 8 PM, social dance til midnight. All levels welcome.',
    category: 'music',
    venueName: 'Cafe Cocomo',
    address: '650 Indiana St, San Francisco, CA 94107',
    city: 'San Francisco, CA',
    lat: 37.7615,
    lng: -122.3921,
    startsAt: '2026-07-25T20:00:00-07:00',
    endsAt: '2026-07-26T00:00:00-07:00',
    priceMin: 15,
    priceMax: 20,
    isFree: false,
    capacity: 250,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=800',
  },
  {
    slug: 'indie-rock-showcase',
    title: 'Indie Rock Showcase: 4 Bands Live',
    description:
      'Four up-and-coming Bay Area indie bands share the stage. Guitar-driven, raw, and loud. Doors at 7, first band at 8.',
    category: 'music',
    venueName: 'Bottom of the Hill',
    address: '1233 17th St, San Francisco, CA 94107',
    city: 'San Francisco, CA',
    lat: 37.7654,
    lng: -122.3967,
    startsAt: '2026-07-22T19:00:00-07:00',
    endsAt: '2026-07-22T23:00:00-07:00',
    priceMin: 12,
    priceMax: 18,
    isFree: false,
    capacity: 200,
    ageMin: 18,
    ageLabel: '18+',
    flyerUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800',
  },
  {
    slug: 'open-decks-dj-night',
    title: 'Open Decks: Bring Your USB',
    description:
      'DJ community night — sign up for a 30-min set on club-grade CDJs. All genres welcome. Great way to practice in a live setting.',
    category: 'music',
    venueName: 'F8 Nightclub',
    address: '1192 Folsom St, San Francisco, CA 94103',
    city: 'San Francisco, CA',
    lat: 37.7756,
    lng: -122.4075,
    startsAt: '2026-07-23T21:00:00-07:00',
    endsAt: '2026-07-24T02:00:00-07:00',
    priceMin: 5,
    priceMax: 5,
    isFree: false,
    capacity: 150,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800',
  },
  {
    slug: 'acoustic-open-mic-berkeley',
    title: 'Acoustic Open Mic Night',
    description:
      'Intimate singer-songwriter showcase. Sign up at the door for a 10-min slot. Coffee, pastries, and good listeners.',
    category: 'music',
    venueName: 'Freight & Salvage',
    address: '2020 Addison St, Berkeley, CA 94704',
    city: 'Berkeley, CA',
    lat: 37.8694,
    lng: -122.2681,
    startsAt: '2026-07-21T19:00:00-07:00',
    endsAt: '2026-07-21T22:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 120,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800',
  },

  // ── NIGHTLIFE (8 events) ──
  {
    slug: 'rooftop-sunset-party',
    title: 'Rooftop Sunset Party',
    description:
      'Golden hour vibes 20 stories up. House music, craft cocktails, city views. Smart casual dress code — no sneakers.',
    category: 'nightlife',
    venueName: 'Rooftop at VIA',
    address: '138 King St, San Francisco, CA 94107',
    city: 'San Francisco, CA',
    lat: 37.7768,
    lng: -122.3925,
    startsAt: '2026-07-19T17:00:00-07:00',
    endsAt: '2026-07-19T23:00:00-07:00',
    priceMin: 30,
    priceMax: 50,
    isFree: false,
    capacity: 250,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800',
  },
  {
    slug: 'afro-glow-club-night',
    title: 'AFRO GLOW: Neon Club Night',
    description:
      'Afrobeats x Amapiano club night with neon body paint, glow accessories, and non-stop dancing. 3 rooms of sound.',
    category: 'nightlife',
    venueName: 'Temple Nightclub',
    address: '540 Howard St, San Francisco, CA 94105',
    city: 'San Francisco, CA',
    lat: 37.7875,
    lng: -122.3965,
    startsAt: '2026-07-25T22:00:00-07:00',
    endsAt: '2026-07-26T03:00:00-07:00',
    priceMin: 20,
    priceMax: 40,
    isFree: false,
    capacity: 800,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1545128485-c400e7702796?w=800',
  },
  {
    slug: 'speakeasy-cocktail-night',
    title: 'Speakeasy Cocktail Experience',
    description:
      'Hidden bar, password entry, handcrafted prohibition-era cocktails. Limited to 40 guests per night. Reservations required.',
    category: 'nightlife',
    venueName: 'Bourbon & Branch',
    address: '501 Jones St, San Francisco, CA 94102',
    city: 'San Francisco, CA',
    lat: 37.7861,
    lng: -122.4126,
    startsAt: '2026-07-18T20:00:00-07:00',
    endsAt: '2026-07-18T23:30:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 40,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800',
  },
  {
    slug: 'day-party-oakland-marina',
    title: 'Day Party at the Marina',
    description:
      'Waterfront day party with DJs, food trucks, and games. Chill vibes from noon to sunset. BYOB-friendly (no glass).',
    category: 'nightlife',
    venueName: 'Jack London Square',
    address: 'Jack London Square, Oakland, CA 94607',
    city: 'Oakland, CA',
    lat: 37.7955,
    lng: -122.2795,
    startsAt: '2026-07-26T12:00:00-07:00',
    endsAt: '2026-07-26T18:00:00-07:00',
    priceMin: 15,
    priceMax: 25,
    isFree: false,
    capacity: 400,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800',
  },
  {
    slug: 'latin-club-night',
    title: 'Fuego Fridays: Latin Club Night',
    description:
      'Reggaeton, dembow, and Latin trap all night. $5 tequila shots before midnight. Two dance floors.',
    category: 'nightlife',
    venueName: 'Harlot',
    address: '46 Minna St, San Francisco, CA 94105',
    city: 'San Francisco, CA',
    lat: 37.7879,
    lng: -122.3993,
    startsAt: '2026-07-18T22:00:00-07:00',
    endsAt: '2026-07-19T02:00:00-07:00',
    priceMin: 15,
    priceMax: 25,
    isFree: false,
    capacity: 300,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800',
  },
  {
    slug: 'silent-disco-park',
    title: 'Silent Disco in Dolores Park',
    description:
      'Three channels, three DJs, one park. Grab headphones at the entrance — switch between hip-hop, house, and throwbacks.',
    category: 'nightlife',
    venueName: 'Dolores Park',
    address: 'Dolores Park, San Francisco, CA 94114',
    city: 'San Francisco, CA',
    lat: 37.7596,
    lng: -122.4269,
    startsAt: '2026-07-20T18:00:00-07:00',
    endsAt: '2026-07-20T22:00:00-07:00',
    priceMin: 20,
    priceMax: 20,
    isFree: false,
    capacity: 500,
    ageMin: 18,
    ageLabel: '18+',
    flyerUrl: 'https://images.unsplash.com/photo-1504680177321-2e6a879aac86?w=800',
  },
  {
    slug: 'wine-lounge-friday',
    title: 'Velvet Lounge: Wine & Vibes',
    description:
      'Upscale wine lounge night with neo-soul and lo-fi beats. Curated wine flights, charcuterie boards, candles everywhere.',
    category: 'nightlife',
    venueName: 'Press Club',
    address: '20 Yerba Buena Ln, San Francisco, CA 94103',
    city: 'San Francisco, CA',
    lat: 37.7853,
    lng: -122.4033,
    startsAt: '2026-07-24T19:00:00-07:00',
    endsAt: '2026-07-24T23:00:00-07:00',
    priceMin: 35,
    priceMax: 55,
    isFree: false,
    capacity: 100,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800',
  },
  {
    slug: 'pool-party-oakland',
    title: 'Summer Splash Pool Party',
    description:
      'All-white pool party with DJs, bottle service poolside, and a taco bar. Bring swimwear and sunscreen.',
    category: 'nightlife',
    venueName: 'Claremont Club & Spa',
    address: '41 Tunnel Rd, Berkeley, CA 94705',
    city: 'Berkeley, CA',
    lat: 37.8586,
    lng: -122.2412,
    startsAt: '2026-07-27T13:00:00-07:00',
    endsAt: '2026-07-27T19:00:00-07:00',
    priceMin: 40,
    priceMax: 75,
    isFree: false,
    capacity: 200,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800',
  },

  // ── SPORTS (12 events — includes pickup runs) ──
  {
    slug: 'pickup-soccer-dolores',
    title: 'Sunday Pickup Soccer',
    description:
      'Casual 7v7 on the Dolores Park fields. All skill levels welcome. Bring cleats and water — pinnies provided.',
    category: 'sports',
    venueName: 'Dolores Park Soccer Fields',
    address: 'Dolores Park, San Francisco, CA 94114',
    city: 'San Francisco, CA',
    lat: 37.761,
    lng: -122.427,
    startsAt: '2026-07-20T09:00:00-07:00',
    endsAt: '2026-07-20T11:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 14,
    ageMin: null,
    ageLabel: 'All ages',
    isSports: true,
    flyerUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800',
    sportsDetail: {
      sport: 'Soccer',
      skillLevel: 'all_levels',
      venueSetting: 'outdoor',
      playersNeeded: 14,
      durationMinutes: 120,
      notes: 'Pinnies provided. Bring water.',
    },
    positions: [
      { label: 'Goalkeeper', capacity: 2, sortOrder: 0 },
      { label: 'Defender', capacity: 4, sortOrder: 1 },
      { label: 'Midfielder', capacity: 4, sortOrder: 2 },
      { label: 'Forward', capacity: 4, sortOrder: 3 },
    ],
  },
  {
    slug: 'pickup-basketball-lake-merritt',
    title: 'Pickup Basketball @ Lake Merritt',
    description:
      'Full court 5v5 runs. Winners stay on. Competitive but friendly. Show up ready to play.',
    category: 'sports',
    venueName: 'Lake Merritt Courts',
    address: 'Lakeshore Ave, Oakland, CA 94610',
    city: 'Oakland, CA',
    lat: 37.8023,
    lng: -122.2594,
    startsAt: '2026-07-19T10:00:00-07:00',
    endsAt: '2026-07-19T13:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 10,
    ageMin: null,
    ageLabel: 'All ages',
    isSports: true,
    flyerUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800',
    sportsDetail: {
      sport: 'Basketball',
      skillLevel: 'intermediate',
      venueSetting: 'outdoor',
      playersNeeded: 10,
      durationMinutes: 180,
      notes: 'Winners stay on. Next up calls.',
    },
    positions: [
      { label: 'Guard', capacity: 4, sortOrder: 0 },
      { label: 'Forward', capacity: 4, sortOrder: 1 },
      { label: 'Center', capacity: 2, sortOrder: 2 },
    ],
  },
  {
    slug: 'beach-volleyball-crissy',
    title: 'Beach Volleyball: 4v4 Tournament',
    description:
      'Friendly double-elimination tournament at Crissy Field. Register as a team or solo — we will match you.',
    category: 'sports',
    venueName: 'Crissy Field Beach Courts',
    address: 'Crissy Field, San Francisco, CA 94129',
    city: 'San Francisco, CA',
    lat: 37.8037,
    lng: -122.4651,
    startsAt: '2026-07-26T10:00:00-07:00',
    endsAt: '2026-07-26T15:00:00-07:00',
    priceMin: 10,
    priceMax: 10,
    isFree: false,
    capacity: 16,
    ageMin: null,
    ageLabel: 'All ages',
    isSports: true,
    flyerUrl: 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=800',
    sportsDetail: {
      sport: 'Volleyball',
      skillLevel: 'all_levels',
      venueSetting: 'outdoor',
      playersNeeded: 16,
      durationMinutes: 300,
      notes: '4v4 double elim. Sign up solo or as a team.',
    },
    positions: [
      { label: 'Setter', capacity: 4, sortOrder: 0 },
      { label: 'Hitter', capacity: 8, sortOrder: 1 },
      { label: 'Libero', capacity: 4, sortOrder: 2 },
    ],
  },
  {
    slug: 'morning-run-club-embarcadero',
    title: 'Sunrise Run Club — Embarcadero',
    description:
      '5K along the waterfront at sunrise. All paces welcome — we never leave anyone behind. Coffee after at the Ferry Building.',
    category: 'sports',
    venueName: 'Embarcadero Plaza',
    address: 'Embarcadero, San Francisco, CA 94105',
    city: 'San Francisco, CA',
    lat: 37.7935,
    lng: -122.3938,
    startsAt: '2026-07-21T06:00:00-07:00',
    endsAt: '2026-07-21T07:30:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 30,
    ageMin: null,
    ageLabel: 'All ages',
    isSports: true,
    flyerUrl: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800',
    sportsDetail: {
      sport: 'Running',
      skillLevel: 'all_levels',
      venueSetting: 'outdoor',
      playersNeeded: 30,
      durationMinutes: 90,
      notes: 'All paces. Coffee after at Ferry Building.',
    },
    positions: [
      { label: 'Pace Lead (fast)', capacity: 5, sortOrder: 0 },
      { label: 'Pace Lead (moderate)', capacity: 10, sortOrder: 1 },
      { label: 'Pace Lead (casual)', capacity: 15, sortOrder: 2 },
    ],
  },
  {
    slug: 'pickup-soccer-berkeley',
    title: 'Wednesday Night Soccer',
    description:
      'Midweek 6v6 under the lights on turf. Intermediate and up — expect fast play and quick passing.',
    category: 'sports',
    venueName: 'San Pablo Park Turf Field',
    address: '2800 Park St, Berkeley, CA 94702',
    city: 'Berkeley, CA',
    lat: 37.8615,
    lng: -122.287,
    startsAt: '2026-07-23T19:00:00-07:00',
    endsAt: '2026-07-23T21:00:00-07:00',
    priceMin: 5,
    priceMax: 5,
    isFree: false,
    capacity: 12,
    ageMin: null,
    ageLabel: 'All ages',
    isSports: true,
    flyerUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800',
    sportsDetail: {
      sport: 'Soccer',
      skillLevel: 'intermediate',
      venueSetting: 'outdoor',
      playersNeeded: 12,
      durationMinutes: 120,
      notes: 'Turf field under lights. Intermediate+.',
    },
    positions: [
      { label: 'Goalkeeper', capacity: 2, sortOrder: 0 },
      { label: 'Defender', capacity: 4, sortOrder: 1 },
      { label: 'Midfielder/Forward', capacity: 6, sortOrder: 2 },
    ],
  },
  {
    slug: 'trail-run-tilden',
    title: 'Trail Run: Tilden Park Loop',
    description:
      '8-mile trail loop through Tilden with 1,200ft elevation. Intermediate pace — expect single track and creek crossings.',
    category: 'sports',
    venueName: 'Tilden Regional Park',
    address: 'Tilden Park, Berkeley, CA 94708',
    city: 'Berkeley, CA',
    lat: 37.8924,
    lng: -122.2461,
    startsAt: '2026-07-27T07:00:00-07:00',
    endsAt: '2026-07-27T09:30:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 20,
    ageMin: null,
    ageLabel: 'All ages',
    isSports: true,
    flyerUrl: 'https://images.unsplash.com/photo-1486218119243-13883505764c?w=800',
    sportsDetail: {
      sport: 'Running',
      skillLevel: 'intermediate',
      venueSetting: 'outdoor',
      playersNeeded: 20,
      durationMinutes: 150,
      notes: '8 miles, 1200ft gain. Trail shoes recommended.',
    },
    positions: [
      { label: 'Front pack (fast)', capacity: 5, sortOrder: 0 },
      { label: 'Middle pack', capacity: 10, sortOrder: 1 },
      { label: 'Sweep (back)', capacity: 5, sortOrder: 2 },
    ],
  },
  {
    slug: 'indoor-basketball-league',
    title: 'Co-ed Indoor Basketball League',
    description:
      'Weekly league games every Saturday. 5v5, co-ed teams, refs, and scoreboards. Register individually or with a squad.',
    category: 'sports',
    venueName: 'Oakland YMCA',
    address: '2350 Broadway, Oakland, CA 94612',
    city: 'Oakland, CA',
    lat: 37.8128,
    lng: -122.2682,
    startsAt: '2026-07-19T14:00:00-07:00',
    endsAt: '2026-07-19T17:00:00-07:00',
    priceMin: 15,
    priceMax: 15,
    isFree: false,
    capacity: 10,
    ageMin: 18,
    ageLabel: '18+',
    isSports: true,
    flyerUrl: 'https://images.unsplash.com/photo-1559692048-79a3f837883d?w=800',
    sportsDetail: {
      sport: 'Basketball',
      skillLevel: 'all_levels',
      venueSetting: 'indoor',
      playersNeeded: 10,
      durationMinutes: 180,
      notes: 'Co-ed. Refs provided. Bring light + dark jerseys.',
    },
    positions: [
      { label: 'Guard', capacity: 4, sortOrder: 0 },
      { label: 'Forward', capacity: 4, sortOrder: 1 },
      { label: 'Center', capacity: 2, sortOrder: 2 },
    ],
  },
  {
    slug: 'pickup-soccer-san-jose',
    title: 'Saturday Morning 5-a-Side',
    description:
      'Fast-paced small-sided games in San Jose. Rotate teams every 15 min. All levels but expect hustle.',
    category: 'sports',
    venueName: 'Almaden Lake Park',
    address: '6099 Winfield Blvd, San Jose, CA 95120',
    city: 'San Jose, CA',
    lat: 37.2452,
    lng: -121.8599,
    startsAt: '2026-07-26T08:00:00-07:00',
    endsAt: '2026-07-26T10:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 10,
    ageMin: null,
    ageLabel: 'All ages',
    isSports: true,
    flyerUrl: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800',
    sportsDetail: {
      sport: 'Soccer',
      skillLevel: 'all_levels',
      venueSetting: 'outdoor',
      playersNeeded: 10,
      durationMinutes: 120,
      notes: '5v5, rotating teams every 15 min.',
    },
    positions: [
      { label: 'Goalkeeper', capacity: 2, sortOrder: 0 },
      { label: 'Field Player', capacity: 8, sortOrder: 1 },
    ],
  },
  {
    slug: 'yoga-lake-merritt',
    title: 'Sunset Yoga by the Lake',
    description:
      'Free community vinyasa flow at Lake Merritt. Bring your own mat. Beginners welcome — instructor guides all levels.',
    category: 'sports',
    venueName: 'Lake Merritt Amphitheater',
    address: 'Lake Merritt, Oakland, CA 94606',
    city: 'Oakland, CA',
    lat: 37.8008,
    lng: -122.2603,
    startsAt: '2026-07-22T18:00:00-07:00',
    endsAt: '2026-07-22T19:15:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 50,
    ageMin: null,
    ageLabel: 'All ages',
    isSports: false,
    flyerUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800',
  },
  {
    slug: 'climbing-meetup-berkeley',
    title: 'Bouldering Meetup — Beginners Welcome',
    description:
      'Indoor bouldering session for all levels. Shoes and chalk included in day pass. We will teach you the basics.',
    category: 'sports',
    venueName: 'Ironworks Berkeley',
    address: '800 Potter St, Berkeley, CA 94710',
    city: 'Berkeley, CA',
    lat: 37.8582,
    lng: -122.2916,
    startsAt: '2026-07-24T18:30:00-07:00',
    endsAt: '2026-07-24T20:30:00-07:00',
    priceMin: 20,
    priceMax: 20,
    isFree: false,
    capacity: 25,
    ageMin: null,
    ageLabel: 'All ages',
    isSports: false,
    flyerUrl: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800',
  },
  {
    slug: 'tennis-doubles-oakland',
    title: 'Tennis Doubles Mixer',
    description:
      'Rotate partners every set. 2 hours on hard courts. Intermediate level — you should be able to rally consistently.',
    category: 'sports',
    venueName: 'Davie Tennis Stadium',
    address: '198 Oak St, Oakland, CA 94607',
    city: 'Oakland, CA',
    lat: 37.8041,
    lng: -122.2663,
    startsAt: '2026-07-25T17:00:00-07:00',
    endsAt: '2026-07-25T19:00:00-07:00',
    priceMin: 10,
    priceMax: 10,
    isFree: false,
    capacity: 8,
    ageMin: null,
    ageLabel: 'All ages',
    isSports: true,
    flyerUrl: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800',
    sportsDetail: {
      sport: 'Tennis',
      skillLevel: 'intermediate',
      venueSetting: 'outdoor',
      playersNeeded: 8,
      durationMinutes: 120,
      notes: 'Doubles mixer — rotate partners every set.',
    },
    positions: [{ label: 'Player', capacity: 8, sortOrder: 0 }],
  },
  {
    slug: 'morning-run-oakland-hills',
    title: 'Oakland Hills Run Club',
    description:
      'Challenging hill repeats in the Oakland Hills. 6 miles, 800ft gain. Meet at Montclair Village and head up.',
    category: 'sports',
    venueName: 'Montclair Village',
    address: 'Mountain Blvd, Oakland, CA 94611',
    city: 'Oakland, CA',
    lat: 37.8297,
    lng: -122.2131,
    startsAt: '2026-07-22T06:30:00-07:00',
    endsAt: '2026-07-22T08:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 15,
    ageMin: null,
    ageLabel: 'All ages',
    isSports: true,
    flyerUrl: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800',
    sportsDetail: {
      sport: 'Running',
      skillLevel: 'advanced',
      venueSetting: 'outdoor',
      playersNeeded: 15,
      durationMinutes: 90,
      notes: '6 miles, 800ft gain. Hill repeats.',
    },
    positions: [{ label: 'Runner', capacity: 15, sortOrder: 0 }],
  },

  // ── NETWORKING (8 events) ──
  {
    slug: 'startup-pitch-night',
    title: 'Startup Pitch Night: 5 Founders, 5 Minutes',
    description:
      'Five early-stage founders pitch to a panel of VCs and angels. Audience votes for the crowd favorite. Networking mixer after.',
    category: 'networking',
    venueName: 'Galvanize SF',
    address: '44 Tehama St, San Francisco, CA 94105',
    city: 'San Francisco, CA',
    lat: 37.7873,
    lng: -122.3966,
    startsAt: '2026-07-22T18:30:00-07:00',
    endsAt: '2026-07-22T21:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 150,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800',
  },
  {
    slug: 'tech-meetup-ai-agents',
    title: 'SF AI Meetup: Building Agents That Work',
    description:
      'Lightning talks on agent architectures, tool use, and evaluation. Speakers from Anthropic, LangChain, and indie builders.',
    category: 'networking',
    venueName: 'GitHub HQ',
    address: '88 Colin P. Kelly Jr St, San Francisco, CA 94107',
    city: 'San Francisco, CA',
    lat: 37.7821,
    lng: -122.3912,
    startsAt: '2026-07-24T18:00:00-07:00',
    endsAt: '2026-07-24T20:30:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 200,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800',
  },
  {
    slug: 'career-fair-oakland',
    title: 'Oakland Tech Career Fair',
    description:
      '30+ Bay Area companies hiring engineers, designers, and PMs. Bring resumes, dress smart casual. On-the-spot interviews.',
    category: 'networking',
    venueName: 'Oakland Convention Center',
    address: '550 10th St, Oakland, CA 94607',
    city: 'Oakland, CA',
    lat: 37.8014,
    lng: -122.2737,
    startsAt: '2026-07-23T10:00:00-07:00',
    endsAt: '2026-07-23T16:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 500,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1560439514-4e9645039924?w=800',
  },
  {
    slug: 'creator-mixer-sf',
    title: 'Creator Mixer: Photographers × Videographers',
    description:
      'Network with Bay Area creatives — photographers, videographers, editors. Portfolio reviews, gear talk, and collaboration matchmaking.',
    category: 'networking',
    venueName: 'Minnesota Street Project',
    address: '1275 Minnesota St, San Francisco, CA 94107',
    city: 'San Francisco, CA',
    lat: 37.7527,
    lng: -122.3899,
    startsAt: '2026-07-20T14:00:00-07:00',
    endsAt: '2026-07-20T17:00:00-07:00',
    priceMin: 10,
    priceMax: 10,
    isFree: false,
    capacity: 80,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800',
  },
  {
    slug: 'women-in-tech-brunch',
    title: 'Women in Tech Brunch',
    description:
      'Casual brunch meetup for women and non-binary folks in tech. Mentorship circles, job leads, and real talk over mimosas.',
    category: 'networking',
    venueName: 'Foreign Cinema',
    address: '2534 Mission St, San Francisco, CA 94110',
    city: 'San Francisco, CA',
    lat: 37.7561,
    lng: -122.4192,
    startsAt: '2026-07-27T11:00:00-07:00',
    endsAt: '2026-07-27T14:00:00-07:00',
    priceMin: 35,
    priceMax: 35,
    isFree: false,
    capacity: 60,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800',
  },
  {
    slug: 'freelancer-coworking-day',
    title: 'Freelancer Co-working Day',
    description:
      'Work alongside other freelancers and indie hackers. Free wifi, coffee, and an optional accountability circle at 3 PM.',
    category: 'networking',
    venueName: 'The Village Oakland',
    address: '1414 Oakland Blvd, Oakland, CA 94612',
    city: 'Oakland, CA',
    lat: 37.8095,
    lng: -122.2692,
    startsAt: '2026-07-21T09:00:00-07:00',
    endsAt: '2026-07-21T17:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 40,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
  },
  {
    slug: 'design-critique-night',
    title: 'Design Critique Night',
    description:
      'Bring a project and get constructive feedback from senior designers. UX, UI, brand — anything visual. Pizza provided.',
    category: 'networking',
    venueName: 'Figma SF',
    address: '760 Market St, San Francisco, CA 94102',
    city: 'San Francisco, CA',
    lat: 37.7862,
    lng: -122.4051,
    startsAt: '2026-07-25T18:30:00-07:00',
    endsAt: '2026-07-25T21:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 50,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=800',
  },
  {
    slug: 'black-founders-mixer',
    title: 'Black Founders Happy Hour',
    description:
      'Monthly mixer for Black entrepreneurs and allies. Casual conversations, warm introductions, and community over cocktails.',
    category: 'networking',
    venueName: 'Sobre Mesa',
    address: '468 8th St, Oakland, CA 94607',
    city: 'Oakland, CA',
    lat: 37.7988,
    lng: -122.2756,
    startsAt: '2026-07-24T17:30:00-07:00',
    endsAt: '2026-07-24T20:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 75,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=800',
  },

  // ── FOOD (7 events) ──
  {
    slug: 'sf-street-food-festival',
    title: 'SF Street Food Festival',
    description:
      '40+ food vendors from around the Bay. Tacos, bao, jerk chicken, vegan bowls — something for everyone. Live music all day.',
    category: 'food',
    venueName: 'SoMa StrEat Food Park',
    address: '428 11th St, San Francisco, CA 94103',
    city: 'San Francisco, CA',
    lat: 37.7709,
    lng: -122.4133,
    startsAt: '2026-07-26T11:00:00-07:00',
    endsAt: '2026-07-26T19:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 1000,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
  },
  {
    slug: 'bottomless-brunch-oakland',
    title: 'Bottomless Brunch & Day Vibes',
    description:
      'Two hours of unlimited mimosas, bellinis, and a full brunch menu. DJ spinning R&B and Afrobeats on the patio.',
    category: 'food',
    venueName: 'Kingston 11',
    address: '2270 Telegraph Ave, Oakland, CA 94612',
    city: 'Oakland, CA',
    lat: 37.8128,
    lng: -122.2676,
    startsAt: '2026-07-20T11:00:00-07:00',
    endsAt: '2026-07-20T15:00:00-07:00',
    priceMin: 45,
    priceMax: 55,
    isFree: false,
    capacity: 80,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=800',
  },
  {
    slug: 'popup-dumpling-bar',
    title: 'Pop-up Dumpling Bar',
    description:
      'One-night-only dumpling pop-up featuring hand-folded soup dumplings, chili oil wontons, and pan-fried gyoza. BYOB.',
    category: 'food',
    venueName: 'The Civic Kitchen',
    address: '812 Valencia St, San Francisco, CA 94110',
    city: 'San Francisco, CA',
    lat: 37.7589,
    lng: -122.4215,
    startsAt: '2026-07-23T18:00:00-07:00',
    endsAt: '2026-07-23T21:00:00-07:00',
    priceMin: 35,
    priceMax: 35,
    isFree: false,
    capacity: 30,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=800',
  },
  {
    slug: 'natural-wine-tasting',
    title: 'Natural Wine Tasting: Orange Wines',
    description:
      'Guided tasting of 6 natural/orange wines from small European producers. Paired with artisan cheeses. Educational and fun.',
    category: 'food',
    venueName: 'Ordinaire Wine Bar',
    address: '3354 Grand Ave, Oakland, CA 94610',
    city: 'Oakland, CA',
    lat: 37.8113,
    lng: -122.2503,
    startsAt: '2026-07-24T19:00:00-07:00',
    endsAt: '2026-07-24T21:00:00-07:00',
    priceMin: 40,
    priceMax: 40,
    isFree: false,
    capacity: 25,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=800',
  },
  {
    slug: 'taco-tuesday-crawl',
    title: 'Taco Tuesday Crawl: Mission District',
    description:
      'Hit 4 taquerias in the Mission with a crew. Walking tour, unlimited tacos at each stop, mezcal shots optional.',
    category: 'food',
    venueName: 'Mission District (meeting point)',
    address: '24th & Mission BART, San Francisco, CA 94110',
    city: 'San Francisco, CA',
    lat: 37.7522,
    lng: -122.4182,
    startsAt: '2026-07-21T18:00:00-07:00',
    endsAt: '2026-07-21T21:00:00-07:00',
    priceMin: 30,
    priceMax: 30,
    isFree: false,
    capacity: 20,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800',
  },
  {
    slug: 'vegan-supper-club',
    title: 'Underground Vegan Supper Club',
    description:
      'Secret location revealed 24 hours before. 5-course plant-based tasting menu by a Michelin-trained chef. Wine pairing available.',
    category: 'food',
    venueName: 'Secret Location (SF)',
    address: 'Location revealed 24h before event',
    city: 'San Francisco, CA',
    lat: 37.7749,
    lng: -122.4194,
    startsAt: '2026-07-25T19:00:00-07:00',
    endsAt: '2026-07-25T22:00:00-07:00',
    priceMin: 75,
    priceMax: 95,
    isFree: false,
    capacity: 24,
    ageMin: 21,
    ageLabel: '21+',
    flyerUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800',
  },
  {
    slug: 'coffee-cupping-berkeley',
    title: 'Coffee Cupping & Latte Art Workshop',
    description:
      'Learn to taste coffee like a pro — guided cupping of 5 single-origin beans, then latte art practice on a La Marzocca.',
    category: 'food',
    venueName: 'Alchemy Collective Cafe',
    address: '1741 Alcatraz Ave, Berkeley, CA 94703',
    city: 'Berkeley, CA',
    lat: 37.8519,
    lng: -122.2791,
    startsAt: '2026-07-21T10:00:00-07:00',
    endsAt: '2026-07-21T12:00:00-07:00',
    priceMin: 25,
    priceMax: 25,
    isFree: false,
    capacity: 15,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800',
  },

  // ── CAMPUS (5 events) ──
  {
    slug: 'cal-welcome-block-party',
    title: 'Cal Welcome Week Block Party',
    description:
      'Kick off the semester with a block party on Sproul Plaza. Free food, club sign-ups, live DJ, and giveaways.',
    category: 'campus',
    venueName: 'Sproul Plaza - UC Berkeley',
    address: 'Sproul Plaza, Berkeley, CA 94720',
    city: 'Berkeley, CA',
    lat: 37.8697,
    lng: -122.259,
    startsAt: '2026-08-18T12:00:00-07:00',
    endsAt: '2026-08-18T17:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 1000,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=800',
  },
  {
    slug: 'greek-life-mixer',
    title: 'Greek Life Fall Rush Mixer',
    description:
      'Meet members from 10+ fraternities and sororities. Casual mixer format — no commitment, just conversation and free food.',
    category: 'campus',
    venueName: 'UC Berkeley Greek Theatre Lawn',
    address: 'Gayley Rd, Berkeley, CA 94720',
    city: 'Berkeley, CA',
    lat: 37.8736,
    lng: -122.2541,
    startsAt: '2026-08-20T17:00:00-07:00',
    endsAt: '2026-08-20T20:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 300,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1529070538774-1843cb3265df?w=800',
  },
  {
    slug: 'study-jam-midterms',
    title: 'Study Jam: Midterm Prep Marathon',
    description:
      'All-day study session with free coffee, snacks, and peer tutors for EECS, Stats, and Econ. Quiet zones + group tables.',
    category: 'campus',
    venueName: 'Moffitt Library - UC Berkeley',
    address: 'Moffitt Library, Berkeley, CA 94720',
    city: 'Berkeley, CA',
    lat: 37.8725,
    lng: -122.2607,
    startsAt: '2026-10-15T09:00:00-07:00',
    endsAt: '2026-10-15T21:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 100,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800',
  },
  {
    slug: 'film-club-screening',
    title: 'Film Club: Outdoor Movie Night',
    description:
      'Free outdoor screening on the lawn — this week: "Moonlight." Bring blankets. Popcorn and hot cocoa provided.',
    category: 'campus',
    venueName: 'Faculty Glade - UC Berkeley',
    address: 'Faculty Glade, Berkeley, CA 94720',
    city: 'Berkeley, CA',
    lat: 37.8718,
    lng: -122.2574,
    startsAt: '2026-08-22T20:30:00-07:00',
    endsAt: '2026-08-22T23:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 200,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800',
  },
  {
    slug: 'hackathon-weekend',
    title: 'Cal Hacks: 36-Hour Hackathon',
    description:
      'Build something in 36 hours. $10K in prizes. Free meals, swag, and mentorship from industry engineers. Solo or teams of 4.',
    category: 'campus',
    venueName: 'Pauley Ballroom - UC Berkeley',
    address: 'MLK Student Union, Berkeley, CA 94720',
    city: 'Berkeley, CA',
    lat: 37.8693,
    lng: -122.2604,
    startsAt: '2026-09-19T18:00:00-07:00',
    endsAt: '2026-09-21T06:00:00-07:00',
    priceMin: 0,
    priceMax: 0,
    isFree: true,
    capacity: 500,
    ageMin: null,
    ageLabel: 'All ages',
    flyerUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800',
  },
]

// Social posts + stories for the SocialFeed (work-plan #29). All authored by the
// real ORGANIZER user (the only DB-backed account), each linked to one of its
// events by slug so the PostCard can deep-link. Fixed ids keep reseeds
// idempotent. like_count/comment_count start at 0 and are maintained live by
// the /posts/:id/like + /comments endpoints.
const POSTS = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    eventSlug: 'afrobeats-warehouse-night',
    kind: 'flyer',
    imageUrl: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1000&q=80',
    caption:
      'Warehouse doors open Saturday 🌆🔥 Amapiano x Afrobeats all night. Tap in before we cap it.',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    eventSlug: 'afro-glow-club-night',
    kind: 'update',
    imageUrl: 'https://images.unsplash.com/photo-1545128485-c400e7702796?w=1000&q=80',
    caption: 'AFRO GLOW is nearly sold out — neon paint bar restocked. Last release tickets live.',
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    eventSlug: 'rooftop-sunset-party',
    kind: 'recap',
    imageUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1000&q=80',
    caption: 'Golden hour hit different last week ☀️ Rooftop is back this Saturday. Smart casual.',
  },
  {
    id: '00000000-0000-4000-8000-000000000104',
    eventSlug: 'latin-club-night',
    kind: 'flyer',
    imageUrl: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=1000&q=80',
    caption:
      'Fuego Fridays 🔥 Reggaeton, dembow, and Latin trap all night. $5 tequila shots before midnight.',
  },
  {
    id: '00000000-0000-4000-8000-000000000105',
    eventSlug: 'day-party-oakland-marina',
    kind: 'update',
    imageUrl: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1000&q=80',
    caption:
      'Marina day party lineup dropping tomorrow ⛵️ Food trucks locked in, DJs going deep til sundown.',
  },
  {
    id: '00000000-0000-4000-8000-000000000106',
    eventSlug: 'pool-party-oakland',
    kind: 'flyer',
    imageUrl: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=1000&q=80',
    caption:
      'All-white pool party 🤍 Bottle service poolside, taco bar, live DJs. Bring swimwear + shades.',
  },
  {
    id: '00000000-0000-4000-8000-000000000107',
    eventSlug: 'silent-disco-park',
    kind: 'recap',
    imageUrl: 'https://images.unsplash.com/photo-1504680177321-2e6a879aac86?w=1000&q=80',
    caption:
      'Dolores Park silent disco was unreal 🎧 Three channels, one park, zero noise complaints.',
  },
  {
    id: '00000000-0000-4000-8000-000000000108',
    eventSlug: 'speakeasy-cocktail-night',
    kind: 'update',
    imageUrl: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=1000&q=80',
    caption:
      'Speakeasy is capped at 40 tonight 🍸 Password drops to reservation holders at 6pm sharp.',
  },
]

// Ephemeral stories (StoriesRow). expires_at is set in main() so they stay live
// relative to the reseed time (24h window).
const STORIES = [
  {
    id: '00000000-0000-4000-8000-000000000201',
    eventSlug: 'afrobeats-warehouse-night',
    mediaUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80',
    caption: 'Soundcheck done ✅ tonight is going to be special',
  },
  {
    id: '00000000-0000-4000-8000-000000000202',
    eventSlug: 'afro-glow-club-night',
    mediaUrl: 'https://images.unsplash.com/photo-1545128485-c400e7702796?w=800&q=80',
    caption: 'Neon room is ready 💜',
  },
  {
    id: '00000000-0000-4000-8000-000000000203',
    eventSlug: 'rooftop-sunset-party',
    mediaUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&q=80',
    caption: 'Rooftop view check — golden hour incoming ☀️',
  },
  {
    id: '00000000-0000-4000-8000-000000000204',
    eventSlug: 'pool-party-oakland',
    mediaUrl: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800&q=80',
    caption: 'Pool sparkling 💦 all-white fits only',
  },
  {
    id: '00000000-0000-4000-8000-000000000205',
    eventSlug: 'latin-club-night',
    mediaUrl: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800&q=80',
    caption: 'Fuego floor lit 🔥🔥',
  },
]

// Comments on the seeded posts. Each row is (post → attendee → body), and by
// invariant the attendee is NEVER the post's author (posts are all authored by
// ORGANIZER, comments always come from an ATTENDEES row). Fixed ids keep the
// social feed stable across reseeds so screenshots don't churn.
const POST_COMMENTS = [
  // afrobeats-warehouse-night (post 101)
  {
    id: '00000000-0000-4000-8000-000000000301',
    postId: '00000000-0000-4000-8000-000000000101',
    authorId: '00000000-0000-4000-8000-000000000031',
    body: 'been waiting for this all summer 🔥',
  },
  {
    id: '00000000-0000-4000-8000-000000000302',
    postId: '00000000-0000-4000-8000-000000000101',
    authorId: '00000000-0000-4000-8000-000000000033',
    body: 'grabbing tix rn, who else pulling up?',
  },
  // afro-glow-club-night (post 102)
  {
    id: '00000000-0000-4000-8000-000000000303',
    postId: '00000000-0000-4000-8000-000000000102',
    authorId: '00000000-0000-4000-8000-000000000035',
    body: 'neon paint bar sold me. see y’all Saturday 💜',
  },
  {
    id: '00000000-0000-4000-8000-000000000304',
    postId: '00000000-0000-4000-8000-000000000102',
    authorId: '00000000-0000-4000-8000-000000000032',
    body: 'last release is stressing me out lol',
  },
  // rooftop-sunset-party (post 103)
  {
    id: '00000000-0000-4000-8000-000000000305',
    postId: '00000000-0000-4000-8000-000000000103',
    authorId: '00000000-0000-4000-8000-000000000034',
    body: 'last one was elite, view was crazy',
  },
  // latin-club-night (post 104)
  {
    id: '00000000-0000-4000-8000-000000000306',
    postId: '00000000-0000-4000-8000-000000000104',
    authorId: '00000000-0000-4000-8000-000000000035',
    body: 'dembow all night, count me in 💃',
  },
  {
    id: '00000000-0000-4000-8000-000000000307',
    postId: '00000000-0000-4000-8000-000000000104',
    authorId: '00000000-0000-4000-8000-000000000031',
    body: 'those tequila shots though 🥲',
  },
  // day-party-oakland-marina (post 105)
  {
    id: '00000000-0000-4000-8000-000000000308',
    postId: '00000000-0000-4000-8000-000000000105',
    authorId: '00000000-0000-4000-8000-000000000032',
    body: 'which food trucks?? asking for a friend 🌮',
  },
  // pool-party-oakland (post 106)
  {
    id: '00000000-0000-4000-8000-000000000309',
    postId: '00000000-0000-4000-8000-000000000106',
    authorId: '00000000-0000-4000-8000-000000000033',
    body: 'all-white fit already picked out 🤍',
  },
  {
    id: '00000000-0000-4000-8000-000000000310',
    postId: '00000000-0000-4000-8000-000000000106',
    authorId: '00000000-0000-4000-8000-000000000034',
    body: 'taco bar sealed it. see you poolside',
  },
  // silent-disco-park (post 107)
  {
    id: '00000000-0000-4000-8000-000000000311',
    postId: '00000000-0000-4000-8000-000000000107',
    authorId: '00000000-0000-4000-8000-000000000031',
    body: 'the throwbacks channel was unmatched 🎧',
  },
  // speakeasy-cocktail-night (post 108)
  {
    id: '00000000-0000-4000-8000-000000000312',
    postId: '00000000-0000-4000-8000-000000000108',
    authorId: '00000000-0000-4000-8000-000000000035',
    body: 'reservation locked. what’s the password gonna be 👀',
  },
]

async function main() {
  console.log('Seeding categories...')
  for (const cat of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, colorHex: cat.colorHex, icon: cat.icon, sortOrder: cat.sortOrder },
      create: cat,
    })
  }

  const cats = await prisma.category.findMany()
  const catBySlug = Object.fromEntries(cats.map((c) => [c.slug, c.id]))

  console.log('Seeding demo organizer users...')
  for (const org of ALL_ORGANIZERS) {
    await prisma.user.upsert({
      where: { id: org.id },
      update: org,
      create: org,
    })
  }

  console.log('Seeding demo attendee users...')
  for (const attendee of ROSTER_POOL) {
    await prisma.user.upsert({
      where: { id: attendee.id },
      update: attendee,
      create: attendee,
    })
  }

  console.log('Seeding interests...')
  for (const { category, ...data } of INTERESTS) {
    await prisma.interest.upsert({
      where: { slug: data.slug },
      update: { ...data, categoryId: catBySlug[category] },
      create: { ...data, categoryId: catBySlug[category] },
    })
  }

  console.log('Seeding events...')
  let eventCount = 0
  // Pre-compute seeded RSVP counts per event so we can (a) write them onto the
  // event rows and (b) fill the sports_details.players_signed_up counters to
  // match — otherwise a sports card would show a full-looking crowd on the
  // event but zero on the roster meter.
  const seededByslug = new Map(EVENTS.map((e) => [e.slug, seedCounts(e)]))
  for (const evt of EVENTS) {
    const { category, sportsDetail, positions, ...eventData } = evt

    // Every seeded category has a dedicated organizer user so the "hosted by"
    // slot on every card resolves to a real DB user (uniform social proof).
    // organizerId is set in both create + update so reseeds stay correct.
    const organizerId = ORGANIZER_BY_CATEGORY[category] ?? null

    const { rsvpCount, saveCount } = seededByslug.get(evt.slug)

    const created = await prisma.event.upsert({
      where: {
        source_externalId: { source: 'native', externalId: evt.slug },
      },
      update: {
        ...eventData,
        categoryId: catBySlug[category],
        organizerId,
        status: 'published',
        source: 'native',
        externalId: evt.slug,
        publishedAt: new Date(),
        startsAt: new Date(evt.startsAt),
        endsAt: evt.endsAt ? new Date(evt.endsAt) : null,
        isSports: evt.isSports || false,
        rsvpCount,
        saveCount,
      },
      create: {
        ...eventData,
        categoryId: catBySlug[category],
        organizerId,
        status: 'published',
        source: 'native',
        externalId: evt.slug,
        publishedAt: new Date(),
        startsAt: new Date(evt.startsAt),
        endsAt: evt.endsAt ? new Date(evt.endsAt) : null,
        isSports: evt.isSports || false,
        rsvpCount,
        saveCount,
      },
    })

    if (sportsDetail && positions) {
      // Pickup runs display a "N / needed" roster meter fed by playersSignedUp.
      // Seed it to a plausible fraction of the required roster so the sports
      // card doesn't read as empty on first load; capped at playersNeeded to
      // preserve the run's capacity invariant.
      const playersSignedUp = Math.min(
        sportsDetail.playersNeeded,
        Math.max(1, Math.round(sportsDetail.playersNeeded * 0.65)),
      )
      await prisma.sportsDetail.upsert({
        where: { eventId: created.id },
        update: {
          ...sportsDetail,
          playersSignedUp,
        },
        create: {
          eventId: created.id,
          ...sportsDetail,
          playersSignedUp,
        },
      })

      for (const pos of positions) {
        await prisma.sportsPosition.upsert({
          where: {
            sportsDetailId_label: {
              sportsDetailId: created.id,
              label: pos.label,
            },
          },
          update: { capacity: pos.capacity, sortOrder: pos.sortOrder },
          create: {
            sportsDetailId: created.id,
            label: pos.label,
            capacity: pos.capacity,
            sortOrder: pos.sortOrder,
          },
        })
      }

      // Materialize the "N signed up" number as real RosterEntry rows so the
      // position picker's per-slot open/full state matches the counter. Without
      // this, the meter shows "8/12" while the grid renders 12 open slots
      // because the roster table is empty. We fill positions in sort order,
      // spreading claimants (round-robin per slot index) so a 4-position roster
      // reads as evenly filled rather than "first position full, rest empty".
      const dbPositions = await prisma.sportsPosition.findMany({
        where: { sportsDetailId: created.id },
        orderBy: { sortOrder: 'asc' },
      })
      await prisma.rosterEntry.deleteMany({ where: { eventId: created.id } })
      // Deterministic attendee rotation seeded off the event slug so the same
      // slug always yields the same roster — helps demos stay stable and lets
      // us assign multiple runs without one attendee monopolizing every slot.
      const slugHash = evt.slug.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
      // Emit (position, slotNumber) pairs interleaved by slot index so we hit
      // slot 1 of every position before slot 2, etc. — that keeps the picker
      // showing a couple open slots per position for realistic runs.
      const slotPlan = []
      const maxCap = dbPositions.reduce((m, p) => Math.max(m, p.capacity), 0)
      for (let slotIdx = 1; slotIdx <= maxCap; slotIdx++) {
        for (const p of dbPositions) {
          if (slotIdx <= p.capacity) slotPlan.push({ position: p, slotNumber: slotIdx })
        }
      }
      const rosterRows = []
      for (let i = 0; i < playersSignedUp && i < slotPlan.length; i++) {
        const player = ROSTER_POOL[(slugHash + i) % ROSTER_POOL.length]
        rosterRows.push({
          eventId: created.id,
          sportsDetailId: created.id,
          sportsPositionId: slotPlan[i].position.id,
          userId: player.id,
          slotNumber: slotPlan[i].slotNumber,
          status: 'claimed',
        })
      }
      // A user can't hold two live spots on the same run (partial unique index).
      // ROSTER_POOL is sized comfortably above the largest run (30), so this
      // rarely trips — but de-dupe by userId so a seed collision quietly lands
      // fewer roster rows than playersSignedUp and we sync the counter to match
      // rather than the meter claiming more players than actual roster rows.
      const seenUsers = new Set()
      const uniqueRows = rosterRows.filter((r) => {
        if (seenUsers.has(r.userId)) return false
        seenUsers.add(r.userId)
        return true
      })
      if (uniqueRows.length) {
        await prisma.rosterEntry.createMany({ data: uniqueRows, skipDuplicates: true })
      }
      if (uniqueRows.length !== playersSignedUp) {
        await prisma.sportsDetail.update({
          where: { eventId: created.id },
          data: { playersSignedUp: uniqueRows.length },
        })
      }
    }

    eventCount++
  }

  // Resolve event ids by slug (externalId) so posts/stories can link to them.
  console.log('Seeding social posts + stories...')
  const eventBySlug = Object.fromEntries(
    (
      await prisma.event.findMany({
        where: { source: 'native' },
        select: { id: true, externalId: true },
      })
    ).map((e) => [e.externalId, e.id]),
  )

  // Denormalized comment counts per post — mirror the seeded POST_COMMENTS onto
  // Post.commentCount so the SocialFeed header + PostCard render the correct
  // count without a JOIN. (The live /comments endpoint keeps this in sync.)
  const commentCountByPostId = POST_COMMENTS.reduce((acc, c) => {
    acc[c.postId] = (acc[c.postId] ?? 0) + 1
    return acc
  }, {})

  for (const p of POSTS) {
    const data = {
      authorId: ORGANIZER.id,
      eventId: eventBySlug[p.eventSlug] ?? null,
      kind: p.kind,
      imageUrl: p.imageUrl,
      caption: p.caption,
      commentCount: commentCountByPostId[p.id] ?? 0,
    }
    await prisma.post.upsert({ where: { id: p.id }, update: data, create: { id: p.id, ...data } })
  }

  // Comments on those posts. Authored by attendees (never by the post's author).
  for (const c of POST_COMMENTS) {
    const data = {
      authorId: c.authorId,
      postId: c.postId,
      body: c.body,
    }
    await prisma.comment.upsert({
      where: { id: c.id },
      update: data,
      create: { id: c.id, ...data },
    })
  }

  const storyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  for (const s of STORIES) {
    const data = {
      authorId: ORGANIZER.id,
      eventId: eventBySlug[s.eventSlug] ?? null,
      mediaUrl: s.mediaUrl,
      caption: s.caption,
      expiresAt: storyExpiresAt,
    }
    await prisma.story.upsert({
      where: { id: s.id },
      update: data,
      create: { id: s.id, ...data },
    })
  }

  console.log(
    `Done — ${CATEGORIES.length} categories, ${INTERESTS.length} interests, ${eventCount} events, ${ATTENDEES.length} attendees, ${POSTS.length} posts, ${POST_COMMENTS.length} comments, ${STORIES.length} stories.`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
