-- =============================================================================
-- Raw SQL that Prisma can't express natively.
-- Covers: HNSW vector indexes, generated search_document tsvector + GIN,
-- partial unique indexes on roster_entries, and the roster capacity trigger.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. HNSW cosine indexes on all vector(384) columns
-- ---------------------------------------------------------------------------

CREATE INDEX event_embeddings_embedding_idx
  ON event_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX user_preference_vectors_embedding_idx
  ON user_preference_vectors USING hnsw (embedding vector_cosine_ops);

CREATE INDEX search_queries_query_embedding_idx
  ON search_queries USING hnsw (query_embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- 2. Generated search_document tsvector + GIN index
--    (replace the plain column Prisma created with a GENERATED one)
-- ---------------------------------------------------------------------------

ALTER TABLE events DROP COLUMN search_document;

ALTER TABLE events ADD COLUMN search_document tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(venue_name, ''))
  ) STORED;

CREATE INDEX events_search_document_idx
  ON events USING gin (search_document);

-- ---------------------------------------------------------------------------
-- 3. Partial unique indexes (roster integrity)
-- ---------------------------------------------------------------------------

-- A user can only hold ONE active (claimed) spot per event at a time.
CREATE UNIQUE INDEX roster_entries_one_live_claim
  ON roster_entries (event_id, user_id)
  WHERE status = 'claimed';

-- Each numbered slot within a position can only be held by one person.
CREATE UNIQUE INDEX roster_entries_one_per_slot
  ON roster_entries (sports_position_id, slot_number)
  WHERE status = 'claimed' AND slot_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Roster capacity trigger
--    On INSERT/UPDATE: if claimed count already = players_needed, downgrade to
--    waitlisted.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_roster_capacity()
RETURNS TRIGGER AS $$
DECLARE
  current_claimed INT;
  max_capacity    INT;
BEGIN
  -- Only act when the incoming row wants "claimed" status
  IF NEW.status <> 'claimed' THEN
    RETURN NEW;
  END IF;

  -- Get the run's player cap
  SELECT players_needed INTO max_capacity
    FROM sports_details
    WHERE event_id = NEW.event_id;

  -- Count existing claimed entries (exclude this row on UPDATE)
  SELECT count(*) INTO current_claimed
    FROM roster_entries
    WHERE event_id = NEW.event_id
      AND status = 'claimed'
      AND id IS DISTINCT FROM NEW.id;

  -- If at capacity, downgrade to waitlisted
  IF current_claimed >= max_capacity THEN
    NEW.status := 'waitlisted';
    NEW.waitlist_position := (
      SELECT coalesce(max(waitlist_position), 0) + 1
        FROM roster_entries
        WHERE event_id = NEW.event_id
          AND status = 'waitlisted'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_roster_capacity
  BEFORE INSERT OR UPDATE ON roster_entries
  FOR EACH ROW
  EXECUTE FUNCTION enforce_roster_capacity();
