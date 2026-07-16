// Serializers for public user / organizer payloads (planning §7.2).

/**
 * The public profile returned by GET /api/users/:id and embedded in
 * followers/following lists. `isFollowing` is viewer-relative: pass true/false
 * for a logged-in viewer, or null when logged out (the client hides FollowBtn).
 */
export function toPublicUser(u, isFollowing = null) {
  return {
    id: u.id,
    display_name: u.displayName,
    handle: u.handle,
    role: u.role,
    organizer_kind: u.organizerKind,
    is_host: u.isHost,
    is_verified: u.isVerified,
    avatar_url: u.avatarUrl,
    cover_image_url: u.coverImageUrl,
    bio: u.bio,
    home_city: u.homeCity,
    follower_count: u.followerCount,
    following_count: u.followingCount,
    is_following: isFollowing,
    created_at: u.createdAt,
  }
}

/** Columns toPublicUser needs — use as a Prisma `select` to avoid over-fetching. */
export const PUBLIC_USER_SELECT = {
  id: true,
  displayName: true,
  handle: true,
  role: true,
  organizerKind: true,
  isHost: true,
  isVerified: true,
  avatarUrl: true,
  coverImageUrl: true,
  bio: true,
  homeCity: true,
  followerCount: true,
  followingCount: true,
  createdAt: true,
}
