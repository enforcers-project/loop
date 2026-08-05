# Reflection #5

Pod Members: **Benny Nketia, Mussie Aregay, Heartwill Gbekle**

## Reflection Questions

* How was the pacing of the capstone project? (i.e too slow, just right, too fast)

 Pacing was **just right at the top and too fast in the middle**. Sprint 1 (foundation) and Sprint 4 (polish + demo prep) both had the right amount of breathing room, but Sprints 2 and 3 were the crunch — Sprint 2 was where the headline AI (behavior-based recommender + NL search parse→SQL pre-filter→pgvector re-rank) had to land alongside the demoable core loop, and Sprint 3 was where "make it feel like a real product" (Posses, community reviews, share-to-DM, moderation, dark mode, pagination, Loopy) collided with the bug bash. The four-sprint, one-week-per-sprint cadence in `project_plan.md` was aggressive for a team of three — we hit it, but only because we cut external event sync twice (see Reflection #2 and #3) and moved several nice-to-haves to stretch. If we'd had one more week between Sprint 2 and Sprint 3, we would have paid down more of the mobile auth/session bugs before piling social features on top of them.

* To what extent did your plan change over the course of development? Knowing that you know now, what would you do differently if you were starting over?

 The **shape** of the plan stayed remarkably stable — the §6 data model, the two-role model (Attendee + Organizer, with `is_host` as a sub-capability), the PRE-FILTER → RANK → RE-RANK recommender pipeline, and the two-layer search architecture in §9 are all still what shipped. What **changed** was almost entirely scope at the edges:
 - **External event sync (Ticketmaster / SeatGeek) got cut.** It was MVP in the original plan, slipped two sprints in a row, and we officially moved it from "at risk" to "post-MVP" in Sprint 3. The dedupe schema is still there; no scheduled job is running.
 - **Posses** was not in the Week-6 spec at all — it emerged during Sprint 3 as a way to make RSVP feel social, got its own `planning/posses_feature.md`, and shipped end-to-end (create → invite → accept/decline → private visibility → notifications).
 - **Loopy** (the conversational AI assistant) was in §9.1 #6 as "nice-to-have"; it ended up being one of our demo highlights and needed real jailbreak hardening plus a late fix to stop it claiming genre matches when only the category matched.
 - **Reminders push/email** shipped scheduler-only; SMS became stretch.
 - **The follows graph** stayed a soft boost in For You rather than a hard ranking signal.

 Starting over, we would do three things differently. First, **pick the hosted inference path in Week 5, not Sprint 2** — moving embeddings off the Render web service after we'd already integrated MiniLM in-process cost us real time (see Reflection #2). Second, **write the Week-6 spec with a smaller MVP and a bigger stretch bucket** — external sync should have been stretch from day one, and Posses should have been on our radar as a Sprint-3 candidate instead of a scope surprise. Third, **cut over to real Postgres on day 1** — the in-memory mock we started Sprint 1 with meant every real feature had to be re-plumbed later.

* How did the spec-driven workflow hold up across the full project? When did maintaining project_plan.md save time or prevent confusion — and when did it feel like overhead?

 Overall the spec-driven workflow held up **very well** — `project_plan.md` grew to ~1,800 lines and only has 9 commits touching it, which tells you the structure was right early and the changes were surgical, not rewrites. Where the spec paid off most:
 - **§6 data model.** Having pgvector, citext, the generated `search_document`, the roster-capacity trigger, and the `Σ position.capacity = players_needed` invariant written down before Mussie built the Prisma schema meant we caught those gotchas at design time, not in prod (see Reflection #1).
 - **§7 API contracts.** Reminders, the organizer dashboard, and the beacon endpoint were all built straight off the contract without any back-and-forth on shape.
 - **§9.4 AI Feature Decisions Log.** Whenever we picked a value — `α=min(1,signal_count/20)`, the 30-day decay half-life, the `confidence ≥ 0.6` tag threshold, `λ=0.7` for MMR — it went in the table with a "why", so nobody re-litigated it in a later sprint.

 Where it felt like overhead: **§9.4 "popular events fallback"** was too vague at the start of Sprint 2 and we ended up picking defaults on the fly (published, in home_city, next 30 days, ranked by save + RSVP count) and writing them back in Sprint 3. The spec occasionally lagged the code — the Bug Bash reconciliation section, Posses, Loopy, community reviews, and moderation all had to be written back into the spec in Sprint 3/4 as `docs: sprint 3 reflection + spec reconciliation writeback`. That writeback loop is the honest cost of a living spec: worth it, but you have to budget the time.

* Where was Claude most useful during capstone development? Where did its output require the most revision, and what was missing from the spec when that happened?

 **Most useful:** wiring endpoints and components straight off the §6/§7 contracts (Prisma models → API handler → React query hook), one-shotting the auth middleware to attach `user_sessions` for anonymous-first-touch so `interaction_events.session_id` FK held, the entire NL-search parse→filter→re-rank flow once §9.3 was pinned down, and unblocking us on the Google Maps + geocoding integration for near-me. Claude was also great at the SQL-heavy work — the geo-radius pre-filter, the position-bias correction, the MMR diversity pass — because those were spec'd numerically and it could just implement the formula.

 **Where it needed the most revision:** anything the spec left underspecified. Loopy's initial draft over-claimed genre matches (e.g. "this jazz event matches your interest in jazz" when the event was just tagged `music`) because §9.1 #6 didn't define what "match" meant precisely enough — we had to add category-vs-genre disambiguation and write a genre-mismatch fix (commit `c04c6a7`). The Discover "This Weekend" / "Today" filters shipped broken because §7.3 didn't pin the timezone/week-boundary semantics, and DOB validation accepted future dates because the spec said "18+" without saying "reject unrealistic ages." All of these are in the Bug Bash reconciliation section now.

* Looking back at the spec you wrote in Week 6 vs. the final state of project_plan.md: what changed, and what stayed stable? What does the git history of your planning file tell you about how the project evolved?

 The git history on `project_plan.md` is short — 9 commits over ~5 weeks — and that's the tell: the **skeleton was right from Week 6**. The initial commit + the two Week-6 revisions (`Revise project plan with detailed updates`, `Update project plan with new image and data model details`) put in place §6 (data model), §7 (API), §9 (AI features), and §10 (Decisions Log), and nothing after that was a structural rewrite. What the later commits show is the shape of the evolution:
 - `Move backend to port 3000 and scope hosting under the Organizer role` (July 6) — the "any attendee can host" decision was reversed and hosting became `is_host` on Organizer. This is one of the biggest single conceptual changes in the whole project.
 - `chore(config): document required API keys and record embedding model decision` (July 7) — we pinned `vector(384)` on a MiniLM-class model and wrote it into §6/§10, closing the ambiguity from Week 6.
 - `migrate entire project from TypeScript to plain JavaScript` (July 8) — a stack-level change that touched every file but did *not* require a spec rewrite, because §6/§7 were language-neutral.
 - `docs: posses feature plan` (July 27) — the first genuinely-new feature written after Week 6.
 - `docs: sprint 3 reflection + spec reconciliation writeback` (July 31) — the master spec catching up to the shipped app.

 What stayed stable: the two-role model, the data model, the API surface, and the AI pipeline shape. What changed: hosting semantics, the embedding model choice, TypeScript → JavaScript, the addition of Posses, the cut of external sync, and the accumulated bug-bash fixes.

* How did the AI Feature Decisions Log hold up? Was it useful to have a running record of how the AI feature changed across sprints?

 It held up extremely well — arguably the single most useful artifact in the whole spec. §9.4 has 11 rows spanning Sprint 1 → Sprint 4, each with a "what changed" and a "why", and every one of them is a decision we would otherwise have re-argued during a sprint or, worse, silently drifted from. The rows about **backend-only AI calls** (protects the API key), **`α = min(1, signal_count/20)` seed blend** (cold-start feed), **PRE-FILTER before pgvector** (never scan the whole catalog), and **`content_hash` re-embed skip** (cost guard on re-syncs) were the ones we referenced most often when adding new features or debugging. The **30-day decay half-life** and **`confidence ≥ 0.6` tag threshold** rows also let us tune the recommender and auto-tagger with a single number change instead of a design meeting. The one thing we would improve: add a "verified in production?" column, so a decision made in Sprint 2 that turns out to be wrong in Sprint 4 has a clear place to be marked superseded rather than silently overridden by code.

* How helpful were the labs and weekly assignments in preparing you to create a capstone project? Be specific, what topics do you still have questions about that may or may not have been covered?

 The labs and weekly assignments were most helpful on the **planning artifacts and the Prisma/Postgres side** — the spec-driven workflow, the Decisions Log format, and pgvector/citext all had direct lab counterparts, and it showed in how fast Sprint 1 came together (see Reflection #1). Weeks that covered React state management, TanStack Query, and JWT-in-HTTP-only-cookie also transferred cleanly. Where we needed more support:
 - **Hosted embedding / LLM inference at demo scale.** Groq and Cloudflare Workers AI cold-start latency, quota behavior, and streaming semantics weren't covered — we learned by trial (Reflection #2).
 - **Mobile-web auth cookies across origins.** Getting the API and app on the same origin via a Render blueprint proxy was a real production concern we hadn't practiced.
 - **Semantic-search evaluation.** How do you know if a re-rank is actually better? We shipped on eyeball tests and rationale sanity-checks; we still don't have a proper offline eval loop.
 - **LLM safety / jailbreak hardening.** Loopy needed real hardening in Sprint 3, and we improvised.

* When planning for the capstone project, which resources were the most helpful? (i.e mentors, instructors & TAs, ideation process, pod syncs, wireframes, sprint planning, bug bash, practice demo day, etc.)

 In rough order of impact:
 1. **Our own `planning/spec_audit_recommendation_search.md` and §6/§9 of `project_plan.md`.** These drove the NL-search PR (#86), the real recommender pipeline, and every schema decision — they were the single biggest force multiplier because they let all three of us build off the same source of truth without stepping on each other.
 2. **The bug bash.** It surfaced real gaps (weekend/today filters, silent 5-char requirement in user search, DOB accepting future dates, story viewer backdrop, share modal) that we would not have caught internally, and directly produced the Spec Reconciliation section (Reflection #3).
 3. **Sprint planning + the four-milestone cadence in the plan.** Milestones 1–4 in the `## GitHub Work Plan` section of `project_plan.md` were what kept us from over-committing week over week, and let us honestly track what was slipping (external sync, twice).
 4. **Pod syncs.** Coordinating who was editing `AppContext` and `api.js` was our biggest people-problem in Sprint 1 (Reflection #1); short daily syncs from Sprint 2 onward largely fixed the rebase collisions.
 5. **Mentors / TAs.** Most valuable at the two decision points: reversing "any attendee can host" to `is_host` on Organizer, and picking a hosted inference path.
 6. **Wireframes.** The Figma export drove §5 and was solid ground truth for the core loop; where it misled us was the implied 4-role model (attendee/organizer/promoter/sportsHost), which we had to resolve to a 2-role model + capability boolean.
 7. **Practice demo day.** Forced us to seed enough events (26 by Sprint 3, and jazz + multi-genre music events later so Loopy had real content to recommend against) so the demo wouldn't feel empty.
