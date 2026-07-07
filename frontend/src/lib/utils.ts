import type { Category, Role } from './types'

/** Tiny classnames joiner. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** Figma categoryColors — the single source of truth for category tints. */
export const CATEGORY_COLOR: Record<Category, string> = {
  Music: '#6D5EFC',
  Nightlife: '#FF2E74',
  Sports: '#16C784',
  Networking: '#2D8CFF',
  Food: '#FFB020',
  Campus: '#FF7A45',
}

/** Role badge tints (Figma RoleBadge variants). */
export const ROLE_STYLE: Record<Role, { bg: string; text: string }> = {
  Attendee: { bg: '#F7F7F8', text: '#6B6B76' },
  Organizer: { bg: '#F0EFFE', text: '#6D5EFC' },
  Promoter: { bg: '#FFE4EE', text: '#FF2E74' },
  'Sports Host': { bg: '#DFF7EC', text: '#16C784' },
}

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return String(n)
}

/**
 * Normalize a raw recommendation rationale into a short, intentional badge
 * label — never long enough to truncate or overflow. Falls back to the
 * event category so "Because you like …" stays specific but concise.
 */
export function recommendationLabel(
  rationale: string | undefined,
  category?: Category,
): string {
  if (!rationale) return 'Recommended'
  const r = rationale.toLowerCase()
  if (r.includes('saved')) return 'Similar to saved'
  if (r.includes('trending')) return 'Trending nearby'
  if (r.includes('popular')) return 'Popular near you'
  if (r.includes('follow')) return 'Recommended for you'
  if (r.startsWith('because you like')) {
    return category ? `Because you like ${category}` : 'Recommended for you'
  }
  // Anything already short (≤ 22 chars) passes through; otherwise generalize.
  return rationale.length <= 22 ? rationale : 'Recommended for you'
}
