// Loop demo seed data — the in-memory catalog served by the API.
// Categories, interests, avatars, and a native demo event catalog.

export type Category =
  | 'Music'
  | 'Nightlife'
  | 'Sports'
  | 'Networking'
  | 'Food'
  | 'Campus';

export interface Organizer {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  verified: boolean;
  role: 'Attendee' | 'Organizer' | 'Promoter' | 'Sports Host';
  followers: number;
  bio: string;
  cover: string;
}

export interface SportsPosition {
  label: string;
  capacity: number;
  filled: number;
}

export interface RosterPlayer {
  name: string;
  avatar: string;
  position: string;
  skill: 'Beginner' | 'Intermediate' | 'Advanced';
  status: 'claimed' | 'waitlist';
}

export interface Event {
  id: string;
  title: string;
  category: Category;
  poster: string;
  price: string; // e.g. "Free", "$25", "$10"
  isFree: boolean;
  date: string; // display string, e.g. "Sat, Jul 12 · 9:00 PM"
  isoDate: string;
  venueName: string;
  city: string;
  lat: number;
  lng: number;
  organizerId: string;
  description: string;
  tags: string[];
  goingCount: number;
  goingAvatars: string[];
  capacity: number;
  rsvpCount: number;
  saveCount: number;
  almostFull: boolean;
  rationale?: string; // "Because you ..." AI chip
  ageRestriction?: string; // e.g. "21+"
  // sports-only
  isSports?: boolean;
  sport?: string;
  playersNeeded?: number;
  playersSignedUp?: number;
  skillLevel?: string;
  indoor?: boolean;
  positions?: SportsPosition[];
  roster?: RosterPlayer[];
}

/** Figma categoryColors */
export const CATEGORIES: { name: Category; color: string }[] = [
  { name: 'Music', color: '#6D5EFC' },
  { name: 'Nightlife', color: '#FF2E74' },
  { name: 'Sports', color: '#16C784' },
  { name: 'Networking', color: '#2D8CFF' },
  { name: 'Food', color: '#FFB020' },
  { name: 'Campus', color: '#FF7A45' },
];

/** 24 interest chips for onboarding (Figma: INTERESTS 24 items) */
export const INTERESTS: { id: string; label: string; category: Category }[] = [
  { id: 'afrobeats', label: 'Afrobeats', category: 'Music' },
  { id: 'hiphop', label: 'Hip-Hop', category: 'Music' },
  { id: 'house', label: 'House / EDM', category: 'Music' },
  { id: 'live-bands', label: 'Live Bands', category: 'Music' },
  { id: 'rooftop', label: 'Rooftop Parties', category: 'Nightlife' },
  { id: 'clubbing', label: 'Clubbing', category: 'Nightlife' },
  { id: 'lounges', label: 'Lounges', category: 'Nightlife' },
  { id: 'day-party', label: 'Day Parties', category: 'Nightlife' },
  { id: 'soccer', label: 'Soccer', category: 'Sports' },
  { id: 'basketball', label: 'Basketball', category: 'Sports' },
  { id: 'volleyball', label: 'Volleyball', category: 'Sports' },
  { id: 'running', label: 'Running Clubs', category: 'Sports' },
  { id: 'startups', label: 'Startups', category: 'Networking' },
  { id: 'tech', label: 'Tech Meetups', category: 'Networking' },
  { id: 'career', label: 'Career Fairs', category: 'Networking' },
  { id: 'creators', label: 'Creator Mixers', category: 'Networking' },
  { id: 'foodie', label: 'Food Festivals', category: 'Food' },
  { id: 'brunch', label: 'Brunch', category: 'Food' },
  { id: 'popups', label: 'Pop-ups', category: 'Food' },
  { id: 'tastings', label: 'Tastings', category: 'Food' },
  { id: 'campus-life', label: 'Campus Life', category: 'Campus' },
  { id: 'greek', label: 'Greek Life', category: 'Campus' },
  { id: 'clubs-orgs', label: 'Clubs & Orgs', category: 'Campus' },
  { id: 'study-jams', label: 'Study Jams', category: 'Campus' },
];

