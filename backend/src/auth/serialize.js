// Serializers for the auth payloads (planning §7.1 shapes).

/** The full SelfUser returned by GET /api/auth/me (and the profile mirror). */
export function toSelfUser(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    organizer_kind: u.organizerKind,
    is_host: u.isHost,
    display_name: u.displayName,
    handle: u.handle,
    is_verified: u.isVerified,
    avatar_url: u.avatarUrl,
    cover_image_url: u.coverImageUrl,
    bio: u.bio,
    home_city: u.homeCity,
    home_lat: u.homeLat,
    home_lng: u.homeLng,
    home_place_id: u.homePlaceId,
    location_radius_km: u.locationRadiusKm,
    onboarding_completed_at: u.onboardingCompletedAt,
    notification_prefs: u.notificationPrefs,
    follower_count: u.followerCount,
    following_count: u.followingCount,
    last_active_at: u.lastActiveAt,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  }
}

/** The compact user object returned by signup/login. */
export function toAuthUser(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    organizer_kind: u.organizerKind,
    is_host: u.isHost,
    display_name: u.displayName,
    handle: u.handle,
    is_verified: u.isVerified,
    follower_count: u.followerCount,
    following_count: u.followingCount,
    onboarding_completed_at: u.onboardingCompletedAt,
    created_at: u.createdAt,
  }
}
