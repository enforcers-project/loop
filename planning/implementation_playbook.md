# Loop — Implementation Playbook

> **What this is:** the step-by-step guide to turn the plan (`project_plan.md`) into a working app, with a **copy-paste prompt for each step** to hand to Claude Code. Steps are in **dependency order** — do them top to bottom. Grounded in the §"GitHub Work Plan" issues, the 4 sprints, and the applied audit fixes.
>
> **Repo layout (decided):** `backend/` (Node + Express/Fastify + Prisma + Postgres/pgvector) and `frontend/` (React + Tailwind v4 from the Figma export). All AI/LLM/embedding calls are **backend-only**.
>
> **Golden rule:** build one step, verify it runs, commit, then start the next. Don't batch multiple steps into one prompt — each prompt below is sized to one reviewable change.

---

## How to use this doc

1. Work **top to bottom** — later steps assume earlier ones exist.
2. For each step: read the **Goal**, copy the **Prompt** verbatim into Claude Code (edit the `‹bracketed›` bits), then check the **Done when** box before moving on.
3. Every prompt tells Claude to **read `planning/project_plan.md`** for the relevant section, so it builds the *corrected* spec (the audit fixes live in the plan). Keep that phrasing.
4. After each step, run the **Verify** action and **commit** on a branch. Open a PR per step or per small group.

### Prompt template (the shape every prompt follows)
```
Read planning/project_plan.md §‹N› (‹what›) and planning/implementation_playbook.md Step ‹X›.
Build ‹the thing› in ‹backend|frontend›/. 
Follow the plan exactly, including the audit fixes noted there (‹the specific fix›).
Don't build anything outside this step. When done, tell me how to run/verify it.
```

### The per-step loop (do this every time)
- **Branch:** `git checkout -b step-‹n›-‹slug›`
- **Build:** paste the step's prompt.
- **Verify:** run the step's Verify command; confirm it does what it should (use `/verify` for anything with runtime behavior).
- **Commit + PR:** commit with a clear message; push; open PR; move the board card to Review → Done.

---

## Phase 0 — One-time setup (before any code)

You (humans) do these once; they're not Claude prompts (they need your accounts/keys). Claude can help wire them up after.

- [ ] **GitHub:** create the repo (or use this one), set up the **Project board** (Backlog → Sprint → In Progress → Review → Done), create **4 Milestones** (Sprint 1–4), and paste the **39 starter issues** from the work plan.
- [ ] **Local tools:** Node 20+, pnpm/npm, Docker Desktop (for Postgres+pgvector), `psql`.
- [ ] **Accounts + API keys** (put in a password manager, never in git):
  - Ticketmaster Discovery API key
  - SeatGeek client id/secret
  - Google Maps Platform key (Places + Maps JS)
  - Hosted embeddings/LLM key (e.g. OpenAI/Anthropic) — **backend only**
- [x] **Embedding model decided → DIM pinned to `vector(384)`** (a MiniLM-class local model, e.g. `all-MiniLM-L6-v2`; chosen over `text-embedding-3-small` = 1536 — see `project_plan.md` §10). Everything vector-related uses this one number: `384`.

> **Prompt to help scaffold the GitHub board/issues** (optional, uses the `gh` CLI):
> ```
> Read planning/project_plan.md §"GitHub Work Plan". Using the gh CLI, create 4 milestones
> (Sprint 1–4) and open the 39 starter issues from that table — each with its title, a body that
> quotes its "References" cell, the Type label (MVP/nice-to-have/stretch), and the milestone.
> Show me the commands first; don't run them until I confirm.
> ```

---

## Phase 1 — Sprint 1: Foundation

**Goal of the sprint:** repo + CI, the full data model as Prisma, auth, onboarding, seed data, external-sync stub, a job runner. No AI yet.

### Step 1.1 — Monorepo scaffold + tooling  *(work-plan #1)*
**Goal:** `backend/` and `frontend/` skeletons, shared tooling, CI.
```
Read planning/project_plan.md (stack note at the top of §6, and §8 for the frontend stack).
Scaffold a two-folder repo: backend/ (Node + TypeScript + Fastify or Express + Prisma) and
frontend/ (React 18 + Vite + Tailwind CSS v4, fonts Space Grotesk + Inter, lucide-react icons).
Add: root README with run instructions, .gitignore, .env.example in both folders, ESLint+Prettier,
and a GitHub Actions workflow that lints + type-checks + builds both folders on PR.
Don't add app features yet. Tell me how to run each folder.
```
**Verify:** `npm run dev` starts an empty backend on a port and an empty React app; CI passes on a PR.
- [ ] Done

