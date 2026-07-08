# Loop — Team Work Division & Schedule

> **Purpose:** how the three of us split the 39-issue work plan, what each sprint delivers, and the calendar from **today (Tue Jul 7, 2026)** to ship. Grounded in [`project_plan.md` §"GitHub Work Plan"](project_plan.md) and sequenced by [`implementation_playbook.md`](implementation_playbook.md).
>
> **Cadence:** 4 sprints, one calendar week each. **Deliverables due Fridays 6:00pm PDT.** **MVP demoable by end of Sprint 2.**

---

## Where we actually are (honest baseline)

The **frontend UI is scaffolded** — all 12 screens and the shared component library render — but every interaction is *simulated in the browser* (save/RSVP/follow are in-memory React state that vanishes on refresh). The **backend is a read-only in-memory mock**: no database, no Prisma schema, no real auth, no persistence, no AI. So the presentation layer is ~done; **the product is not started.** The critical path is standing up persistence (Prisma + Postgres) — everything else depends on it.

---

## Ownership lanes

We each **own a lane** end-to-end (backend + the frontend wiring for our features), so there's one clear reviewer per area and merge conflicts stay low. Pairing is called out where an issue crosses lanes. **Swap lanes freely** — this is a starting allocation, not a contract.

| Lane | Owner | Scope |
|---|---|---|
| **A — Platform & Data** | **Mussie** | Repo/CI, Prisma schema & migrations, Postgres/pgvector, auth & sessions, event CRUD, save/RSVP, roster capacity logic, reminders, deploy. |
| **B — AI, Search & Recs** | **Benny** | Embeddings pipeline, preference vectors, recommendation engine, NL search, external event sync, job runner, conversational assistant, analytics rollups. |
| **C — Frontend & UX** | **Heartwill** | App shell/routing/contexts, onboarding, all screen wiring to real APIs, EventCard/grid, sports & organizer screens, social feed, responsive polish. |