export const AVATARS: string[] = [
  'https://i.pravatar.cc/150?img=1',
  'https://i.pravatar.cc/150?img=5',
  'https://i.pravatar.cc/150?img=8',
  'https://i.pravatar.cc/150?img=12',
  'https://i.pravatar.cc/150?img=15',
  'https://i.pravatar.cc/150?img=20',
  'https://i.pravatar.cc/150?img=23',
  'https://i.pravatar.cc/150?img=32',
  'https://i.pravatar.cc/150?img=45',
  'https://i.pravatar.cc/150?img=48',
  'https://i.pravatar.cc/150?img=51',
  'https://i.pravatar.cc/150?img=60',
];

export const ORGANIZERS: Organizer[] = [
  {
    id: 'org-lagos',
    name: 'Lagos Nights',
    handle: '@lagosnights',
    avatar: 'https://i.pravatar.cc/150?img=13',
    verified: true,
    role: 'Promoter',
    followers: 8420,
    bio: 'Bringing the biggest Afrobeats & Amapiano nights to the Bay. Rooftops, warehouses, good vibes only.',
    cover:
      'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200&q=80',
  },
  {
    id: 'org-hoops',
    name: 'Oakland Hoops',
    handle: '@oaklandhoops',
    avatar: 'https://i.pravatar.cc/150?img=33',
    verified: true,
    role: 'Sports Host',
    followers: 2130,
    bio: 'Pickup runs 5 days a week. All skill levels. Just show up and ball.',
    cover:
      'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&q=80',
  },
  {
    id: 'org-techbay',
    name: 'TechBay Collective',
    handle: '@techbay',
    avatar: 'https://i.pravatar.cc/150?img=52',
    verified: true,
    role: 'Organizer',
    followers: 5610,
    bio: 'Founder mixers, demo nights and career fairs for the next generation of builders.',
    cover:
      'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=1200&q=80',
  },
  {
    id: 'org-tasteof',
    name: 'Taste of the Town',
    handle: '@tasteofthetown',
    avatar: 'https://i.pravatar.cc/150?img=25',
    verified: false,
    role: 'Organizer',
    followers: 1980,
    bio: 'Food halls, night markets and tasting pop-ups across the city.',
    cover:
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1200&q=80',
  },
  {
    id: 'org-campus',
    name: 'Campus Union',
    handle: '@campusunion',
    avatar: 'https://i.pravatar.cc/150?img=44',
    verified: true,
    role: 'Organizer',
    followers: 3400,
    bio: 'Official student union events — mixers, study jams, game nights.',
    cover:
      'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&q=80',
  },
];

const IMG = (id: string, w = 800) =>
  `https://images.unsplash.com/${id}?w=${w}&q=80`;

