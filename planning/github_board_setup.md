# GitHub Board Setup — Manual Checklist

> **Sprint 0 team task.** Set up the project board, 4 milestones, and 39 issues by hand in the browser. No CLI needed. Repo: **github.com/enforcers-project/loop**
>
> Do this once, together, in ~30–45 min. Tick each box as you go.

---

## Step 1 — Create the Project board

1. Go to the repo → **Projects** tab → **New project** → **Board** template.
2. Name it **Loop**.
3. Make sure it has these columns (rename/add as needed): **Backlog → Sprint → In Progress → Review → Done**.

- [ ] Board created with the 5 columns

---

## Step 2 — Create 4 Milestones

Repo → **Issues** tab → **Milestones** → **New milestone**. Create these four (set due dates to the Friday of each sprint):

- [ ] **Sprint 1 — Foundation** — due **Fri Jul 17, 2026**
- [ ] **Sprint 2 — Core loop (MVP)** — due **Fri Jul 24, 2026**
- [ ] **Sprint 3 — AI + discovery depth** — due **Fri Jul 31, 2026**
- [ ] **Sprint 4 — Social, polish, deploy** — due **Fri Aug 7, 2026**

---

## Step 3 — Create 3 labels (optional but recommended)

Repo → **Issues** → **Labels** → **New label**:

- [ ] `MVP` (green) — must ship
- [ ] `nice-to-have` (yellow) — valuable, cuttable
- [ ] `stretch` (gray) — only if time

---

## Step 4 — Create the 39 issues

For each row: **Issues → New issue**, paste the **Title**, set the **Milestone** and **Label**, and (optional) assign an owner. Add it to the **Loop** project board (in Backlog).

> Tip: put the "References" note from `project_plan.md` §Starter-Issues in the issue body so the builder knows which plan section to read.

### Sprint 1 — Foundation (Milestone: Sprint 1)

- [ ] **#1** Repo, CI pipeline, and app scaffold (lint/test/build via GitHub Actions) — `MVP` — *owner: Heartwill*
- [ ] **#2** Prisma schema + migrations for full §6 data model; enable pgvector/citext/pg_trgm extensions, vector(DIM) — `MVP` — *owner: Mussie + Benny*
- [ ] **#3** Seed lookup data: 6 categories (Figma tokens) + 24 interests — `MVP` — *owner: Benny*
- [ ] **#4** Seed 40–60 native demo events incl. pickup runs — `MVP` — *owner: Benny*
- [ ] **#5** External-sync stub + dedup: Ticketmaster + SeatGeek adapters + provider-taxonomy→category map — `MVP` — *owner: Benny*
- [ ] **#5b** Job runner/scheduler (cron + worker; empty stubs) — `MVP` — *owner: Benny*
- [ ] **#6** Auth: signup/login/logout/refresh + JWT HTTP-only cookie + GET /auth/me + session middleware — `MVP` — *owner: Mussie*
- [ ] **#7** Onboarding flow: interest ChipGrid + city step; commit via PUT /users/:id/interests (picks only) — `MVP` — *owner: Heartwill*
- [ ] **#8** App shell + navigation: TopNav/BottomBar, routing, TanStack Query + Auth/Toast/Modal contexts — `MVP` — *owner: Heartwill*

### Sprint 2 — Core loop / MVP (Milestone: Sprint 2)

- [ ] **#9** Event CRUD + publish (draft→published, gate to organizer/is_host, capacity invariant) — `MVP` — *owner: Mussie*
- [ ] **#10** CreateEvent screen: 2-col form + live EventCard preview — `MVP` — *owner: Heartwill*
- [ ] **#11** GET /events list + multi-select filters + sort; CatRow + FilterBar wired to URL — `MVP` — *owner: Benny*
- [ ] **#12** EventCard component (standard / ForYou-with-AIChip) + responsive flex-wrap grid — `MVP` — *owner: Heartwill*
- [ ] **#13** Discover screen (search bar + location pill + CatRow + FilterBar + count header + grid) — `MVP` — *owner: Heartwill*
- [ ] **#14** EventDetail screen: dark header + RSVP/Save CTAs + About + related — `MVP` — *owner: Mussie*
- [ ] **#15** Save + RSVP endpoints + optimistic UI + denormalized counts + Saved/Going tabs — `MVP` — *owner: Mussie*
- [ ] **#16** Behavior-signal beacon: fire-and-forget batch ingest to interaction_events — `MVP` — *owner: Benny*
- [ ] **#17** Basic For-You feed: POST /recommendations (affinity/popularity fallback) + ForYouFeed screen — `MVP` — *owner: Benny*
- [ ] **#18** UserProfile screen (Saved / Going / Interests tabs) — `MVP` — *owner: Heartwill*

