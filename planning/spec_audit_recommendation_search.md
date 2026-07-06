# Spec Audit — Recommendation Engine + Natural-Language Search

> **Purpose:** A pressure-test / red-team of Loop's headline features (§9.1 #2 Behavior-Based Recommendation Engine, §9.1 #3 Natural-Language Search, §9.2 algorithm deep-dive, §9.3 search architecture) against the reality of a small-team capstone with sparse data and a live demo. Records assumptions that might not hold, unhandled edge cases, and things that would make the features feel unreliable — prioritized **fix-before-Sprint-1** vs **fix-later**.
>
> **Status:** Audit only — no code and no changes to `project_plan.md` yet. Use this as the checklist when building §9.
> **Date:** 2026-07-06. **Refers to:** [project_plan.md](project_plan.md) §6, §7, §9.

## The single biggest risk

It isn't the math — it's the **setup**. The headline pitch is "it learns from *you*," but at the demo it runs on (a) a brand-new user with ~5 lifetime signals and (b) a catalog synced from Ticketmaster/SeatGeek that is mostly big concerts and arena sports — **not** the Afrobeats-house-party / campus-workshop / pickup-soccer vibe the personas want. So the "personalized" feed is really cold-start popularity dressed in a rationale chip, over off-brand data, and the "Because you…" explanation has almost nothing true to say. Most items below are downstream of this.

---

## Fix before Sprint 1

Concerns that would break the demo or the core loop — resolve before building §9.

1. **The catalog is off-brand and sparse (data reality).** Ticketmaster/SeatGeek return Taylor Swift and the Warriors, not "rooftop Afrobeats, 21+" or "Sunday pickup soccer." Pickup runs — the actual differentiator — are 100% native, so there are **zero** at demo time unless we make them.
   - *Failure:* Maya opens Loop, the feed is stadium concerts, and the product's whole promise dies on screen.
   - *Fix:* hand-seed **40–60 native events** across all 6 categories (including several pickup runs) in the demo city; treat external sync as supplementary, not the backbone.

2. **The "it learns from you" claim is visibly false in real time (ops ↔ §8 contradiction).** §8 says RSVP/save/interest-edit invalidates `['recommendations']`, but the user vector only rebuilds on a ~15-min job (or an async event-triggered enqueue).
   - *Failure:* in the demo you RSVP to a jazz night, pull-to-refresh to show "look, it adapted" — and the feed is byte-identical because the vector hasn't rebuilt.
   - *Fix:* make the high-value path (`save`/`rsvp`) rebuild the vector **synchronously** (or apply an in-request re-rank nudge) before returning the next feed, so the action visibly moves the feed.

3. **The blend never leaves cold-start for real users.** `α = min(1, signal_count/20)`: a capstone user with ~5 signals sits at `α≈0.25`, so the feed stays **~75% onboarding seed** effectively forever.
   - *Failure:* the behavioral engine we're graded on barely engages; it's mostly interest-category popularity.
   - *Fix:* lower the handoff to `/8` or `/10`, and count onboarding picks as partial signals, so a handful of actions actually shifts the feed.

4. **Attendance is the top signal (+1.00) but never fires.** Nobody checks in at a capstone demo — there's no attendance flow anyone will use.
   - *Failure:* the highest-weight signal contributes zero, so ranking leans on weaker signals than the spec implies.
   - *Fix:* for MVP, treat `rsvp='going'` as the de-facto top signal (bump it), and drop `attend` to "if present" rather than designing around it.

5. **NL relative-time + hallucinated filters return zero rows.** "this weekend"/"tonight" depend on timezone (server UTC vs user local → wrong day window), and the parser can infer a city/category the user never said. `Afrobeats` isn't one of the 6 categories — it's a tag/interest — so "Afrobeats party" mis-parses.
   - *Failure:* "free events this weekend" → parser fills `city:"Oakland"` or maps to a nonexistent category → hard-filters to 0 results for a query that should match.
   - *Fix:* resolve dates against the user's timezone; make the parser emit **only** filters with explicit textual evidence (never guess a city); map unmatched terms to keyword/embedding, not a category constraint.

6. **`isFree` vs null/range external prices silently mis-filters.** Synced events often have `price_min = null` or a range.
   - *Failure:* "free" search excludes everything with unknown price (misses real free events) or includes paid ones — **a paid event in a "free" search is an instant trust-kill** for a grader.
   - *Fix:* define `isFree` precisely (`price_min = 0`; treat null as "unknown", not "free"), and never let a semantically-close paid event leak past the hard `is_free` filter.

7. **Rationale is the trust surface and it breaks easily.**
   - *Failures:* every card says "Popular near you" (generic → feels fake); "Because you saved X" cites a one-off accidental save or a since-dismissed event (creepy/wrong); the `AIChip` truncates to "Because you follow Oakland Community Sp…" at `max-w-168px` (nonsense).
   - *Fix:* only render "Because you [X]" when a real, still-active high-weight signal backs it; otherwise a neutral chip; template against a whitelist and length-check so it fits 168px whole.

