# Reflection #2

Pod Members: **Benny Nketia, Mussie Aregay, Heartwill Gbekle**

## Reflection Questions

* Name at least one successful thing this week.

 We landed the headline AI features we said we would. Natural-language search now goes through a real LLM parse → SQL pre-filter → pgvector re-rank pipeline with removable filter pills (PR #86), and the behavior-based recommender is running on real `interaction_events` instead of the affinity fallback. On top of that we shipped a lot of the "makes the app feel real" work — reminders + dispatcher (#28), the organizer check-in dashboard (#32), near-me radius, the Discover map view, AI auto-tagging and analytics, event edit/cancel with attendee notifications, and the age-gate all the way from onboarding through RSVP. End of Sprint 2 we have a demoable MVP that matches the plan.

* What were some challenges you and/or your group faced this week?

 Two big ones. First, moving embedding/LLM work off the Render web service — MiniLM in-process was too heavy and we spent real time re-plumbing NL search + auto-tagging to call a hosted inference path. Second, mobile: the session cookie was breaking on mobile because the API and app were on different origins, so we had to add a Render blueprint to proxy `/api` and keep the auth cookie first-party (commit fed2817). We also had a run of small search bugs — over-classifying named queries, and newly created events not showing up — that took two follow-up PRs (#97, #100) to fully close.

* Did you finish all of your tasks in your sprint plan for this week? If you did not finish all of the planned tasks, how would you prioritize the remaining tasks on your list?  (i.e over planned, did not know how to implement certain features, miscommunication from the team, had to pivot from original plans, etc.)

 Yes for the Sprint 2 plan, plus some Sprint 3 work pulled in early (organizer dashboard, reminders, edit/cancel, milestone notifications). What we did **not** do is external event sync (Ticketmaster/SeatGeek) — the dedupe schema is there but no scheduled job is running yet — and full follows/social feed depth is still light. Both were called out as at-risk in Reflection #1 and we chose to protect the AI + core loop over them. Priority for Sprint 3: external sync (one provider behind a flag) first, then follows/social depth, then reminders push/email dispatch.

* Did the resources provided to you help prepare you in planning and executing your capstone project sprint this week? Be specific, what resources did you find particularly helpful or which tasks did you need more support on?

 Most useful: our own `planning/spec_audit_recommendation_search.md` and §6/§9.2 of `project_plan.md` — those drove the NL-search PR and the recommender pipeline. §7 API contracts were solid for reminders and the organizer dashboard. Where we needed more support: hosted embedding/inference options (Groq / Cloudflare Workers AI) — the docs are thin on cold-start latency and quota behavior, so we ended up learning by trial. §9.4's "popular events fallback" was also too vague — the spec doesn't pin the window/radius/eligibility, so we picked defaults (published, in `home_city`, next 30 days, ranked by save+RSVP count) and left a TODO to write it back into the spec.

* Which features and user stories would you consider “at risk”? How will you change your plan if those items remain “at risk”?

 At risk going into Sprint 3:
 - **External event sync (Ticketmaster + SeatGeek).** No scheduled job yet. Plan: ship a nightly Ticketmaster poller behind a feature flag; if it slips, demo with a larger native seed and mark external sync as a stretch item in §10.
 - **Follows + social feed depth.** Bell + milestone notifications work, but the feed is thin. Plan: wire the follows graph into ForYou as a soft boost and add a minimal social feed tab; cut "friends also saved" if time is short.
 - **Push/email delivery for reminders.** Scheduler runs, no real provider is wired. Plan: pick one channel (email via Resend) and ship the happy path; SMS becomes stretch.
 - **Sports roster UI.** Backend is in from Sprint 1 but the frontend join/leave flow is minimal. Plan: polish it on EventDetail; if it slips, ship read-only for MVP.
