-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "cube";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "earthdistance";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('attendee', 'organizer');

-- CreateEnum
CREATE TYPE "organizer_kind" AS ENUM ('organizer', 'promoter');

-- CreateEnum
CREATE TYPE "event_source" AS ENUM ('native', 'ticketmaster', 'seatgeek');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('draft', 'published', 'cancelled', 'past');

-- CreateEnum
CREATE TYPE "rsvp_status" AS ENUM ('going', 'interested', 'waitlisted', 'cancelled');

-- CreateEnum
CREATE TYPE "skill_level" AS ENUM ('all_levels', 'beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "venue_setting" AS ENUM ('indoor', 'outdoor');

-- CreateEnum
CREATE TYPE "roster_status" AS ENUM ('claimed', 'waitlisted', 'cancelled', 'no_show', 'attended');

-- CreateEnum
CREATE TYPE "tag_source" AS ENUM ('ai', 'organizer', 'system');

-- CreateEnum
CREATE TYPE "interest_source" AS ENUM ('onboarding', 'user_added', 'inferred');

-- CreateEnum
CREATE TYPE "interaction_type" AS ENUM ('impression', 'view', 'click', 'dwell', 'save', 'unsave', 'rsvp', 'rsvp_cancel', 'attend', 'search', 'search_result_click', 'follow', 'unfollow', 'share', 'category_click', 'tag_click', 'comment', 'post_like', 'claim_spot', 'release_spot', 'ai_query', 'rec_impression', 'rec_click', 'rec_dismiss');

-- CreateEnum
CREATE TYPE "interaction_surface" AS ENUM ('for_you', 'discover', 'search', 'event_detail', 'social', 'organizer_profile', 'user_profile', 'assistant', 'landing', 'notification');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('event_reminder', 'rsvp_confirmation', 'followed_new_event', 'roster_update', 'comment_reply', 'new_follower', 'social_like', 'event_updated', 'event_cancelled', 'system');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('in_app', 'push', 'email');

-- CreateEnum
CREATE TYPE "reminder_status" AS ENUM ('scheduled', 'sent', 'cancelled');

-- CreateEnum
CREATE TYPE "ai_generation_type" AS ENUM ('description', 'tags', 'event_embedding', 'user_vector', 'search_parse', 'chat');

-- CreateEnum
CREATE TYPE "ai_message_role" AS ENUM ('user', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "post_kind" AS ENUM ('flyer', 'recap', 'update');

-- CreateEnum
CREATE TYPE "feedback_type" AS ENUM ('bug', 'feature_request', 'general', 'content_report', 'other');

-- CreateEnum
CREATE TYPE "feedback_status" AS ENUM ('new', 'triaged', 'in_progress', 'resolved', 'wont_fix');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" TEXT,
    "role" "user_role" NOT NULL DEFAULT 'attendee',
    "organizer_kind" "organizer_kind",
    "is_host" BOOLEAN NOT NULL DEFAULT false,
    "display_name" VARCHAR(120),
    "handle" CITEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "avatar_url" TEXT,
    "cover_image_url" TEXT,
    "bio" TEXT,
    "home_city" VARCHAR(120),
    "home_lat" DOUBLE PRECISION,
    "home_lng" DOUBLE PRECISION,
    "home_place_id" TEXT,
    "location_radius_km" INTEGER NOT NULL DEFAULT 40,
    "onboarding_completed_at" TIMESTAMPTZ(6),
    "notification_prefs" JSONB,
    "follower_count" INTEGER NOT NULL DEFAULT 0,
    "following_count" INTEGER NOT NULL DEFAULT 0,
    "last_active_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "provider_uid" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "device" VARCHAR(40),
    "user_agent" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "color_hex" VARCHAR(7) NOT NULL,
    "icon" VARCHAR(40) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(60) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "category_id" UUID NOT NULL,
    "icon" VARCHAR(40) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_interests" (
    "user_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "source" "interest_source" NOT NULL,
    "weight" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_interests_pkey" PRIMARY KEY ("user_id","interest_id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizer_id" UUID,
    "external_organizer_name" VARCHAR(160),
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(160),
    "description" TEXT,
    "description_is_ai" BOOLEAN NOT NULL DEFAULT false,
    "flyer_url" TEXT,
    "category_id" UUID NOT NULL,
    "status" "event_status" NOT NULL DEFAULT 'draft',
    "source" "event_source" NOT NULL DEFAULT 'native',
    "external_id" VARCHAR(255),
    "external_url" TEXT,
    "raw_payload" JSONB,
    "last_synced_at" TIMESTAMPTZ(6),
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "timezone" VARCHAR(64),
    "venue_name" VARCHAR(160),
    "address" TEXT,
    "city" VARCHAR(120),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "google_place_id" TEXT,
    "price_min" DECIMAL(10,2),
    "price_max" DECIMAL(10,2),
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "capacity" INTEGER,
    "age_min" SMALLINT,
    "age_label" VARCHAR(20),
    "is_sports" BOOLEAN NOT NULL DEFAULT false,
    "rsvp_count" INTEGER NOT NULL DEFAULT 0,
    "save_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "search_document" tsvector,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "source" "tag_source" NOT NULL,
    "confidence" DECIMAL(5,4),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_details" (
    "event_id" UUID NOT NULL,
    "sport" VARCHAR(60) NOT NULL,
    "skill_level" "skill_level" NOT NULL,
    "venue_setting" "venue_setting" NOT NULL,
    "players_needed" INTEGER NOT NULL,
    "players_signed_up" INTEGER NOT NULL DEFAULT 0,
    "duration_minutes" INTEGER,
    "default_position" VARCHAR(60),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_details_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "sports_positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sports_detail_id" UUID NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "skill_level" "skill_level",
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "sports_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "sports_detail_id" UUID NOT NULL,
    "sports_position_id" UUID,
    "user_id" UUID NOT NULL,
    "slot_number" SMALLINT,
    "status" "roster_status" NOT NULL,
    "waitlist_position" INTEGER,
    "claimed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(6),
    "checked_in_at" TIMESTAMPTZ(6),

    CONSTRAINT "roster_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "status" "rsvp_status" NOT NULL,
    "guests_count" INTEGER NOT NULL DEFAULT 0,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "checked_in_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_events" (
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_events_pkey" PRIMARY KEY ("user_id","event_id")
);

-- CreateTable
CREATE TABLE "follows" (
    "follower_id" UUID NOT NULL,
    "followee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","followee_id")
);

-- CreateTable
CREATE TABLE "interaction_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "session_id" UUID,
    "event_id" UUID,
    "category_id" UUID,
    "target_user_id" UUID,
    "interaction_type" "interaction_type" NOT NULL,
    "surface" "interaction_surface" NOT NULL,
    "weight" DECIMAL(6,4) NOT NULL DEFAULT 1.0,
    "dwell_ms" INTEGER,
    "feed_position" INTEGER,
    "tag" VARCHAR(60),
    "recommendation_id" UUID,
    "search_query_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interaction_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_queries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "session_id" UUID,
    "raw_query" TEXT NOT NULL,
    "parsed_filters" JSONB,
    "surface" "interaction_surface" NOT NULL,
    "query_embedding" vector(384),
    "result_count" INTEGER,
    "clicked_event_id" UUID,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_category_affinities" (
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "score" DECIMAL(8,4) NOT NULL,
    "positive_signals" INTEGER NOT NULL,
    "impression_count" INTEGER NOT NULL,
    "last_signal_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_category_affinities_pkey" PRIMARY KEY ("user_id","category_id")
);