export const EVENTS: Event[] = [
  {
    id: 'ev-afrobeats',
    title: 'Afro Nation Rooftop: Amapiano Edition',
    category: 'Nightlife',
    poster: IMG('photo-1533174072545-7a4b6ad7a6c3'),
    price: '$25',
    isFree: false,
    date: 'Sat, Jul 12 · 9:00 PM',
    isoDate: '2026-07-12T21:00:00-07:00',
    venueName: 'Skyline Rooftop',
    city: 'Oakland',
    lat: 37.8044,
    lng: -122.2712,
    organizerId: 'org-lagos',
    description:
      'The rooftop is back. Amapiano and Afrobeats all night with a live percussion set, skyline views and the best crowd in the Bay. Dress to impress.',
    tags: ['#Afrobeats', '#21+', '#Nightlife', '#Oakland', '#RooftopParty'],
    goingCount: 214,
    goingAvatars: [AVATARS[0], AVATARS[1], AVATARS[2]],
    capacity: 300,
    rsvpCount: 214,
    saveCount: 89,
    almostFull: true,
    rationale: 'Because you saved Lagos Nights events',
    ageRestriction: '21+',
  },
  {
    id: 'ev-house',
    title: 'Warehouse: Deep House Sessions',
    category: 'Music',
    poster: IMG('photo-1516450360452-9312f5e86fc7'),
    price: '$15',
    isFree: false,
    date: 'Fri, Jul 11 · 10:00 PM',
    isoDate: '2026-07-11T22:00:00-07:00',
    venueName: 'The Grid Warehouse',
    city: 'Oakland',
    lat: 37.8085,
    lng: -122.2712,
    organizerId: 'org-lagos',
    description:
      'An intimate warehouse night with a rotating cast of the Bay’s best house DJs. Big sound system, low lights, all vibes.',
    tags: ['#House', '#EDM', '#Warehouse', '#18+'],
    goingCount: 132,
    goingAvatars: [AVATARS[3], AVATARS[4], AVATARS[5]],
    capacity: 250,
    rsvpCount: 132,
    saveCount: 54,
    almostFull: false,
    rationale: 'Because you like House / EDM',
    ageRestriction: '18+',
  },
  {
    id: 'ev-soccer',
    title: 'Sunday Pickup Soccer — 7v7',
    category: 'Sports',
    poster: IMG('photo-1522778119026-d647f0596c20'),
    price: 'Free',
    isFree: true,
    date: 'Sun, Jul 13 · 8:00 AM',
    isoDate: '2026-07-13T08:00:00-07:00',
    venueName: 'Bushrod Park Fields',
    city: 'Oakland',
    lat: 37.8368,
    lng: -122.263,
    organizerId: 'org-hoops',
    description:
      'Casual 7v7 run every Sunday morning. Bring a light and dark shirt. All skill levels welcome — we mix teams to keep it fair.',
    tags: ['#Soccer', '#PickupRun', '#AllLevels', '#Free'],
    goingCount: 11,
    goingAvatars: [AVATARS[6], AVATARS[7], AVATARS[8]],
    capacity: 14,
    rsvpCount: 11,
    saveCount: 22,
    almostFull: true,
    rationale: 'Because you follow Oakland Hoops',
    isSports: true,
    sport: 'Soccer',
    playersNeeded: 14,
    playersSignedUp: 11,
    skillLevel: 'All Levels',
    indoor: false,
    positions: [
      { label: 'Goalkeeper', capacity: 2, filled: 1 },
      { label: 'Defender', capacity: 4, filled: 3 },
      { label: 'Midfielder', capacity: 4, filled: 4 },
      { label: 'Forward', capacity: 4, filled: 3 },
    ],
    roster: [
      { name: 'Marcus B.', avatar: AVATARS[6], position: 'Goalkeeper', skill: 'Intermediate', status: 'claimed' },
      { name: 'Dele A.', avatar: AVATARS[7], position: 'Defender', skill: 'Advanced', status: 'claimed' },
      { name: 'Sam T.', avatar: AVATARS[8], position: 'Defender', skill: 'Beginner', status: 'claimed' },
      { name: 'Chris O.', avatar: AVATARS[9], position: 'Defender', skill: 'Intermediate', status: 'claimed' },
      { name: 'Jordan K.', avatar: AVATARS[10], position: 'Midfielder', skill: 'Advanced', status: 'claimed' },
      { name: 'Tolu M.', avatar: AVATARS[11], position: 'Midfielder', skill: 'Intermediate', status: 'claimed' },
      { name: 'Ade F.', avatar: AVATARS[0], position: 'Midfielder', skill: 'Beginner', status: 'claimed' },
      { name: 'Nate W.', avatar: AVATARS[1], position: 'Midfielder', skill: 'Intermediate', status: 'claimed' },
      { name: 'Kevin L.', avatar: AVATARS[2], position: 'Forward', skill: 'Advanced', status: 'claimed' },
      { name: 'Femi B.', avatar: AVATARS[3], position: 'Forward', skill: 'Intermediate', status: 'claimed' },
      { name: 'Ryan P.', avatar: AVATARS[4], position: 'Forward', skill: 'Beginner', status: 'claimed' },
      { name: 'Omar S.', avatar: AVATARS[5], position: 'Forward', skill: 'Intermediate', status: 'waitlist' },
    ],
  },
  {
    id: 'ev-founders',
    title: 'Founders & Funders Mixer',
    category: 'Networking',
    poster: IMG('photo-1511578314322-379afb476865'),
    price: 'Free',
    isFree: true,
    date: 'Thu, Jul 10 · 6:30 PM',
    isoDate: '2026-07-10T18:30:00-07:00',
    venueName: 'TechBay HQ',
    city: 'Oakland',
    lat: 37.8021,
    lng: -122.2711,
    organizerId: 'org-techbay',
    description:
      'Meet founders, angels and operators over drinks. Lightning intros at 7, open networking after. RSVP required — space is limited.',
    tags: ['#Startups', '#Networking', '#Tech', '#Free'],
    goingCount: 96,
    goingAvatars: [AVATARS[9], AVATARS[10], AVATARS[11]],
    capacity: 120,
    rsvpCount: 96,
    saveCount: 41,
    almostFull: true,
    rationale: 'Because you like Tech Meetups',
  },
  {
    id: 'ev-nightmarket',
    title: 'Night Market: Global Street Eats',
    category: 'Food',
    poster: IMG('photo-1414235077428-338989a2e8c0'),
    price: '$10',
    isFree: false,
    date: 'Sat, Jul 12 · 5:00 PM',
    isoDate: '2026-07-12T17:00:00-07:00',
    venueName: 'Jack London Square',
    city: 'Oakland',
    lat: 37.7949,
    lng: -122.2776,
    organizerId: 'org-tasteof',
    description:
      '40+ vendors serving street food from around the world, live DJs and a natural-wine bar. Family friendly until 8pm.',
    tags: ['#FoodFestival', '#NightMarket', '#Foodie'],
    goingCount: 340,
    goingAvatars: [AVATARS[0], AVATARS[3], AVATARS[6]],
    capacity: 1000,
    rsvpCount: 340,
    saveCount: 120,
    almostFull: false,
    rationale: 'Because you like Food Festivals',
  },
  {
    id: 'ev-basketball',
    title: 'Friday Night Hoops — Open Run',
    category: 'Sports',
    poster: IMG('photo-1608245449230-4ac19066d2d0'),
    price: '$5',
    isFree: false,
    date: 'Fri, Jul 11 · 7:00 PM',
    isoDate: '2026-07-11T19:00:00-07:00',
    venueName: 'Mosswood Rec Center',
    city: 'Oakland',
    lat: 37.8221,
    lng: -122.2607,
    organizerId: 'org-hoops',
    description:
      'Full-court 5v5, winner stays on. Indoor court, $5 at the door. Get there early to get in the first games.',
    tags: ['#Basketball', '#PickupRun', '#Indoor'],
    goingCount: 8,
    goingAvatars: [AVATARS[1], AVATARS[4], AVATARS[7]],
    capacity: 20,
    rsvpCount: 8,
    saveCount: 15,
    almostFull: false,
    rationale: 'Because you follow Oakland Hoops',
    isSports: true,
    sport: 'Basketball',
    playersNeeded: 20,
    playersSignedUp: 8,
    skillLevel: 'Intermediate',
    indoor: true,
    positions: [
      { label: 'Guard', capacity: 8, filled: 3 },
      { label: 'Forward', capacity: 8, filled: 4 },
      { label: 'Center', capacity: 4, filled: 1 },
    ],
    roster: [
      { name: 'Tyrese J.', avatar: AVATARS[1], position: 'Guard', skill: 'Advanced', status: 'claimed' },
      { name: 'Andre M.', avatar: AVATARS[4], position: 'Guard', skill: 'Intermediate', status: 'claimed' },
      { name: 'Deshawn P.', avatar: AVATARS[7], position: 'Guard', skill: 'Beginner', status: 'claimed' },
      { name: 'Malik R.', avatar: AVATARS[2], position: 'Forward', skill: 'Advanced', status: 'claimed' },
      { name: 'Chris L.', avatar: AVATARS[5], position: 'Forward', skill: 'Intermediate', status: 'claimed' },
      { name: 'Jamal K.', avatar: AVATARS[8], position: 'Forward', skill: 'Intermediate', status: 'claimed' },
      { name: 'Devin W.', avatar: AVATARS[10], position: 'Forward', skill: 'Beginner', status: 'claimed' },
      { name: 'Big Mike', avatar: AVATARS[11], position: 'Center', skill: 'Advanced', status: 'claimed' },
    ],
  },
  {
    id: 'ev-brunch',
    title: 'Bottomless Brunch & Beats',
    category: 'Food',
    poster: IMG('photo-1504754524776-8f4f37790ca0'),
    price: '$35',
    isFree: false,
    date: 'Sun, Jul 13 · 12:00 PM',
    isoDate: '2026-07-13T12:00:00-07:00',
    venueName: 'The Terrace',
    city: 'Oakland',
    lat: 37.8102,
    lng: -122.2688,
    organizerId: 'org-tasteof',
    description:
      'Two hours of bottomless mimosas, a live sax player and a menu of brunch classics with a twist. 21+ after 3pm.',
    tags: ['#Brunch', '#DayParty', '#21+'],
    goingCount: 72,
    goingAvatars: [AVATARS[2], AVATARS[5], AVATARS[9]],
    capacity: 90,
    rsvpCount: 72,
    saveCount: 33,
    almostFull: true,
    rationale: 'Because you like Brunch',
    ageRestriction: '21+',
  },
  {
    id: 'ev-campus',
    title: 'Welcome Week Block Party',
    category: 'Campus',
    poster: IMG('photo-1523580494863-6f3031224c94'),
    price: 'Free',
    isFree: true,
    date: 'Fri, Jul 11 · 4:00 PM',
    isoDate: '2026-07-11T16:00:00-07:00',
    venueName: 'Main Quad',
    city: 'Oakland',
    lat: 37.8719,
    lng: -122.2585,
    organizerId: 'org-campus',
    description:
      'Kick off the semester with food trucks, a DJ, club fair and games on the quad. Free for all students with ID.',
    tags: ['#CampusLife', '#BlockParty', '#Free', '#Students'],
    goingCount: 512,
    goingAvatars: [AVATARS[3], AVATARS[7], AVATARS[11]],
    capacity: 800,
    rsvpCount: 512,
    saveCount: 210,
    almostFull: false,
    rationale: 'Because you like Campus Life',
  },
];