Lane A/B are backend-heavy (that's where the unbuilt work is); Lane C is mostly **wiring the existing UI to real endpoints**, which is why C carries more issue *count* but comparable effort.

---

## Schedule at a glance

| Sprint | Dates (Mon–Fri) | Milestone | Demo checkpoint |
|---|---|---|---|
| **Sprint 0 — Setup** | **Tue Jul 7 – Fri Jul 10** | Accounts, keys, board, DB running locally | DB + extensions up; board has 39 issues |
| **Sprint 1 — Foundation** | **Jul 13 – Jul 17** | Data model live, auth, onboarding, seed data | Sign up → onboard → land on (empty) feed |
| **Sprint 2 — Core loop (MVP)** | **Jul 20 – Jul 24** | **Working MVP over real data** | Sign up → browse feed → filter/search → open → save/RSVP |
| **Sprint 3 — AI + depth** | **Jul 27 – Jul 31** | Real recommender, NL search, sports roster | Feed personalizes from behavior; claim a pickup spot |
| **Sprint 4 — Social, polish, deploy** | **Aug 3 – Aug 7** | Social layer, polish, **deployed v1.0** | Live URL, full walkthrough |

> Buffer: **Fri afternoons** each sprint are integration + demo, not new work. If a sprint slips, cut *nice-to-have* issues first (they're marked), never MVP.

---

## Sprint 0 — Setup (Tue Jul 7 – Fri Jul 10)

**Goal:** unblock everyone. No feature code — get accounts, keys, the board, and a running database so Sprint 1 starts cold-free.

| Owner | Tasks |
|---|---|
| **All (Tue, together)** | Create GitHub Project board (Backlog → Sprint → In Progress → Review → Done), 4 milestones (Sprint 1–4), paste the **39 starter issues** from `project_plan.md`. Agree on the working agreements below. |
| **A — Mussie** | `docker-compose.yml`: Postgres 16 + pgvector; init SQL enabling `vector`, `citext`, `pg_trgm`, `cube`, `earthdistance`. Wire `backend/.env`. Confirm `\dx` shows all 5. |
| **B — Benny** | Get API keys into a shared password manager — **never git**: Ticketmaster, SeatGeek, Google Maps, **Groq** (LLM — parse/tag/describe/chat), **Hugging Face** (embeddings). **AI stack decided (all free, all off-box so the Render web service stays thin):** LLM → **Groq** (`llama-3.1-8b-instant` for parse/tagging, `llama-3.3-70b-versatile` for chat/descriptions); embeddings → **`all-MiniLM-L6-v2` (384-d) via the Hugging Face Inference API**, swappable to a self-hosted Fly/Railway box later. **DIM pinned: `vector(384)`** — same model embeds events *and* queries (see `project_plan.md` §10). Spike one backend Groq call + one HF embed call to confirm both keys work. |
| **C — Heartwill** | Inventory the existing frontend: list which screens/components need real-API wiring vs mock, note where TanStack Query + Auth/Toast/Modal contexts will slot in. Confirm the Vite `/api` proxy + build both pass. |

**Done when:** board is populated; `docker compose up` gives a DB with all extensions; embedding key verified and `DIM` pinned in the plan (**pinned: `vector(384)`**); frontend still builds.

---

## Sprint 1 — Foundation (Jul 13 – Jul 17)

**Goal:** the full §6 data model as Prisma, auth, onboarding, seed data, sync stub, job runner. **No AI yet.**

| Issue | Title | Owner |
|---|---|---|
| #1 | Repo/CI finalize + app scaffold (lint/typecheck/build on PR) | **C** |
| #2 | **Prisma schema + migrations for all §6 tables/enums** + pgvector/citext extensions, `vector(384)`, HNSW index, generated `search_document`, capacity trigger | **A (lead) + B (pair on vector/index/raw-SQL parts)** |
| #3 | Seed 6 categories + 24 interests (Figma tokens, `interests.category_id` NOT NULL) | **B** |
| #4 | Seed 40–60 native demo events incl. pickup runs (guarantees a non-empty feed) | **B** |
| #5 | External-sync stub + dedup + provider-taxonomy→category map | **B** |
| #5b | Job runner/scheduler (cron/worker; register empty stubs) | **B** |
| #6 | Auth: signup/login/logout/refresh + JWT HTTP-only cookie + `GET /auth/me` + session middleware (anon first-touch) | **A** |
| #7 | Onboarding flow (ChipGrid "pick ≥3" + city step; commit via `PUT /users/:id/interests`, **picks only — no vector yet**) | **C** |
| #8 | App shell + nav (TopNav/BottomBar, routing, TanStack Query + Auth/Toast/Modal contexts) | **C** |

**Critical path:** #2 (Prisma schema) blocks almost everything — start it Monday, get it merged by **Wed**. Bake in the audit fixes (see playbook Step 1.3): `interests.category_id` NOT NULL, one-active-row vector tables, `UNIQUE(source, external_id)`, partial unique indexes, `Σ position.capacity = players_needed`.

**Done when:** a user can sign up → onboard (pick 3 interests + city) → land on an empty `/feed`; DB is seeded (`SELECT category_id, count(*) FROM events GROUP BY 1` spans all categories incl. sports); CI green. **Tag `sprint-1`.**

---

## Sprint 2 — Core loop / MVP (Jul 20 – Jul 24)

**Goal:** create → discover → open → save/RSVP works end-to-end over real data. **This is the demoable MVP.**

| Issue | Title | Owner |
|---|---|---|
| #9 | Event CRUD + publish (draft→published, gate to organizer/is_host, capacity invariant) | **A** |
| #10 | CreateEvent screen (2-col form + live EventCard preview; AI buttons disabled placeholders) | **C** |
| #11 | `GET /events` list + multi-select filters (category/geo/date/price/free/sports) + cursor pagination | **B** |
| #12 | EventCard component (standard / ForYou variants) + responsive flex-wrap grid | **C** |
| #13 | Discover screen (SearchBar + location pill + CatRow + FilterBar + count header + grid) | **C** |
| #14 | EventDetail screen (dark header + RSVP/Save CTAs + About + related; increment `view_count`) | **A** |
| #15 | Save + RSVP endpoints + optimistic UI (`rsvp_count` only on `going`; denormalized counts) | **A** |
| #16 | Behavior-signal beacon → append-only `interaction_events` (upsert anon session first) | **B** |
| #17 | Basic For-You feed (affinity/popularity fallback ranking; `AIChip` rationale; ForYouFeed screen) | **B** |
| #18 | UserProfile screen (Saved / Going / Interests tabs) | **C** |

**Test the fixes explicitly** as you build: `rsvp_count` only-on-`going`, anon-session FK holds, save/RSVP persists across refresh.

**Done when:** the full loop demos over live seed data: sign up → onboard → browse a populated feed → filter/search → open an event → save/RSVP (persists). **Tag `sprint-2-mvp`.** ← **This is the milestone that matters most; protect it.**

---

## Sprint 3 — AI + discovery depth (Jul 27 – Jul 31)

**Goal:** the real headline recommender, NL search, and the sports roster. This is where the behavioral-algorithm fixes land.

| Issue | Title | Owner | Type |
|---|---|---|---|
| #19 | `event_embeddings` pipeline (composed text, `content_hash` skip-guard, HNSW; run on publish/sync/edit + tag change) | **B** | MVP |
| #20 | `user_preference_vectors` builder (single replay source; reversal=supersede; decay H=30d; seed blend α=min(1,signal/8)) | **B** | MVP |
| #21 | Recommendation engine proper (PRE-FILTER → pgvector kNN → RE-RANK + MMR + rationale + feedback loop) | **B** | MVP |
| #22 | Natural-language search (LLM parse → `parsed_filters` as hard constraints; pgvector re-rank; removable pills) | **A** | MVP |
| #23 | Sports roster + SportsPickupDetail (join/release/waitlist/promote, capacity trigger, host manage) | **A (backend) + C (screen)** | MVP |
| #24 | AI auto-tag (`confidence ≥ 0.6`, removable "×" panel) | **A** | nice-to-have |
| #25 | AI description ("✨ Write with AI" + fact/length check) | **A** | nice-to-have |
| #26 | Follows + OrganizerProfile (follow/unfollow, denormalized counts, FollowBtn) | **C** | nice-to-have |
| #27 | Followed-organizer new-event notifications + TopNav bell feed | **C** | nice-to-have |

**Cut order if short on time:** #25 → #24 → #27 (all nice-to-have). Keep #19–#23 (the headline features).

**Done when:** the feed is vector-personalized (save an event → next feed reorders, rationale cites a real signal); "free events this weekend" returns free weekend events and **never leaks a paid event**; two users claim spots and a third waitlists at capacity, a release auto-promotes. **Tag `sprint-3`.**

---

## Sprint 4 — Social, polish, deploy (Aug 3 – Aug 7)

**Goal:** social layer, remaining nice-to-haves, responsive polish, and a deployed v1.0.

| Issue | Title | Owner | Type |
|---|---|---|---|
| #28 | Reminders (schedule + dispatcher job → notifications) | **A** | nice-to-have |
| #29 | SocialFeed (StoriesRow + PostCard + posts/likes + stories/views) | **C** | nice-to-have |
| #30 | Comments (threaded, on EventDetail + posts; soft-delete decrements count) | **C** | nice-to-have |
| #31 | Conversational AI assistant drawer (reuses NL-search → pgvector; inline EventCards) | **B** | nice-to-have |
| #32 | OrganizerDashboard (RSVP list + check-in toggle + analytics) | **A (backend/rollup) + C (screen)** | nice-to-have |
| #33 | In-app feedback form | **C** | nice-to-have |
| #34 | **Responsive / mobile-web polish pass** (390/768/1440, grid, scroll-snap, selected-state rule, skeletons, empty states) | **C (all pitch in)** | MVP |
| #35 | **Deploy** (Dockerize, AWS ECS Fargate + RDS Postgres w/ pgvector, secrets backend-only, migrate + seed on deploy) | **A (lead), all support** | MVP |

**Priority within the sprint:** #34 polish + #35 deploy are the MVP-tagged musts — do them first / in parallel with the social nice-to-haves. Everything else is cuttable.

**Done when:** deployed to a live URL, responsive on a real phone viewport, full walkthrough works end-to-end. **Tag `v1.0`.**

---

## Stretch backlog (only if a sprint finishes early — explicitly out of the committed plan)

| Issue | Title | Natural owner |
|---|---|---|
| #36 | Map view (Google Maps pins + "near me" radius) on Discover/EventDetail | C |
| #37 | Ticketing / payments + QR check-in | A |
| #38 | Promoter analytics deep-dive + AI flyer-image generation | B |
| #39 | TikTok-style vertical social feed | C |

Pull one into a sprint **only** after that sprint's MVP + nice-to-haves are merged and green.

---

## Working agreements

- **One issue = one branch = one PR.** Branch name `step-<n>-<slug>`. Keep diffs reviewable.
- **Every PR gets one review** (from another lane owner) + green CI before merge.
- **Verify behavior, not just types.** After anything with runtime behavior, actually drive the flow (sign up, claim a spot, search) — use `/verify`. Run `/code-review` on the diff before requesting review.
- **Test each audit fix as you build it:** reversal-supersede (save→unsave nets 0), `rsvp_count` only-on-`going`, anon-session FK, sports capacity invariant, "free" search never returns paid, un-embedded candidate doesn't vanish.
- **Plan is the source of truth.** If reality forces a schema/API change, update `project_plan.md` in the *same* PR and note it in §10 — don't let code and plan drift.
- **Secrets never in git.** All keys via env; the embeddings/LLM key is **backend-only, always**.
- **Daily 15-min standup** (async in the group chat is fine): yesterday / today / blockers.
- **Move the board card** Backlog → In Progress → Review → Done as you go.
- **Read the plan section named in each playbook prompt** before building — the audit fixes live there.

---

## Milestone summary (dates → deliverable)

- **Fri Jul 10** — Setup done: DB + extensions running, keys secured, board populated, `DIM` pinned (`vector(384)`).
- **Fri Jul 17** — `sprint-1`: data model + auth + onboarding + seed live.
- **Fri Jul 24** — `sprint-2-mvp`: **the demoable MVP** (the one to protect).
- **Fri Jul 31** — `sprint-3`: AI recommender + NL search + sports roster real.
- **Fri Aug 7** — `v1.0`: social + polish + **deployed**.