-- CreateTable
CREATE TABLE "event_embeddings" (
    "event_id" UUID NOT NULL,
    "embedding" vector(384) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "vector_version" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_embeddings_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "user_preference_vectors" (
    "user_id" UUID NOT NULL,
    "embedding" vector(384) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "vector_version" INTEGER NOT NULL,
    "signal_count" INTEGER NOT NULL DEFAULT 0,
    "decay_half_life_days" INTEGER,
    "last_built_from" TIMESTAMPTZ(6),
    "last_computed_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_preference_vectors_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "recommendation_impressions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "feed_run_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DECIMAL(8,6) NOT NULL,
    "rationale_text" VARCHAR(168),
    "rationale_signal" "interaction_type",
    "model_version" VARCHAR(80),
    "surface" "interaction_surface" NOT NULL,
    "shown_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "clicked_at" TIMESTAMPTZ(6),
    "converted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "recommendation_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generation_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "ai_generation_type" NOT NULL,
    "event_id" UUID,
    "user_id" UUID,
    "model" VARCHAR(80) NOT NULL,
    "prompt" TEXT,
    "output" JSONB,
    "tokens_used" INTEGER,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "role" "ai_message_role" NOT NULL,
    "content" TEXT NOT NULL,
    "event_refs" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "event_id" UUID,
    "post_id" UUID,
    "parent_comment_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "event_id" UUID,
    "kind" "post_kind" NOT NULL,
    "image_url" TEXT,
    "caption" TEXT,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "event_id" UUID,
    "media_url" TEXT NOT NULL,
    "caption" VARCHAR(160),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_views" (
    "story_id" UUID NOT NULL,
    "viewer_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_views_pkey" PRIMARY KEY ("story_id","viewer_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "actor_id" UUID,
    "event_id" UUID,
    "title" VARCHAR(160) NOT NULL,
    "body" TEXT,
    "metadata" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "offset_minutes" INTEGER NOT NULL,
    "remind_at" TIMESTAMPTZ(6) NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "status" "reminder_status" NOT NULL DEFAULT 'scheduled',
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_analytics_daily" (
    "event_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "rsvps" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_analytics_daily_pkey" PRIMARY KEY ("event_id","date")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "type" "feedback_type" NOT NULL,
    "status" "feedback_status" NOT NULL DEFAULT 'new',
    "subject" VARCHAR(160),
    "message" TEXT NOT NULL,
    "rating" SMALLINT,
    "email" CITEXT,
    "screen" VARCHAR(80),
    "app_version" VARCHAR(20),
    "user_agent" TEXT,
    "reported_event_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_uid_key" ON "oauth_accounts"("provider", "provider_uid");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "interests_slug_key" ON "interests"("slug");

-- CreateIndex
CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");

-- CreateIndex
CREATE INDEX "events_category_id_city_starts_at_idx" ON "events"("category_id", "city", "starts_at");

-- CreateIndex
CREATE INDEX "events_organizer_id_idx" ON "events"("organizer_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_source_external_id_key" ON "events"("source", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_tags_event_id_slug_key" ON "event_tags"("event_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "sports_positions_sports_detail_id_label_key" ON "sports_positions"("sports_detail_id", "label");

-- CreateIndex
CREATE INDEX "roster_entries_event_id_status_idx" ON "roster_entries"("event_id", "status");

-- CreateIndex
CREATE INDEX "roster_entries_user_id_idx" ON "roster_entries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rsvps_user_id_event_id_key" ON "rsvps"("user_id", "event_id");

-- CreateIndex
CREATE INDEX "interaction_events_user_id_created_at_idx" ON "interaction_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "interaction_events_event_id_interaction_type_idx" ON "interaction_events"("event_id", "interaction_type");

-- CreateIndex
CREATE INDEX "interaction_events_interaction_type_idx" ON "interaction_events"("interaction_type");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_reminders_user_id_event_id_remind_at_key" ON "event_reminders"("user_id", "event_id", "remind_at");

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interests" ADD CONSTRAINT "interests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "interests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tags" ADD CONSTRAINT "event_tags_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_details" ADD CONSTRAINT "sports_details_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_positions" ADD CONSTRAINT "sports_positions_sports_detail_id_fkey" FOREIGN KEY ("sports_detail_id") REFERENCES "sports_details"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_sports_detail_id_fkey" FOREIGN KEY ("sports_detail_id") REFERENCES "sports_details"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_sports_position_id_fkey" FOREIGN KEY ("sports_position_id") REFERENCES "sports_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_events" ADD CONSTRAINT "saved_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_events" ADD CONSTRAINT "saved_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_fkey" FOREIGN KEY ("followee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "user_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendation_impressions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_search_query_id_fkey" FOREIGN KEY ("search_query_id") REFERENCES "search_queries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "user_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_clicked_event_id_fkey" FOREIGN KEY ("clicked_event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_category_affinities" ADD CONSTRAINT "user_category_affinities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_category_affinities" ADD CONSTRAINT "user_category_affinities_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_embeddings" ADD CONSTRAINT "event_embeddings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preference_vectors" ADD CONSTRAINT "user_preference_vectors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_impressions" ADD CONSTRAINT "recommendation_impressions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_impressions" ADD CONSTRAINT "recommendation_impressions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_logs" ADD CONSTRAINT "ai_generation_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_logs" ADD CONSTRAINT "ai_generation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_analytics_daily" ADD CONSTRAINT "event_analytics_daily_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_reported_event_id_fkey" FOREIGN KEY ("reported_event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
