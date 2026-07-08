-- Loop — enable the Postgres extensions the data model (§6) depends on.
--
-- WHAT THIS IS: Postgres ships lean; optional features are "extensions" you
-- switch on explicitly. This file turns on the five the plan needs. It's mounted
-- into the container's /docker-entrypoint-initdb.d, which Postgres runs ONCE,
-- automatically, the first time the database is created. Re-runnable safely
-- (every line is IF NOT EXISTS).
--
--   vector        — pgvector: stores the AI embedding vectors for the recommender
--                   (event_embeddings, user_preference_vectors)
--   citext        — case-insensitive text, so Bob@x.com == bob@x.com for
--                   users.email and users.handle
--   pg_trgm       — trigram matching: typo-tolerant / fuzzy title search
--   cube          — math type that earthdistance is built on (dependency)
--   earthdistance — earth_distance(): powers the "events near me" geo-radius filter

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;