### Step 1.2 — Postgres + pgvector via Docker  *(supports #2)*
**Goal:** a local DB with the required extensions.
```
Read planning/project_plan.md §6 intro (required extensions).
Add a docker-compose.yml at repo root that runs Postgres 16 with pgvector, plus a one-time init
SQL that enables extensions: vector, citext, pg_trgm, cube, earthdistance. Wire backend/.env
DATABASE_URL to it. Give me the commands to bring it up and confirm the extensions are installed.
```
**Verify:** `docker compose up -d` then `psql ... -c '\dx'` shows all 5 extensions.
- [ ] Done

### Step 1.3 — Prisma schema + first migration  *(work-plan #2 — the big one)*
**Goal:** the entire §6 data model as a Prisma schema, with the audit fixes baked in.
```
Read planning/project_plan.md §6 (the whole data model — every table, enum, constraint) and §10's
"Consistency audit" note. Create backend/prisma/schema.prisma modeling ALL §6 tables and enum types
exactly, then generate the initial migration. Bake in the applied audit fixes:
- interests.category_id is NOT NULL
- drop comments.like_count
- event_embeddings/user_preference_vectors: one active row per event/user (PK on the id), vector(384)
- user_sessions.id is a plain uuid PK that can accept a client-supplied id (no forced default on insert path)
- all the partial unique indexes + the comments XOR check + the events UNIQUE(source, external_id)
- vector(384) is pinned (Phase 0 / Sprint 0 decision) — a MiniLM-class local model, e.g. `all-MiniLM-L6-v2`; use 384 for all three vector columns and their HNSW indexes
Use pgvector's Unsupported type or the prisma pgvector approach for the vector columns; add the
HNSW/IVFFlat index and the generated search_document tsvector via a raw-SQL migration step.
Note which constraints (capacity trigger, generated tsvector, Σ position.capacity = players_needed)
need raw SQL because Prisma can't express them, and add those as a follow-on migration.
Don't seed data yet. Show me `prisma migrate dev` output.
```
**Verify:** `npx prisma migrate dev` applies cleanly; `npx prisma studio` shows every table.
- [ ] Done

