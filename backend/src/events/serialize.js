/**
 * Full event-detail shape (planning §7.3 GET /api/events/:id) returned by
 * create / patch / publish and the detail read. Expects the row to include
 * category, organizer, tags, and sportsDetail.positions.
 */
export function toEventDetail(event, viewer = null) {
  const sports = event.sportsDetail
  return {
    id: event.id,
    organizer: event.organizer
      ? {
          id: event.organizer.id,
          display_name: event.organizer.displayName,
          handle: event.organizer.handle,
          avatar_url: event.organizer.avatarUrl,
          is_verified: event.organizer.isVerified,
        }
      : null,
    external_organizer_name: event.externalOrganizerName,
    title: event.title,
    slug: event.slug,
    description: event.description,
    description_is_ai: event.descriptionIsAi,
    flyer_url: event.flyerUrl,
    category: {
      slug: event.category.slug,
      name: event.category.name,
      color_hex: event.category.colorHex,
      icon: event.category.icon,
    },
    status: event.status,
    source: event.source,
    external_id: event.externalId,
    external_url: event.externalUrl,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    timezone: event.timezone,
    venue_name: event.venueName,
    address: event.address,
    city: event.city,
    lat: event.lat,
    lng: event.lng,
    google_place_id: event.googlePlaceId,
    price_min: event.priceMin != null ? Number(event.priceMin) : null,
    price_max: event.priceMax != null ? Number(event.priceMax) : null,
    is_free: event.isFree,
    currency: event.currency,
    capacity: event.capacity,
    age_min: event.ageMin,
    age_label: event.ageLabel,
    age_restricted: event.ageRestricted,
    is_sports: event.isSports,
    rsvp_count: event.rsvpCount,
    save_count: event.saveCount,
    view_count: event.viewCount,
    published_at: event.publishedAt,
    tags: (event.tags ?? []).map((t) => ({
      id: t.id,
      slug: t.slug,
      label: t.label,
      source: t.source,
      confidence: t.confidence != null ? Number(t.confidence) : null,
    })),
    sports_details: sports
      ? {
          sport: sports.sport,
          skill_level: sports.skillLevel,
          venue_setting: sports.venueSetting,
          players_needed: sports.playersNeeded,
          players_signed_up: sports.playersSignedUp,
          duration_minutes: sports.durationMinutes,
          default_position: sports.defaultPosition,
          notes: sports.notes,
          positions: (sports.positions ?? [])
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((p) => ({
              id: p.id,
              label: p.label,
              capacity: p.capacity,
              skill_level: p.skillLevel,
              sort_order: p.sortOrder,
              open_slots: p.capacity - (p._claimedCount ?? 0),
            })),
        }
      : null,
    going_stack: event.goingStack ?? { count: 0, avatars: [] },
    viewer,
  }
}

/** Prisma include for the full detail shape. */
export const EVENT_DETAIL_INCLUDE = {
  category: true,
  organizer: true,
  tags: true,
  sportsDetail: { include: { positions: true } },
}

/**
 * Transforms a raw Prisma event row (with joined relations) into the
 * EventCard shape the frontend expects.
 */
export function toEventCard(event, distanceKm = null) {
  const sports = event.sportsDetail
  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    flyer_url: event.flyerUrl,
    category: {
      slug: event.category.slug,
      name: event.category.name,
      color_hex: event.category.colorHex,
    },
    organizer: event.organizer
      ? {
          id: event.organizer.id,
          display_name: event.organizer.displayName,
          handle: event.organizer.handle,
          avatar_url: event.organizer.avatarUrl,
          is_verified: event.organizer.isVerified,
        }
      : null,
    external_organizer_name: event.externalOrganizerName,
    source: event.source,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    published_at: event.publishedAt,
    timezone: event.timezone,
    venue_name: event.venueName,
    city: event.city,
    lat: event.lat,
    lng: event.lng,
    price_min: event.priceMin ? Number(event.priceMin) : null,
    price_max: event.priceMax ? Number(event.priceMax) : null,
    is_free: event.isFree,
    currency: event.currency,
    age_label: event.ageLabel,
    age_restricted: event.ageRestricted,
    capacity: event.capacity,
    is_sports: event.isSports,
    players_needed: sports?.playersNeeded ?? null,
    players_signed_up: sports?.playersSignedUp ?? null,
    rsvp_count: event.rsvpCount,
    save_count: event.saveCount,
    view_count: event.viewCount,
    distance_km: distanceKm,
    external_url: event.externalUrl,
  }
}