### Sprint 3 — AI + discovery depth (Milestone: Sprint 3)

- [ ] **#19** event_embeddings pipeline (composed text, content_hash skip-guard, HNSW; run on publish/sync/edit) — `MVP` — *owner: Benny*
- [ ] **#20** user_preference_vectors builder (single replay source; reversal=supersede; decay H=30d; seed blend) — `MVP` — *owner: Benny*
- [ ] **#21** Recommendation engine proper: PRE-FILTER → pgvector kNN → RE-RANK + MMR + rationale + feedback — `MVP` — *owner: Benny*
- [ ] **#22** Natural-language search: NL parse → parsed_filters (hard constraints) + pgvector re-rank + pills — `MVP` — *owner: Mussie*
- [ ] **#23** Sports roster + SportsPickupDetail (join/release/waitlist/promote, capacity trigger, host manage) — `MVP` — *owner: Mussie + Heartwill*
- [ ] **#24** AI auto-tag: POST /events/:id/autotag (confidence ≥ 0.6) + removable panel — `nice-to-have` — *owner: Mussie*
- [ ] **#25** AI description: POST /ai/generate-description + "✨ Write with AI" + fact/length check — `nice-to-have` — *owner: Mussie*
- [ ] **#26** Follows + OrganizerProfile: follow/unfollow, denormalized counts, FollowBtn — `nice-to-have` — *owner: Heartwill*
- [ ] **#27** Followed-organizer new-event notifications + TopNav bell feed — `nice-to-have` — *owner: Heartwill*

### Sprint 4 — Social, polish, deploy (Milestone: Sprint 4)

- [ ] **#28** Reminders: schedule pre-event reminders + dispatcher job → notifications — `nice-to-have` — *owner: Mussie*
- [ ] **#29** SocialFeed: StoriesRow + PostCard + posts/likes + stories/views — `nice-to-have` — *owner: Heartwill*
- [ ] **#30** Comments: threaded comments on EventDetail + posts (soft-delete decrements count) — `nice-to-have` — *owner: Heartwill*
- [ ] **#31** Conversational AI assistant drawer (reuses NL-search → pgvector; inline EventCards) — `nice-to-have` — *owner: Benny*
- [ ] **#32** OrganizerDashboard: RSVP list + check-in toggle + analytics — `nice-to-have` — *owner: Mussie + Heartwill*
- [ ] **#33** In-app feedback form — `nice-to-have` — *owner: Heartwill*
- [ ] **#34** Responsive / mobile-web polish pass (breakpoints, grid, scroll-snap, selected-state) — `MVP` — *owner: Heartwill*
- [ ] **#35** Deploy: Dockerize, AWS ECS Fargate + RDS Postgres (pgvector), secrets backend-only — `MVP` — *owner: Mussie*

### Stretch backlog (Milestone: Sprint 4, or leave unassigned in Backlog)

- [ ] **#36** Map view (Google Maps pins + "near me" radius) — `stretch` — *owner: Heartwill*
- [ ] **#37** Ticketing / payments + QR check-in — `stretch` — *owner: Mussie*
- [ ] **#38** Promoter analytics deep-dive + AI flyer-image generation — `stretch` — *owner: Benny*
- [ ] **#39** TikTok-style vertical social feed — `stretch` — *owner: Heartwill*

---

## Done when

- [ ] Board exists with 5 columns
- [ ] 4 milestones created with Friday due dates
- [ ] All 39 issues created, each with a milestone + label, added to the board's Backlog
- [ ] (Optional) owners assigned per the lanes in `work_plan_and_schedule.md`

> Owners above mirror the lanes in [work_plan_and_schedule.md](work_plan_and_schedule.md) — swap freely.