### Step 1.4 — Seed: categories + interests + demo events  *(work-plan #3 + #4)*
**Goal:** lookup data + a non-empty demo catalog (the spec-audit's top priority).
```
Read planning/project_plan.md §6 (categories, interests, events, sports_details, sports_positions)
and the spec_audit_recommendation_search.md "seed 40–60 native demo events" item.
Write backend/prisma/seed.ts that inserts:
- the 6 categories + an `other` catch-all with color_hex (give `other` a neutral gray), from the Figma tokens
- 24 interests, each with a NON-NULL category_id
- 40–60 native events across all 6 categories in ONE demo city (real lat/lng), INCLUDING several
  pickup runs with sports_details + sports_positions whose capacities sum to players_needed
Make it idempotent (upsert). Wire `prisma db seed`. Show me the row counts after seeding.
```
**Verify:** after seed, `SELECT category_id, count(*) FROM events GROUP BY 1` shows spread across all categories incl. sports.
- [ ] Done

### Step 1.5 — Auth (JWT cookie) + session middleware  *(work-plan #6)*
**Goal:** signup/login/logout/refresh, `GET /auth/me`, and the anonymous-session fix.
```
Read planning/project_plan.md §7.1 (auth endpoints), §6 users/oauth_accounts/user_sessions, and the
§6 "Anonymous-session note (fix)". Build the auth endpoints in backend/: signup (email/password/role/
optional organizer_kind, with the CHECK), login, logout, refresh, GET /auth/me. Use a stateless JWT in
an HTTP-only Secure SameSite cookie (NOT localStorage). Add auth middleware that (a) verifies the JWT,
and (b) upserts/attaches a user_sessions row — including an anonymous first-touch session keyed on a
client-minted id — so interaction_events.session_id FKs will always resolve. Include the error envelope
from §7 Conventions. Add a couple of integration tests. Tell me how to hit the endpoints.
```
**Verify:** curl signup → login → `GET /auth/me` returns the SelfUser; cookie is HttpOnly.
- [ ] Done

### Step 1.6 — Job runner / scheduler  *(work-plan #5b — the audit-added issue)*
**Goal:** the worker the MVP silently depends on.
```
Read planning/project_plan.md work-plan issue #5b and §9.2(C) (rebuild cadence).
Add a minimal job runner in backend/ (a cron process — node-cron or BullMQ if we want a queue).
Register empty stubs for: embedding-on-publish, vector rebuild + user_category_affinities rollup,
reminder dispatcher, event_status published→past flip, story expiry. Each stub just logs for now;
later steps fill them in. Make it start with the backend and be individually triggerable for tests.
```
**Verify:** backend boots the scheduler; a manual trigger runs a stub and logs.
- [ ] Done

### Step 1.7 — External-sync stub + dedup + taxonomy map  *(work-plan #5)*
**Goal:** Ticketmaster + SeatGeek ingest with dedup and category mapping.
```
Read planning/project_plan.md §7.7 (sync endpoints), §6 events provenance columns, and the work-plan #5
note about the provider-taxonomy → Loop-category map. Build POST /api/admin/sync/ticketmaster and
/seatgeek (admin-only): fetch, then upsert on UNIQUE(source, external_id), store raw_payload +
last_synced_at, and MAP each provider genre/segment to one of our 6 categories (or `other`) so
category_id is never null. Add GET /api/admin/sync/status. Add a cross-provider fuzzy-dedup guard
(normalized title + date + city) per the spec audit. Wire it to run from the job runner on a schedule.
Keep it a thin stub if the live APIs are flaky — seed data already covers the demo.
```
**Verify:** running a sync inserts rows with a real `category_id`; re-running updates, doesn't duplicate.
- [ ] Done

### Step 1.8 — App shell + navigation + onboarding  *(work-plan #7 + #8)*
**Goal:** the frontend skeleton and the first user flow.
```
Read planning/project_plan.md §8 (state architecture), §5 Onboarding, and §7.2 interests endpoints.
In frontend/: set up React Router, TanStack Query, and Auth/Toast/Modal contexts; build TopNav
(logged-out/in variants) + mobile BottomBar (elevated Create tab gated to organizer/is_host).
Build the Onboarding screen: ChipGrid (24 interests from GET /api/interests, "Pick at least 3",
Continue disabled <3) + Step 2 city search + Use-my-location. Commit picks via PUT /users/:id/interests.
Per the plan, S1 persists user_interests ONLY — do NOT build the seed vector yet (embeddings come in S3);
just store the picks. Match the Figma tokens (selected = filled #6D5EFC + white text). Responsive.
```
**Verify:** sign up → onboarding → pick 3 interests + a city → lands on an (empty for now) `/feed`.
- [ ] Done

> **End of Sprint 1:** a user can sign up, onboard, and the DB is populated. Tag a `sprint-1` release.

---

## Phase 2 — Sprint 2: Core loop (working MVP)

**Goal of the sprint:** create → discover → open → save/RSVP works end-to-end over real data. **This is the demoable MVP.**

### Step 2.1 — Event CRUD + publish  *(work-plan #9)*
```
Read planning/project_plan.md §7.3 (POST/PATCH/DELETE /events, /events/:id/publish) and §6 events.
Build event create (draft, organizer_id=caller, source=native), edit, delete, and the draft→published
transition (validates required fields, sets published_at, and — for now — just calls the embedding-on-
publish job stub). Gate create to role=organizer OR is_host (host only when is_sports). Enforce the
sports capacity invariant Σ sports_positions.capacity = players_needed at create/edit. Tests for the gates.
```
**Verify:** an organizer can create → publish; an attendee (non-host) is 403 on create.
- [ ] Done

### Step 2.2 — CreateEvent screen  *(work-plan #10)*
```
Read planning/project_plan.md §5 CreateEvent and §7.3. Build the CreateEvent screen in frontend/:
2-col form + live EventCard preview, flyer upload, FormField inputs, Sports toggle revealing run fields
(players_needed, skill, positions, indoor/outdoor), Publish CTA. Leave the "✨ Write with AI" button and
AI-tags panel as disabled placeholders (wired in Sprint 3). Bind the preview to createEventForm state.
```
**Verify:** fill the form → preview updates live → Publish creates a published event visible in DB.
- [ ] Done

### Step 2.3 — `GET /events` list + filters + `EventCard`  *(work-plan #11 + #12)*
```
Read planning/project_plan.md §7.3 GET /api/events, the §7 EventCard shared shape (with the audit fix:
organizer + going_stack avatars + capacity + sports counts), §8 filters object, and §5 EventCard/grid.
Backend: implement GET /api/events with multi-select filters (repeated ?category=&source=, nearLat/
nearLng/radiusKm via earth_distance, dateFrom/dateTo, priceMin/Max, isFree, ageMax, isSports, sort),
cursor pagination, and return the FULL EventCard shape (join organizer, lateral-subquery 3 avatars,
capacity + players_signed_up/needed for sports). Frontend: the EventCard component (variants standard /
ForYou-with-AIChip via showRationale) with AlmostFullBadge (players_signed_up/needed for sports, else
rsvp_count/capacity), GoingStack, SaveBtn, RSVPBtn, and the responsive flex-wrap grid.
```
**Verify:** the grid renders real seeded events with avatars + badges; filters change the result set + URL.
- [ ] Done

### Step 2.4 — Discover + EventDetail screens  *(work-plan #13 + #14)*
```
Read planning/project_plan.md §5 Discover and EventDetail, §7.3 GET /events/:id + /related.
Build Discover (SearchBar + location pill + CatRow + FilterBar multi-select + count header + ResultsGrid)
and EventDetail (dark header with poster + info + GoingStack + RSVP/Save CTAs + organizer FollowBtn,
light body About + Comments placeholder + sidebar MapCard via Google Maps + related events). A sports
EventDetail links through to SportsPickupDetail (built in S3). Increment view_count on detail load.
```
**Verify:** Discover filters work; clicking a card opens its detail with a working map.
- [ ] Done

### Step 2.5 — Save + RSVP + behavior beacon  *(work-plan #15 + #16)*
```
Read planning/project_plan.md §7.4 (save/rsvp), §6 rsvps/saved_events/interaction_events, §7.7
POST /api/interactions, and §8 re-fetch rules. Backend: PUT/DELETE /events/:id/save (idempotent,
maintains save_count) and PUT/DELETE /events/:id/rsvp — with the fix that rsvp_count only changes on
going transitions (not interested/waitlisted). Both emit an interaction_events row. Build the
fire-and-forget POST /api/interactions batch beacon (upserts the anon session first). Frontend: wire
SaveBtn/RSVPBtn with optimistic updates + query invalidation; send impression/view/click/dwell beacons
via sendBeacon. Add Saved/Going tabs on UserProfile (#18).
```
**Verify:** save/RSVP flips instantly + persists; `interaction_events` rows appear; counts update correctly.
- [ ] Done

### Step 2.6 — Basic For-You feed (fallback path)  *(work-plan #17)*
```
Read planning/project_plan.md §9.1 #1–#2, §9.2(E) cold-start, and the §9 "popular-events fallback"
decision. Build a BASIC POST /api/recommendations that, with no embeddings yet, ranks published +
in-home_city + future events by user_category_affinities/interest categories then popularity + recency
(the deterministic fallback), returns the EventCard shape + a neutral "Popular near you" rationale chip,
and writes recommendation_impressions. Frontend: the ForYouFeed screen (sticky SearchBar, FeedTabs,
CatRow, featured hero card, EventCard grid with AIChip). The full pgvector engine replaces the ranking
internals in Sprint 3 — keep the endpoint contract identical so the frontend doesn't change.
```
**Verify:** a freshly-onboarded user sees a non-empty, category-relevant feed with rationale chips.
- [ ] Done

> **End of Sprint 2 = MVP.** Demo the full loop: sign up → onboard → browse feed → filter/search → open event → save/RSVP. Tag `sprint-2-mvp`.

---

## Phase 3 — Sprint 3: AI + discovery depth

**Goal:** the real headline recommender, NL search, sports roster, and supporting AI. **This is where the behavioral-algorithm fixes get implemented.**

### Step 3.1 — Event embedding pipeline  *(work-plan #19)*
```
Read planning/project_plan.md §9.2(B) and §6 event_embeddings + ai_generation_logs.
Build the backend embedding pipeline: compose the deterministic text (title · category.name · top
event_tags.label · venue_name · city · truncated description [+ sport/skill for sports]), hash it
(content_hash = sha256(text‖model)), skip the API call if the hash is unchanged, else call the hosted
embeddings API (BACKEND ONLY, key from env), write embedding + model + content_hash + vector_version,
and log to ai_generation_logs. Trigger it from: publish, external sync, PATCH /events on composed-field
change, AND tag add/remove (the audit fix). Add POST /api/ai/embeddings/rebuild for batch/backfill.
Run the initial backfill over all seeded events. Add the HNSW cosine index if not already present.
```
**Verify:** after backfill, every published event has an `event_embeddings` row; editing a tag re-embeds it.
- [ ] Done

### Step 3.2 — User preference vector builder  *(work-plan #20 — apply the algorithm fixes)*
```
Read planning/project_plan.md §9.2(A) and §9.2(C), and spec_audit_recommendation_search.md.
Build the user_preference_vectors builder job with the applied audit fixes:
- interaction_events is the SINGLE replay source (don't also read rsvps/saved_events/follows — no double count)
- per-type base weights from the §9.2(A) table; any interaction_type NOT in the table is weight 0 and
  excluded (so a bare click never defaults to 1.0); click/rec_click = 0.18 as specced
- REVERSAL = SUPERSEDE: when a later unsave/rsvp_cancel/release_spot/unfollow exists for the same
  target, drop the earlier matching positive (net 0); a rec_dismiss with no prior positive contributes negative
- time decay exp(-Δt/H), H = decay_half_life_days (30); position-bias w/(1+ln(1+feed_position))
- seed term from user_interests → category centroids; blend α = min(1, signal_count/8)  [audit-lowered from /20]
- treat rsvp='going' as the effective top weight; attend "if present" (no non-sports check-in UI at demo)
- follow/unfollow use the organizer-events centroid
Also build the user_category_affinities rollup in the same job. Wire watermark-driven recompute (~15 min)
+ an event-triggered rebuild on save/rsvp so the feed visibly adapts. Where do category centroids live —
either a materialized view or computed-on-the-fly; note which you chose.
```
**Verify:** save an event → trigger rebuild → the user's vector changes and the next feed reorders.
- [ ] Done

### Step 3.3 — Recommendation engine proper  *(work-plan #21)*
```
Read planning/project_plan.md §9.2(D). Replace the basic /recommendations internals with the real
pipeline (same endpoint contract): PRE-FILTER (SQL: status/date-window/category/geo + exclude already
going/saved/recently-shown — NO price/age/free predicates, per the fix) → RANK (pgvector cosine <=> on
event_embeddings; LEFT JOIN so un-embedded candidates fall back to affinity/popularity, not vanish) →
RE-RANK (the coefficient blend incl. popularity = rsvp_count + players_signed_up + 2*save_count; MMR
diversity, disabled below ~30 candidates) → persist recommendation_impressions + templated rationale
(gated: only "Because you X" when a real active signal backs it, else neutral; hard-capped to fit the
AIChip). Wire POST /recommendations/:id/feedback (click/dismiss/convert) and the interactions back-writes.
```
**Verify:** the feed is now vector-personalized; rationale chips cite real signals; a dismiss reorders next run.
- [ ] Done

### Step 3.4 — Natural-language search  *(work-plan #22)*
```
Read planning/project_plan.md §9.3 and §7.6 POST /api/search. Build the two-layer search: (1) backend
LLM parse of q → parsed_filters (evidence-only — never invent a city; timezone-correct relative dates
like "this weekend"; isFree = price_min 0, null ≠ free), stored in search_queries; (2) embed the query;
(3) Layer-1 Postgres FTS + filters produce the bounded candidate set as HARD constraints; (4) pgvector
re-ranks within it (blend the user vector when authed) with the exact-title-match boost and the MVP
blend weights. Fall back to plain keyword search if the parser fails. Frontend: wire the SearchBar on
ForYouFeed + Discover to render parsedFilters as removable pills. Log result_count + clicked_event_id.
```
**Verify:** "free events this weekend" returns free, weekend events with correct removable pills; a paid event never leaks into a "free" search.
- [ ] Done

### Step 3.5 — Sports roster + SportsPickupDetail  *(work-plan #23)*
```
Read planning/project_plan.md §5 SportsPickupDetail, §7.4 (/positions, /roster, PATCH /roster/:entryId),
§6 sports_details/sports_positions/roster_entries + the capacity trigger + partial unique indexes.
Backend: GET /positions (open_slots), GET /roster (claimed + FIFO waitlist), POST /roster (join+claim,
auto-waitlist at capacity via the trigger), DELETE /roster (release + auto-promote next), PATCH
/roster/:entryId (host: promote/no_show/attended/remove). Frontend: SportsPickupDetail (dark header +
SportsCounter card with filled/total from players_signed_up + progress bar + position-picker grid + Join
CTA; light body roster table with SkillBadge + open slots + waitlist). "Ask Loop" drawer must not cover
the roster. sports cards read players_signed_up, not rsvp_count.
```
**Verify:** two users claim spots, the third is waitlisted at capacity; a release auto-promotes; host can mark attended.
- [ ] Done

### Step 3.6 — Auto-tag + AI description  *(work-plan #24 + #25)*
```
Read planning/project_plan.md §9.1 #4 and #5, §7.6 (autotag, generate-description).
Backend: POST /events/:id/autotag (LLM → tags with confidence, persist only ≥0.6, source=ai) and
POST /ai/generate-description ({title,category,details,tone} → description; length + no-hallucinated-facts
check; setting description_is_ai=true on save). Both backend-only, logged to ai_generation_logs.
Frontend: enable the "✨ Write with AI" button ("Writing…" state) and the removable "×" AI-tags panel on
CreateEvent. Accepting/removing a tag re-embeds the event (Step 3.1 trigger).
```
**Verify:** "Write with AI" fills the textarea; auto-tag suggests ≥0.6 tags; removing a pill re-embeds.
- [ ] Done

### Step 3.7 — Follows + OrganizerProfile + notifications  *(work-plan #26 + #27)*
```
Read planning/project_plan.md §7.2 (follow/followers/following), §6 follows + notifications, §5
OrganizerProfile. Backend: follow/unfollow (maintain counts; the DELETE writes an `unfollow`
interaction_events row per the fix), followers/following lists, and followed-organizer new-event
notifications feeding the TopNav bell. Frontend: FollowBtn everywhere, OrganizerProfile screen, and the
bell feed (GET /notifications, mark read/read-all).
```
**Verify:** following an organizer + they publish → a notification appears in the bell; unfollow leaves a signal row.
- [ ] Done

> **End of Sprint 3:** the AI-native product is real. Tag `sprint-3`.

---

## Phase 4 — Sprint 4: Social, polish, deploy

**Goal:** the social layer, remaining nice-to-haves, responsive polish, deploy, and any stretch.

### Step 4.1 — Reminders + dispatcher  *(work-plan #28)*
```
Read planning/project_plan.md §7.5 (reminders) + §6 event_reminders. Build POST /events/:id/reminders
(computes remind_at), GET /users/:id/reminders, DELETE /reminders/:id, and the dispatcher job (scans due
scheduled rows → emits notifications, marks sent). Add a small reminder picker on EventDetail after RSVP/save.
```
- [ ] Done

### Step 4.2 — Social feed + comments  *(work-plan #29 + #30)*
```
Read planning/project_plan.md §5 SocialFeed, §7.5 (/feed/social, /posts, /stories) and §7.3/§7.5 comments
(event AND post). Build StoriesRow + PostCard + posts/likes + stories/views, and threaded comments on
both EventDetail and posts. Remember: DELETE /comments/:id is a soft-delete that DECREMENTS
posts.comment_count (the fix). No comment likes (dropped).
```
- [ ] Done

### Step 4.3 — Conversational assistant  *(work-plan #31)*
```
Read planning/project_plan.md §9.1 #6, §7.6 (ai/conversations + messages), §6 ai_conversations/ai_messages.
Build the AIAssistantDrawer: floating Sparkles trigger + right-side drawer (w-320, z-40 backdrop) that
reuses the NL-search → pgvector pipeline to ground answers in real events (eventRefs → inline EventCards;
drop any id that doesn't resolve). Must not cover the SportsPickupDetail roster.
```
- [ ] Done

### Step 4.4 — OrganizerDashboard + analytics + feedback  *(work-plan #32 + #33)*
```
Read planning/project_plan.md work-plan #32 (OrganizerDashboard — the screen story 13 needs) + #33,
§7.4 (/events/:id/rsvps, PATCH /rsvps/:userId), §7.7 (/analytics, /feedback), §6 event_analytics_daily.
Build the OrganizerDashboard screen: RSVP list + a check-in toggle (the only non-sports surface that
fires `attend`) + per-event and aggregate analytics from event_analytics_daily (populated by a rollup
job). Build the in-app feedback form (POST /feedback).
```
- [ ] Done

### Step 4.5 — Responsive / mobile-web polish  *(work-plan #34)*
```
Read planning/project_plan.md §5 grid system + §8 mobile-web specifics. Do a polish pass across all
screens: breakpoints 390/768/1440, BottomBar gating, flex-wrap grid (w-full → 50% → 33% → 25%),
scroll-snap rows (.scrollbar-hide), the one selected-state rule (filled #6D5EFC + white text),
skeletons, empty states, offline toast. Test on a real phone viewport.
```
- [ ] Done

### Step 4.6 — Deploy  *(work-plan #35)*
```
Read planning/project_plan.md §10 (Docker + AWS ECS Fargate + RDS decision) + the backend-only-AI-key
constraint. Dockerize backend + frontend, provision RDS Postgres (enable pgvector/citext/cube/
earthdistance), deploy the API + a scheduler task on ECS Fargate, serve the frontend (S3+CloudFront or
a Fargate static server), wire secrets/env (embeddings/LLM keys backend-only), run migrations on deploy,
seed the demo data. Give me the deploy runbook.
```
- [ ] Done

### Step 4.7 — Stretch (only if time)  *(work-plan #36–#39)*
Map view · ticketing/QR check-in · promoter analytics deep-dive + AI flyer images · TikTok-style feed. One prompt each, same pattern, referencing the stretch issue.
- [ ] Done (optional)

> **End of Sprint 4:** deployed, polished, demo-ready. Tag `v1.0`.

---

## Cross-cutting: do these throughout

- **Verify behavior, not just types.** After any step with runtime behavior, use `/verify` to drive the actual flow (sign up, claim a spot, search) — not just "it compiles."
- **Test the fixes explicitly.** Write a test for each audit fix as you build it: reversal-supersede (save→unsave nets 0), rsvp_count only-on-going, anon session FK, sports capacity invariant, "free" search never returns paid, un-embedded candidate doesn't vanish.
- **One step = one branch = one PR.** Keep changes reviewable; run `/code-review` on the diff before merging.
- **Keep the plan the source of truth.** If reality forces a change (an API shape, a column), update `project_plan.md` in the same PR and note it in §10 — don't let code and plan drift.
- **Secrets never in git.** All keys via env; the embeddings/LLM key is backend-only, always.
- **Move the board card** Backlog → Sprint → In Progress → Review → Done as you go.

## How to prompt Claude effectively (for these steps)
- **Point at the plan section** in every prompt ("Read §7.4 …") so I load the corrected spec instead of guessing.
- **Name the audit fix** you want honored — the fixes live in the plan, but calling them out (e.g. "reversal = supersede") guarantees I build the right version.
- **Scope to one step.** "Don't build anything outside this step" keeps diffs small and reviewable.
- **Ask for the run/verify command** at the end of each prompt so you can confirm before committing.
- **If I drift**, paste the plan snippet and say "match this exactly."

---

## Quick map: work-plan issue → playbook step

| Sprint | Work-plan issues | Playbook steps |
|---|---|---|
| 1 | #1, #2, #3, #4, #5, #5b, #6, #7, #8 | 1.1 – 1.8 |
| 2 | #9, #10, #11, #12, #13, #14, #15, #16, #17, #18 | 2.1 – 2.6 |
| 3 | #19, #20, #21, #22, #23, #24, #25, #26, #27 | 3.1 – 3.7 |
| 4 | #28, #29, #30, #31, #32, #33, #34, #35, #36–#39 | 4.1 – 4.7 |