8. **Cross-provider duplicates.** `UNIQUE(source, external_id)` dedups *within* a provider, not across — the same concert on Ticketmaster *and* SeatGeek is two rows.
   - *Failure:* the feed shows the same event twice, and it can reappear in Discover/Social.
   - *Fix:* add a fuzzy dedup key (normalized title + date + venue/city) at sync time; collapse or hide duplicates.

---

## Fix later (real, but can wait)

Genuine issues that won't break the demo or the core loop.

- **Missing-embedding candidates vanish.** RANK JOINs `event_embeddings`; a candidate with no row silently drops until the embed job catches up. *Fix:* LEFT JOIN + fall back to affinity/popularity score for un-embedded rows.
- **MMR / ε-exploration hurt on tiny candidate sets.** With ~12 candidates, `λ=0.7` MMR + a random 10% exploration bump inject visible randomness that reads as churn, not diversity. *Fix:* disable MMR/ε below ~30 candidates.
- **Negative signals overwhelm a sparse vector.** One `rec_dismiss` (−0.40) against 3 weak positives swings the vector hard. *Fix:* clamp net negative contribution or require a minimum positive mass first.
- **Cosine ≈ topical, not taste.** Generic embeddings put a jazz-lover and jazz-hater near the same jazz events. *Fix:* accept as a known MVP limit; revisit with engagement-tuned signals.
- **Category-centroid quality with few events.** A category with 2 events yields a noisy seed centroid. *Fix:* fall back to a global/popularity centroid until a category has ≥N events.
- **Search latency on mobile.** Parse + embed + FTS + pgvector serially can be 2–4s. *Fix:* stream keyword results first, then re-rank; cache embeddings of common queries.
- **HNSW on <1k rows is pointless.** ANN indexing adds nothing (can hurt) at demo scale. *Fix:* flat/IVFFlat with small lists until the catalog grows.
- **Lost fire-and-forget signals.** Mobile backgrounding drops `POST /api/interactions` beacons. *Fix:* `navigator.sendBeacon` + a small retry queue.
- **`recommendation_impressions` growth + no featured-feed caching.** Fine at demo scale; revisit for volume.
- **Watermark edge.** A signal with `created_at` just before `last_built_from` (batch/clock skew) is skipped forever. *Fix:* rebuild from `last_built_from − small overlap`.

---

## Cheapest high-leverage moves

The smallest changes that most reduce the chance the demo/graded feature looks broken.

- **Seed 40–60 native demo events (incl. pickup runs) in one city.** This one move fixes most of the off-brand / sparse / empty-feed / duplicate problems at once and makes every AI feature look right on stage.
- **Guarantee a non-empty feed and non-empty search, always.** Build the popularity/affinity fallback path *first*, not last — a blank feed is the worst demo outcome.
- **Make one action visibly change the feed.** Wire the synchronous vector nudge (item 2) so the "RSVP → refresh → it adapted" demo beat actually works.
- **Gate the rationale chip.** Show "Because you X" only when a true active signal backs it; neutral chip otherwise; length-cap to 168px. Cheapest way to stop the headline feature from *looking* fake.
- **Pin timezone + no-guess parsing.** Resolve "this weekend"/"tonight" in the user's tz and forbid inventing a city — kills the most common "0 results for an obvious query" embarrassment.

---

## Spec deltas this audit implies (not yet applied to §9)

If we act on the Sprint-1 items, these are the concrete edits to make in [project_plan.md](project_plan.md):

- §9.2(C) **Blend:** change `α = min(1, signal_count/20)` → `/8` (or `/10`); count onboarding picks toward `signal_count`.
- §9.2(A) **Weights:** demote `attend` from designed-around top signal; bump `rsvp='going'` to the effective top weight for MVP.
- §9.2(C)/(D) **Freshness:** add synchronous (or in-request) vector nudge on `save`/`rsvp` so §8's `['recommendations']` invalidation actually changes the feed.
- §9.2(D) **RANK:** LEFT JOIN `event_embeddings`; score-fallback for un-embedded candidates; disable MMR/ε below ~30 candidates.
- §9.3 / §9.1#3 **NL search:** timezone-resolved relative dates; evidence-only filter extraction (no guessed city); precise `isFree` semantics (null ≠ free).
- §7 external sync **dedup:** add a cross-provider fuzzy dedup key (normalized title + date + venue/city).
- §9.1#2 **Rationale:** whitelist templates, require an active backing signal, hard length-cap for the 168px `AIChip`.
- **Demo data:** add a seed-data task — 40–60 native events across all 6 categories in the demo city, including pickup runs.
