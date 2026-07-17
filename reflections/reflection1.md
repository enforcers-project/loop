# Reflection #1

Pod Members: **Benny Nketia, Mussie Aregay, Heartwill Gbekle**

## Reflection Questions

* Name at least one successful thing this week.

 The big one is that we actually have a working end-to-end signup → onboarding → feed flow now, backed by a real Postgres database instead of the in-memory mock we started the sprint with. Mussie got the full §6 Prisma schema in with pgvector, citext, the generated `search_document`, and the roster capacity trigger, and once that landed the rest of us could stop stubbing things and start wiring real endpoints. We also got further than the Sprint 1 plan asked for — event CRUD, save/RSVP that persists across refresh, follows, and the sports roster backend all merged this week, which sets us up well going into Sprint 2.

* What were some challenges you and/or your group faced this week?

 A few things bit us. The RSVP counts and "Going" state kept desyncing between screens on refresh because the frontend hydration was clobbering the in-session toggle — took a couple of PRs (#49 and #53) to fully nail down. The onboarding city step also took longer than expected because we had to swap in real Google Places Autocomplete + browser geolocation instead of the mock city list, and threading the user's home location through ForYou / Discover / SocialFeed touched more files than we thought. Coordinating who was editing `AppContext` and `api.js` was probably our biggest people-problem — we stepped on each other's toes a few times and had to rebase.

* Did you finish all of your tasks in your sprint plan for this week? If you did not finish all of the planned tasks, how would you prioritize the remaining tasks on your list?  (i.e over planned, did not know how to implement certain features, miscommunication from the team, had to pivot from original plans, etc.)

 We finished all of the Sprint 1 planned work (data model, auth, onboarding, seed data, app shell) and actually pulled a handful of Sprint 2 issues in early — event CRUD, save/RSVP endpoints, EventDetail, follows, and the sports roster backend. The one thing we deliberately deferred was any real AI — the recommender is still the "affinity + popularity fallback" ranker, not the behavior-vector version from §9. That was the right call: we needed the interaction_events beacon and enough live user behavior to seed real vectors before turning on the real ranker, so it stays priority #1 for Sprint 2. If anything we slightly over-planned Sprint 1 by putting the whole schema in one issue — it was the right shape but it was the critical path for four days.

* Did the resources provided to you help prepare you in planning and executing your capstone project sprint this week? Be specific, what resources did you find particularly helpful or which tasks did you need more support on?

 The spec audit doc (`planning/spec_audit_recommendation_search.md`) and the implementation playbook were the most useful — having the "gotchas" written down (anonymous session FK, `rsvp_count` only-on-`going`, the `Σ position.capacity = players_needed` invariant) meant we caught them in the schema pass instead of hitting them in prod. Prisma + pgvector docs were solid for the schema work. Where we could have used more support: the Cloudflare Workers AI / Groq embedding pipeline — we spent real time figuring out that running MiniLM in the Render web service was too heavy and had to move inference off-box (see commit `c21a03c`).

* Which features and user stories would you consider "at risk"? How will you change your plan if those items remain "at risk"?

 A few things we're watching going into Sprint 2:
 - **The real behavior-based recommender (headline AI feature, story 2).** We're still on affinity + popularity fallback. If we can't turn on the vector-based ranker in Sprint 2, we ship the fallback with a stronger "Because you saved…" rationale layer and call the vector ranker a later improvement — but we'd rather not, since it's *the* headline feature.
 - **Natural-language search (story 3).** The endpoint exists but the parse-to-filters step (§9.2 F) is thin. If it's not solid by end of Sprint 2, we scope it down to keyword + a small set of parsed filters (date, free, category) instead of the full NL surface.
 - **External event sync (Ticketmaster + SeatGeek).** Stub is in, dedupe is in the schema, but a real, scheduled sync isn't running yet. If it slips, we demo with a larger native seed and mark external sync as a stretch item.
 - **Reminders + notifications beyond the followed-organizer bell.** Nice-to-have; first thing we cut if Sprint 2 gets tight.
