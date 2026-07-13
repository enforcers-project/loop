-- =============================================================================
-- §6 CHECK constraints Prisma can't express in the schema DSL.
-- These are the single-row / cross-column invariants called out per-table in
-- planning/project_plan.md §6 (and the applied audit fixes). Cross-ROW rules
-- (roster capacity, Σ position.capacity = players_needed) live in the triggers
-- migration, since a CHECK can't see other rows.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- users (§6.1) — role sub-capabilities are gated to organizers.
--   organizer_kind (Organizer/Promoter display sub-type) is only meaningful
--   for role='organizer'; is_host (sports/roster sub-capability) likewise.
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD CONSTRAINT users_organizer_kind_requires_organizer
    CHECK (organizer_kind IS NULL OR role = 'organizer');

ALTER TABLE users
  ADD CONSTRAINT users_is_host_requires_organizer
    CHECK (is_host = false OR role = 'organizer');

-- ---------------------------------------------------------------------------
-- follows (§6.6) — no self-follow.
-- ---------------------------------------------------------------------------
ALTER TABLE follows
  ADD CONSTRAINT follows_no_self_follow
    CHECK (follower_id <> followee_id);

-- ---------------------------------------------------------------------------
-- comments (§6.6) — exactly one target: an event XOR a post.
-- ---------------------------------------------------------------------------
ALTER TABLE comments
  ADD CONSTRAINT comments_one_target
    CHECK ((event_id IS NOT NULL) <> (post_id IS NOT NULL));

-- ---------------------------------------------------------------------------
-- sports_details (§6.3) — a run needs at least one player.
-- ---------------------------------------------------------------------------
ALTER TABLE sports_details
  ADD CONSTRAINT sports_details_players_needed_positive
    CHECK (players_needed > 0);

-- ---------------------------------------------------------------------------
-- sports_positions (§6.3) — every position holds at least one slot.
-- ---------------------------------------------------------------------------
ALTER TABLE sports_positions
  ADD CONSTRAINT sports_positions_capacity_positive
    CHECK (capacity >= 1);

-- ---------------------------------------------------------------------------
-- roster_entries (§6.3) — a claimed spot must occupy a numbered slot.
--   (Partial unique indexes for one-live-claim / one-per-slot are in the
--    triggers migration.)
-- ---------------------------------------------------------------------------
ALTER TABLE roster_entries
  ADD CONSTRAINT roster_entries_claimed_needs_slot
    CHECK (status <> 'claimed' OR slot_number IS NOT NULL);
