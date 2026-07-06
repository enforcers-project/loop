// Shared domain types — mirror the backend seed shape.

export type Category =
  | 'Music'
  | 'Nightlife'
  | 'Sports'
  | 'Networking'
  | 'Food'
  | 'Campus'

export type Role = 'Attendee' | 'Organizer' | 'Promoter' | 'Sports Host'

export interface Organizer {
  id: string
  name: string
  handle: string
  avatar: string
  verified: boolean
  role: Role
  followers: number
  bio: string
  cover: string
  events?: Event[]
}

export interface SportsPosition {
  label: string
  capacity: number
  filled: number
}

export interface RosterPlayer {
  name: string
  avatar: string
  position: string
  skill: 'Beginner' | 'Intermediate' | 'Advanced'
  status: 'claimed' | 'waitlist'
}

export interface Event {
  id: string
  title: string
  category: Category
  poster: string
  price: string
  isFree: boolean
  date: string
  isoDate: string
  venueName: string
  city: string
  lat: number
  lng: number
  organizerId: string
  organizer?: Organizer | null
  description: string
  tags: string[]
  goingCount: number
  goingAvatars: string[]
  capacity: number
  rsvpCount: number
  saveCount: number
  almostFull: boolean
  rationale?: string
  ageRestriction?: string
  isSports?: boolean
  sport?: string
  playersNeeded?: number
  playersSignedUp?: number
  skillLevel?: string
  indoor?: boolean
  positions?: SportsPosition[]
  roster?: RosterPlayer[]
}

export interface Interest {
  id: string
  label: string
  category: Category
}

export interface CategoryDef {
  name: Category
  color: string
}

export interface Post {
  id: string
  organizerId: string
  eventId: string
  image: string
  caption: string
  likes: number
  comments: { id: string; author: string; text: string }[]
  timeAgo: string
  organizer?: Organizer | null
  event?: Event | null
}

export interface SelfUser {
  id: string
  email: string
  name: string
  role: string
  handle: string
  avatar: string
}
