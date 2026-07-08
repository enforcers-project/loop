# Loop — Frontend Inventory (Sprint 0)

> **What this is:** the Sprint 0 reconnaissance deliverable for Lane C — a map of the existing frontend so the Sprint 1 wiring work starts cold-free. It lists which screens/components already have a real-API contract vs. which are still in-memory, notes where TanStack Query + the Auth/Toast/Modal contexts slot in, and confirms the Vite `/api` proxy + build both pass.
>
> **Owner:** Heartwill · **Date:** Tue Jul 7, 2026 · **Feeds:** Sprint 1 issues **#7** (onboarding) and **#8** (app shell + contexts). Grounded in [`work_plan_and_schedule.md`](work_plan_and_schedule.md) Sprint 0 and [`implementation_playbook.md`](implementation_playbook.md) Step 1.8.

---

## Sprint 0 checks — both green ✅

| Check | Result | Evidence |
|---|---|---|
| **Vite `/api` proxy** | ✅ configured | [`vite.config.ts`](../frontend/vite.config.ts): `/api` → `http://localhost:3000`, `changeOrigin: true`. Matches backend `PORT=3000`. |
| **Build passes** | ✅ exit 0 | `npm run build` (`tsc -b && vite build`) → 1593 modules, clean `dist/` (index 265 kB, css 47 kB). No type errors. |

Dev flow that works today: `frontend` on `:5173` proxies `/api/*` to the `backend` stub on `:3000`; when the backend is offline the client falls back to the bundled mock seed (below), so the UI always renders.

---

## The framing that matters: it's **reads vs. writes**, not "screen vs. mock"

The task asks "which screens need real-API wiring vs. mock." The honest answer isn't screen-by-screen — it's about **how [`api.ts`](../frontend/src/lib/api.ts) is built**:

> Every `api.*` method **already fetches the real backend first** (`fetch('/api'+path, { credentials: 'include' })`) and only falls back to the mock seed **on failure** (network error or non-2xx).

So **no screen is hardcoded to mock.** Every *read* path will light up automatically the moment the backend returns the right JSON shape — the wiring is a shape/verification pass, not a rewrite. The real gap is the *writes*, which have no `api` method at all and live only in React state that dies on refresh.

That splits the whole inventory into two buckets.

---

## Bucket 1 — Reads: contract already wired (low effort)

All 9 `api.*` read methods hit the backend already. Wiring = **verify the returned JSON matches the `Event`/`Interest`/`Organizer`/`Post` types in [`types.ts`](../frontend/src/lib/types.ts), then migrate the `useEffect(() => api.x().then(setState))` pattern to `useQuery`.**