/** Instagram-style social posts derived from events (Figma SocialFeed). */
export interface Post {
  id: string;
  organizerId: string;
  eventId: string;
  image: string;
  caption: string;
  likes: number;
  comments: { id: string; author: string; text: string }[];
  timeAgo: string;
}

export const POSTS: Post[] = [
  {
    id: 'post-1',
    organizerId: 'org-lagos',
    eventId: 'ev-afrobeats',
    image: IMG('photo-1533174072545-7a4b6ad7a6c3', 1000),
    caption:
      'Rooftop is SOLD to the vibes this Saturday 🌆🔥 Amapiano edition. Tap in before we cap it.',
    likes: 1284,
    comments: [
      { id: 'c1', author: 'dami_o', text: 'Been waiting for this 🙌' },
      { id: 'c2', author: 'bay_area_kt', text: 'Who’s pulling up?' },
    ],
    timeAgo: '3h',
  },
  {
    id: 'post-2',
    organizerId: 'org-hoops',
    eventId: 'ev-soccer',
    image: IMG('photo-1522778119026-d647f0596c20', 1000),
    caption: 'Sunday run is nearly full — 3 spots left. Come get some ⚽️',
    likes: 342,
    comments: [{ id: 'c3', author: 'marcusb', text: 'Claiming keeper 🧤' }],
    timeAgo: '6h',
  },
  {
    id: 'post-3',
    organizerId: 'org-tasteof',
    eventId: 'ev-nightmarket',
    image: IMG('photo-1414235077428-338989a2e8c0', 1000),
    caption: '40+ vendors. One night. Global street eats hit Jack London Square 🍜🌮',
    likes: 908,
    comments: [{ id: 'c4', author: 'foodie_sf', text: 'The dumpling stall better be back' }],
    timeAgo: '1d',
  },
];
