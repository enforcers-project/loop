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