| `api` method | Consuming screens/components | Backend endpoint |
|---|---|---|
| `events(filters)` | [Landing](../frontend/src/screens/Landing.tsx), [Discover](../frontend/src/screens/Discover.tsx), [ForYouFeed](../frontend/src/screens/ForYouFeed.tsx), [UserProfile](../frontend/src/screens/UserProfile.tsx), [SocialFeed](../frontend/src/screens/SocialFeed.tsx) | `GET /api/events` |
| `recommendations(interests)` | [ForYouFeed](../frontend/src/screens/ForYouFeed.tsx) | `POST /api/recommendations` |
| `event(id)` | [EventDetail](../frontend/src/screens/EventDetail.tsx), [SportsPickupDetail](../frontend/src/screens/SportsPickupDetail.tsx) | `GET /api/events/:id` |
| `related(id)` | [EventDetail](../frontend/src/screens/EventDetail.tsx) | `GET /api/events/:id/related` |
| `interests()` | [Onboarding](../frontend/src/screens/Onboarding.tsx), [UserProfile](../frontend/src/screens/UserProfile.tsx) | `GET /api/interests` |
| `categories()` | (via `CatRow` / seed) | `GET /api/categories` |
| `organizer(id)` | [OrganizerProfile](../frontend/src/screens/OrganizerProfile.tsx) | `GET /api/organizers/:id` |
| `posts()` | [SocialFeed](../frontend/src/screens/SocialFeed.tsx) | `GET /api/posts` |
| `aiSearch(q)` | [AIAssistant](../frontend/src/components/AIAssistant.tsx) | `POST /api/ai/search` (real NL search is Sprint 3 #22/#31) |

**Caveat to verify per endpoint:** the client reads `json.data` (an `{ ok, data }` envelope) and expects the mock's denormalized shape — e.g. events carry a joined `organizer` and `goingAvatars`. The backend must return that same shape or the type check will drift. This is exactly the "verify shape" step, and the reason the reads are *low* effort but not *zero* effort.

---

## Bucket 2 — Writes: NOT wired at all (the real gap)

These have **no `api` method**. They mutate [`AppContext`](../frontend/src/context/AppContext.tsx) in-memory (`Set<string>` / local state) and **vanish on refresh**. Each needs a real endpoint + a TanStack Query mutation with optimistic update + cache invalidation.

| Action | Where it lives now | Endpoint it needs | Lands in |
|---|---|---|---|
| `login` / `logout` | [Auth](../frontend/src/screens/Auth.tsx) fabricates a `SelfUser` locally | `POST /api/auth/signup` · `/login` · `GET /auth/me` | Sprint 1 #6 |
| `setInterests` | [Onboarding](../frontend/src/screens/Onboarding.tsx) — context only, never persisted | `PUT /api/users/:id/interests` | Sprint 1 #7 |
| `toggleSaved` / `toggleGoing` | [EventCard](../frontend/src/components/EventCard.tsx), [ForYouFeed](../frontend/src/screens/ForYouFeed.tsx), [EventDetail](../frontend/src/screens/EventDetail.tsx) — `Set<string>` in context | `PUT/DELETE /api/events/:id/save` · `/rsvp` | Sprint 2 #15 |
| `toggleFollow` | [OrganizerProfile](../frontend/src/screens/OrganizerProfile.tsx), [SocialFeed](../frontend/src/screens/SocialFeed.tsx), [EventDetail](../frontend/src/screens/EventDetail.tsx) — `Set<string>` in context | follow / unfollow endpoints | Sprint 3 #26 |
| CreateEvent publish | [CreateEvent](../frontend/src/screens/CreateEvent.tsx) — form state goes nowhere | `POST /api/events` | Sprint 2 #9/#10 |

---

## Where TanStack Query + the contexts slot in

**TanStack Query** (`@tanstack/react-query`, not yet installed) replaces two patterns:
- **Reads:** the ~10 repeated `useState` + `useEffect(() => api.x().then(setState))` blocks become `useQuery({ queryKey, queryFn: () => api.x() })`. The existing `api.ts` methods are the query fns nearly as-is.
- **Writes:** the `AppContext` toggles become `useMutation` with `onMutate` optimistic update + `invalidateQueries`. This is what makes save/RSVP feel instant *and* persist.

**Auth context** — *already exists in spirit* as [`AppContext.tsx`](../frontend/src/context/AppContext.tsx): it holds `user / isLoggedIn / role / isHost / login / logout`. Those stay.

**Toast context** — **does not exist yet.** Needed for mutation failures, "Saved!" confirmations, and the offline-fallback notice. Build in #8.

**Modal context** — **does not exist yet.** Needed for auth-gating (e.g. tapping RSVP while logged out) and destructive confirms. Build in #8.

---

## The one architectural decision to make now

[`AppContext`](../frontend/src/context/AppContext.tsx) currently mixes **two kinds of state**:

- **Client/session state** — `user`, `isLoggedIn`, `role`, `isHost`. ✅ *Keep in context.*
- **Server state** — `savedIds`, `goingIds`, `followingIds`, `interests`. ❌ *This belongs in TanStack Query,* not a context `Set`. Right now it's a client-side guess at server truth, which is exactly why it resets on refresh.

**Decision for #8: shrink `AppContext` to an auth-only context; move `saved/going/following/interests` out to Query hooks** (`useSavedEvents`, `useRsvps`, etc.) backed by the real endpoints. Do this migration *as* the endpoints land (save/RSVP in Sprint 2, follows in Sprint 3) so nothing regresses — the context toggles can stay as the optimistic-update layer until each endpoint exists.

---

## Not installed yet (add in #8)

`package.json` currently has **none** of: `@tanstack/react-query`, an HTTP client (native `fetch` is fine — no `axios` needed), a toast lib, `zod`. Present and staying: React 18.3 + Vite 6 + TS 5.6 + Tailwind v4 + `react-router-dom` 6.28 + `lucide-react`.

> **No test framework anywhere** (Vitest/Playwright). The working agreements say "verify behavior" — flagging that there's currently no automated way to. Decide in Sprint 1 whether to add Vitest for the wiring/mutation logic.

---

## Handoff summary (what Sprint 1 inherits)

- ✅ Proxy + build confirmed green — the "frontend still builds" Done-when is met.
- **Reads are contract-ready** across ~10 screens: wiring is shape-verify + `useQuery` migration, not rewrites.
- **Writes are the real work**: 5 action groups with no endpoint, staged into #6/#7 (S1), #9/#15 (S2), #26 (S3).
- **#8 concretely means:** install TanStack Query, add Toast + Modal contexts, and split `AppContext` into auth-only vs. server-state-in-Query.
