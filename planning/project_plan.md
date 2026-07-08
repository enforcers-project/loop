# Loop — Project Plan

> AI-powered local-events discovery. This document is the single source of truth for our capstone plan. It is built section by section; the **Data Model (§6)** is the source of truth our Prisma schema is generated from.
>
> **Stack:** React + HTML/CSS/JS (TypeScript optional) · PostgreSQL + Prisma · External event APIs: Ticketmaster Discovery + SeatGeek · Google Maps (location / "near me") · Responsive mobile web.
>
> **Sections:** (1) Team & Pod Members · (2) Problem Statement & Solution · (3) User Roles & Personas · (4) User Stories · (5) Wireframes · (6) Data Model · (7) API Contracts · (8) State Architecture · (9) AI Feature Specification · (10) Decisions Log.

---

## 1. Team & Pod Members

Team name: **Loop**.
Pod members: **Benny Nketia, Heartwill Gbekle, Mussie Aregay**.

---

## 2. Problem Statement & Solution Description

Local events are scattered across Instagram flyers, group chats, TikTok, Eventbrite, and word of mouth, so people constantly miss things happening near them. There's no single place to reliably find events that match your interests, location, and timing — and on the other side, organizers and promoters can't reach the right audience without reposting the same flyer across five platforms. Everyday people looking for something to do (parties, concerts, watch parties, pickup sports, networking, campus events) and the organizers trying to reach them are stuck in the same broken loop.

Loop is an AI-powered platform that closes that gap: it puts the right event in front of the right person at the right moment through a personalized "For You" feed and natural-language search, while giving organizers and hosts one place to post an event and grow an audience they own. Attendees sign up, pick a few interests, and immediately get a relevant feed; they search how they actually talk ("free Afrobeats party this weekend"), save and RSVP to events, and follow organizers. Our **headline AI feature is a behavior-based recommendation engine**, seeded by the interests a user picks at onboarding and continuously refined from what they save, search, RSVP to, attend, and follow.

---

## 3. User Roles & Personas

Loop has exactly two user roles: **Attendee** and **Organizer**. Creating events requires the Organizer role. Hosting a pickup run is a **capability layered on the Organizer role** (`users.is_host`) — an organizer flagged as a host unlocks the sports/roster model — not a separate role, and not available to a plain Attendee.

### Attendee
*Permissions: discovers, saves, and RSVPs to events, follows organizers, comments, sets interests. Cannot create events or host pickup runs — that requires the Organizer role.*

- **Maya, 20** — college sophomore, new to the area and into Afrobeats nights and campus events. She hears about most things too late through group chats and wants one feed that shows what's worth going to this weekend.
- **Devin, 26** — relocated young professional who knows almost no one. He wants networking mixers and low-key social events, and would follow a few promoters to stay in the loop.

### Organizer / Promoter
*Permissions: everything an Attendee can do, plus create and manage events, use AI tagging/description help, view RSVP and performance analytics, and build a following. An organizer flagged as a **host** (`is_host`) can additionally post and run pickup games — the sports/roster model.*

- **Tunde, 24** — nightlife promoter who throws monthly parties and reposts the same flyer across Instagram, TikTok, and group chats. He wants one place to post, get discovered, and grow a following he owns.
- **Priya, 22** — campus club lead running workshops and meetups. She's not a marketer and wants AI help writing descriptions so her events surface when people search "free campus events."

**Host capability** — an Organizer flagged `is_host` can post and run a pickup game:

- **Marcus, 28** — an organizer who runs a Sunday soccer game and constantly chases people to confirm so he hits 10 players. He wants a roster that fills itself and shows spots remaining.
- **Leo, 19** — an organizer who runs weekend basketball games and wants players to find the run, claim a spot, and see skill level so games stay balanced.

> **Note:** Hosting a pickup run is a **sub-capability of the Organizer role** (`users.is_host`), not a capability open to every attendee and not a standalone role. You must be an Organizer, and an Organizer flagged `is_host` unlocks the sports/roster model; a plain Attendee cannot host. Pickup runs remain an event *type* (`events.is_sports` + `sports_details`), not a persona. This reverses the earlier "any Attendee can host" decision — see §10, Decisions Log.

---

## 4. User Stories

### Attendee
- As an attendee, I want to pick my interests when I sign up, so that my feed feels relevant from day one.
- As an attendee, I want a personalized "For You" feed, so that I see events that match my taste without searching.
- As an attendee, I want to search in plain language like "free events this weekend," so that I can find events without guessing the exact title.
- As an attendee, I want to filter events by category, location, and date, so that I can quickly narrow down to what fits my plans.
- As an attendee, I want to save and RSVP to events, so that I can keep track of what I'm planning to attend.
- As an attendee, I want to follow organizers and promoters, so that their upcoming events show up in my feed.
- As an attendee, I want a reminder before an event I saved or RSVP'd to, so that I don't find out too late or forget to go.
- As an attendee, I want to join a pickup run and claim a position, so that I can lock in my spot before it fills up.

### Organizer / Promoter
- As an organizer, I want to create an event with a flyer/image and details, so that people can discover and RSVP to it.
- As an organizer, I want AI to suggest tags and help write my event description, so that my event reads well and surfaces in the right searches.
- As an organizer, I want to see who has RSVP'd and how my event is performing, so that I can gauge interest and plan accordingly.
- As an organizer, I want people to follow me and watch my following grow, so that I can reach the right audience without reposting the same flyer everywhere.

### Host (capability)
- As a host, I want to post a run showing players needed, skill level, and spots filled, so that the right players can find it and see if there's room.
- As a host, I want to see and manage who has claimed a spot, so that I know my run will actually have enough players to go ahead.

---

## 5. Wireframes

> These wireframes are the bridge between the Figma export (`planning/project_knowledge.md`) and the code we build: each screen is decomposed into the **exact named components** from the export, so the nested component trees below *are* our front-end component architecture — shared components (`TopNav`, `BottomBar`, `EventCard`, `AIChip`, `GoingStack`, `SaveBtn`, `RSVPBtn`, `FollowBtn`, `CatRow`, `FilterBar`, `AIAssistant`) are defined once and reused across screens, and per-screen composition is expressed by props (e.g. `EventCard showRationale`, `TopNav isLoggedIn`) rather than divergent copies. Every screen is **responsive mobile web** on the Figma breakpoints (mobile 390 / tablet 768 / desktop 1440): `TopNav` is sticky everywhere, `BottomBar` is the fixed mobile-only tab bar, event grids collapse to a single `w-full` column on mobile and step up to the `flex flex-wrap gap-4 justify-center xl:justify-start` grid (`sm:calc(50%) → lg:33% → xl:25%`) above `sm`, and the one selected-state rule holds throughout — a filled `#6D5EFC` pill with white text. Actions map to the §7 API contracts and each screen calls out the §4 user stories it serves. Six screens are specified below, followed by a **Shared Component Library** inventory that ties them into one component architecture.

#### Onboarding (/onboarding)

**Layout & elements:** A focused, chrome-light two-step flow (no `TopNav`/`BottomBar` — this is a gated funnel between Auth and the feed). A `StepProgress` indicator ("Step 1 of 2") sits at the top. **Step 1 — interests:** a screen heading + subhead, a "Pick at least 3" helper with a live count badge, then a `ChipGrid` of 24 `InterestChip`s flush below the subhead; the `PrimaryCTA` ("Continue") is pushed to the bottom with `mt-auto` and stays disabled/gray until ≥3 chips are selected. **Step 2 — city:** a `CityStep` with a `CitySearchInput` (typeahead), a `UseLocationButton` ("Use my location"), a list of matching city options, and a `PrimaryCTA` ("Finish") that completes onboarding. Desktop and mobile share the same single-column stack; chips reflow to full width on mobile.

```
Step 1                                Step 2
┌───────────────────────────┐        ┌───────────────────────────┐
│ StepProgress ●───○         │        │ StepProgress ●───●         │
│ "What are you into?"       │        │ "Where are you?"           │
│ Pick at least 3  [ 4 ]     │        │ ┌ CitySearchInput ───────┐ │
│ ┌ ChipGrid ──────────────┐ │        │ └────────────────────────┘ │
│ │ [Afrobeats][Sports]... │ │        │ [ ⌖ Use my location ]      │
│ │ [Networking][Food] x24 │ │        │  Oakland · SF · Berkeley…  │
│ └────────────────────────┘ │        │                            │
│              [ Continue ]  │◄mt-auto │              [ Finish ]    │
└───────────────────────────┘        └───────────────────────────┘
```

**What the user can do:** Toggle interest chips (selected chips flip to the filled `#6D5EFC` + white-text selected state); the count badge and the Continue gate update live off local `selectedInterests` state. On Step 1 submit, the whole set is committed via **`PUT /api/users/:id/interests`** (`source="onboarding"`, seeds high `weight`), which server-side seeds the cold-start `user_preference_vectors` row. Step 2: type a city into `CitySearchInput`, or tap `UseLocationButton` to fire the browser geolocation prompt (`useGeolocation()`); the chosen city + coords persist via **`PATCH /api/users/:id`** (`home_city`, `home_lat`, `home_lng`, `home_place_id`), and finishing stamps `onboarding_completed_at`, routing the user into `/feed`. The chip catalog is loaded once at mount via **`GET /api/interests`**.

**User stories served:** Story 1 — "pick my interests when I sign up, so that my feed feels relevant from day one" (both the interest `ChipGrid` and the home-city step that seeds "near me").

**Component hierarchy:**
- **OnboardingScreen** (owns `step` + local `selectedInterests`)
  - **StepProgress** — two-dot step indicator (Step 1 / Step 2)
  - **ChipGrid** (Step 1) — renders the 24-item catalog from `GET /api/interests`
    - **InterestChip** ×24 — label + `lucide` icon; selected = filled `#6D5EFC` + white text, unselected = white bg / `#E4E4E7` border; tapping toggles membership in `selectedInterests`
    - count badge + "Pick at least 3" helper (derived from `selectedInterests.length`)
  - **CityStep** (Step 2)
    - **CitySearchInput** — `FormField`-wrapped typeahead over Google Maps city suggestions
    - **UseLocationButton** — triggers `useGeolocation()`; on `granted` fills city + `home_lat`/`home_lng`
    - city-options list (selectable results)
  - **PrimaryCTA** — hot-pink `RSVPBtn`-styled CTA; `disabled` (gray) until Step 1 has ≥3 picks; advances step / finishes onboarding

**Mobile-web note:** No `BottomBar` in this funnel; the `ChipGrid` reflows to full-width rows and the `PrimaryCTA` stays pinned to the bottom (`mt-auto`) within a single scrollable column, so the "Continue" gate is always reachable by thumb.

#### ForYouFeed (/feed)

**Layout & elements:** The headline personalized surface. A sticky `TopNav` (logged-in variant: Bell + Avatar) sits above a **sticky NL `SearchBar`** whose placeholder reads *"Try 'free Afrobeats party this weekend'"* with mic + location icons. Below that: `FeedTabs` (violet selected state), a horizontally-scrollable `CatRow` of category chips, then a **featured hero `EventCard`** (~320px tall, full-bleed). The body is the personalized `flex flex-wrap` grid of `EventCard`s rendered with **`showRationale`** (the ForYou-with-AIChip variant), each carrying an `AIChip` "Because you…" pill, a `GoingStack`, `SaveBtn`, and `RSVPBtn`. A floating `AIAssistant` trigger (violet Sparkles, fixed bottom-right) hovers over the content; on mobile a fixed `BottomBar` provides tab nav.

```
Desktop                                              Mobile (390)
┌──────────────────────────────────────────────┐    ┌───────────────────┐
│ TopNav        [links]            🔔  (avatar)  │    │ TopNav  🔔 (avatar)│
├──────────────────────────────────────────────┤    ├───────────────────┤
│ 🔍 SearchBar  Try 'free Afrobeats…'  🎤  ⌖    │◄sticky│ 🔍 SearchBar 🎤 ⌖ │
│ FeedTabs [For You] Following  Nearby           │    │ FeedTabs …        │
│ CatRow  ‹ Music Nightlife Sports Food … ›      │    │ CatRow ‹ … ›      │
│ ┌──────── Featured hero EventCard (320) ─────┐ │    │ [Featured card]   │
│ └────────────────────────────────────────────┘ │    │ ┌───────────────┐ │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │    │ │ EventCard     │ │
│ │Event │ │Event │ │Event │ │Event │  ← xl:25%  │    │ │ ✨AIChip …    │ │
│ │✨chip │ │✨chip │ │✨chip │ │✨chip │            │    │ │ Going Save RSVP│ │
│ └──────┘ └──────┘ └──────┘ └──────┘            │    │ └───────────────┘ │
│                                    (✨ Assistant)│    │ …    (✨ Assist.) │
└──────────────────────────────────────────────┘    ├───────────────────┤
                                                     │ BottomBar ▭ ⌕ ⊕ ♥ │
                                                     └───────────────────┘
```

**What the user can do:** See a ranked personalized feed served by **`POST /api/recommendations`** (each item's `rationale.text` → the card's `AIChip`; card clicks/dismisses report back via **`POST /api/recommendations/:recommendationId/feedback`**). Type a natural-language query into the sticky `SearchBar` to run **`POST /api/search`** (mic is UI-only this build; the location icon opens "near me"). Switch `FeedTabs` / tap a `CatRow` chip to re-scope the feed (re-triggers `['recommendations']`). Per card: `SaveBtn` toggles a bookmark via **`PUT`/`DELETE /api/events/:id/save`** (fills violet when saved), `RSVPBtn` fires **`PUT /api/events/:id/rsvp`**, and the organizer row's `FollowBtn` calls **`POST`/`DELETE /api/users/:id/follow`** so a followed organizer's events surface in-feed. All of these are top-weight signals that invalidate and sharpen the next feed run.

**User stories served:** Story 2 (personalized "For You" feed), Story 3 (plain-language search via the sticky `SearchBar`), Story 5 (save & RSVP from the cards), Story 6 (follow organizers/promoters via the card organizer row).

**Component hierarchy:**
- **ForYouFeed**
  - **TopNav** (`isLoggedIn=true` → Bell + Avatar; sticky)
  - **SearchBar** (sticky) — NL placeholder + mic icon + location icon → `POST /api/search`
  - **FeedTabs** — For You / Following / Nearby; selected = filled `#6D5EFC` + white text
  - **CatRow** — scrollable category chips (`GET /api/categories`); selected = filled `#6D5EFC`
  - featured hero **EventCard** (`showRationale`, hero size) — top-ranked recommendation
  - feed **grid** (`flex flex-wrap gap-4 justify-center xl:justify-start`)
    - **EventCard** (`showRationale=true`, ForYou variant) ×N
      - **AIChip** — "Because you saved …" (`max-w-168px`, ellipsis, `flex-shrink-0` so it never overlaps the badge)
      - **AlmostFullBadge** (hot-pink, top-right, `flex-shrink-0`) — when near capacity
      - organizer row + **FollowBtn**
      - **GoingStack** — 3 avatars + "+N going"
      - **SaveBtn** (bookmark toggle) + **RSVPBtn** (hot-pink CTA)
  - **AIAssistant** — floating violet Sparkles trigger (fixed bottom-right) → right-side drawer
  - **BottomBar** (mobile-only; Create tab elevated pink, gated to `role='organizer'`)

**Mobile-web note:** Below `md` the grid is a single `w-full` column, `TopNav` collapses to logo + Bell + Avatar while the `BottomBar` becomes primary nav, the `SearchBar` and `CatRow` stay sticky/horizontally scroll-snapped (`.scrollbar-hide`), and vertical infinite scroll pages via `nextCursor`; the floating `AIAssistant` trigger stays thumb-reachable and its drawer covers only the right portion without unmounting the feed.

#### Discover (/discover)

**Layout & elements:** The explicit search-and-filter surface. Sticky `TopNav`, then a `SearchBar` with an attached **location pill** ("near me" / current city), a scrollable `CatRow` of category chips, and a `FilterBar` of **multi-select** filter pills (date, price/free, source, age — selected = filled `#6D5EFC`). An **event-count header** ("N events") sits above the `ResultsGrid`, the same `flex flex-wrap` 4-col-centered grid of `EventCard`s — here the **standard variant** (no `AIChip`, since Discover surfaces filtered results, not personalized rationale). `BottomBar` on mobile.

```
┌──────────────────────────────────────────────┐
│ TopNav        [links]            🔔  (avatar)  │
├──────────────────────────────────────────────┤
│ 🔍 SearchBar ……………………  [ ⌖ Oakland ]  ◄ location pill
│ CatRow  ‹ Music Nightlife Sports Food … ›      │
│ FilterBar ‹ [Today][This weekend][Free][21+] › │◄ multi-select, filled #6D5EFC
│ 128 events                                     │◄ event-count header
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│ │Event │ │Event │ │Event │ │Event │  ResultsGrid│
│ │Going │ │Going │ │Going │ │Going │  (standard) │
│ │Save  │ │Save  │ │Save  │ │Save  │            │
│ │RSVP  │ │RSVP  │ │RSVP  │ │RSVP  │            │
│ └──────┘ └──────┘ └──────┘ └──────┘            │
└──────────────────────────────────────────────┘
```

**What the user can do:** Run keyword/NL search from the `SearchBar` (**`POST /api/search`**, whose `parsedFilters` hydrate the `FilterBar` as removable pills). Toggle any number of `CatRow` categories and `FilterBar` pills — each toggle pushes multi-select arrays into the URL and re-queries **`GET /api/events`** (repeated facets `?category=music&category=nightlife`, `dateFrom`/`dateTo`, `isFree`, `priceMin`/`priceMax`, `ageMax`, `source`, `sort`). Tap the location pill to set "near me" via `useGeolocation()` (flattened to `?nearLat=&nearLng=&radiusKm=`). The event-count header reflects the returned result set. Per `EventCard`: `SaveBtn` → **`PUT`/`DELETE /api/events/:id/save`** and `RSVPBtn` → **`PUT /api/events/:id/rsvp`**. Category/filter chips load their labels/colors from **`GET /api/categories`**.

**User stories served:** Story 3 (plain-language search) and Story 4 (filter events by category, location, and date).

**Component hierarchy:**
- **Discover**
  - **TopNav** (sticky)
  - **SearchBar** + location pill → `POST /api/search`
  - **CatRow** — category chips (`GET /api/categories`); selected = filled `#6D5EFC`
  - **FilterBar** — multi-select pills (date / free / price / age / source); selected = filled `#6D5EFC`; renders `parsedFilters` from search as removable pills
  - event-count header — "N events" (derived from the `GET /api/events` result length)
  - **ResultsGrid** (`flex flex-wrap gap-4 justify-center xl:justify-start`)
    - **EventCard** (standard variant, `showRationale=false` → no `AIChip`) ×N
      - **AlmostFullBadge** (hot-pink, top-right) — when near capacity
      - **GoingStack** — 3 avatars + "+N going"
      - **SaveBtn** + **RSVPBtn**
  - **BottomBar** (mobile-only)

> Discover reuses the **same `EventCard`** component as ForYouFeed; the only difference is `showRationale=false`, so the shared `AIChip` slot is simply not rendered here — Discover's AI feature is natural-language search, not per-card rationale.

**Mobile-web note:** The `ResultsGrid` collapses to a single `w-full` column, `CatRow` and `FilterBar` become horizontally scroll-snapped rows (`.scrollbar-hide`) so many filter pills stay reachable, and multi-select `filters` live in the URL (`useSearchParams`) so a filtered view is deep-linkable and survives back/refresh regardless of layout; `BottomBar` replaces the centered `TopNav` links.

#### EventDetail (`/event/:id`)

**Layout & elements:**
```
┌────────────── TopNav (sticky · logged-in = Bell + Avatar) ──────────────┐
├─────────────────────────────────────────────────────────────────────────┤
│ ▓▓ DARK IMMERSIVE HEADER — blurred flyer bg (opacity-20 blur-md scale-110)│
│ ┌───────────┐   CategoryBadge (category.color_hex)                        │
│ │           │   Title  (Space Grotesk)                                    │
│ │  poster   │   organizer · VerifiedBadge · RoleBadge   [ FollowBtn ]     │
│ │  (flyer)  │   ◷ date/time    ⚲ venue    $ price_min    age_label        │
│ │           │   ┌ GoingStack card:  ◉◉◉  +N going ┐                       │
│ └───────────┘   [ RSVPBtn (hot-pink) ]   [ SaveBtn (bookmark) ]           │
│ ░░ gradient seam  h-20 from-#0B0B0F → white ░░                            │
├─────────────────────────────────────────────────────────────────────────┤
│ LIGHT BODY (surface #F7F7F8)                                              │
│ ┌ main col (About + Comments) ───────────┐  ┌ Sidebar ──────────┐        │
│ │ AboutSection: description + tag pills   │  │ MapCard (Google)  │        │
│ │ CommentThread [ CommentItem… ] + input  │  │ RelatedEvents:    │        │
│ │                                         │  │   EventCard × N   │        │
│ └─────────────────────────────────────────┘  └───────────────────┘        │
└───── AIAssistant floating trigger (bottom-right) ──── [BottomBar mobile] ──┘
```
Desktop is a two-band page: the dark immersive header (`darkHeroPattern`) splits into a **poster** column and an **info** column, then a `gradientSeam` div hands off to the light body, which is itself a main column (About stacked over Comments) beside a right sidebar (map + more events). Mobile collapses to one column: dark header full-width, then About, Comments, MapCard, RelatedEvents in sequence. For a **sports** event this screen shows the run summary and a "View roster / Join" link that deep-links to `SportsPickupDetail (/sports/:id)`.

**What the user can do:**
- Land here via any `EventCard` tap; the view is hydrated from `GET /api/events/:id` (increments `view_count`, returns `viewer.is_saved`/`rsvp_status`/`roster_status`, `going_stack`, `tags`, `sports_details`).
- **RSVP** with `RSVPBtn` → `PUT /api/events/:id/rsvp` (`going`/`interested`); cancel via `DELETE /api/events/:id/rsvp`. **Save/unsave** with `SaveBtn` → `PUT` / `DELETE /api/events/:id/save` (bookmark turns violet when saved). Both are optimistic and re-bump `rsvp_count`/`save_count`.
- **Follow the organizer** from the header via `FollowBtn` → `POST` / `DELETE /api/users/:organizerId/follow` (violet "Follow" ↔ outlined "Following").
- Optionally set a pre-event **reminder** after RSVP/save → `POST /api/events/:id/reminders` (§7.5).
- **Comment / reply**: read `GET /api/events/:id/comments`, post via `POST /api/events/:id/comments` (`parent_comment_id` for threads), delete via `DELETE /api/comments/:id`.
- Browse the **map** (Google Maps from `lat`/`lng`/`google_place_id`) and **more events** in the sidebar from `GET /api/events/:id/related`.

**User stories served:** 5 (save & RSVP to track what I'm attending), 6 (follow organizers/promoters so their events reach my feed), 8 (the run's public detail view — a sports EventDetail routes through to `SportsPickupDetail` to join & claim a position).

**Component hierarchy:**
- **EventDetail** =
  - `TopNav` (logged-in: Bell + Avatar)
  - **DetailHeader** (dark immersive) =
    - PosterImage (event `flyer_url`) + blurred-bg layer
    - InfoColumn =
      - `CategoryBadge` (tinted by `category.color_hex`)
      - Title
      - OrganizerRow = organizer name + `VerifiedBadge` + `RoleBadge` (Organizer violet / Promoter pink) + `FollowBtn`
      - MetaRows (date/time, venue, price, `age_label`)
      - GoingCard [ `GoingStack` (3 avatars + "+N going") ]
      - ActionRow = `RSVPBtn` (hot-pink CTA) + `SaveBtn` (bookmark toggle)
  - GradientSeam
  - **DetailBody** (light) =
    - MainColumn = AboutSection ( description + tag pills ) + CommentThread [ CommentItem (author + `VerifiedBadge` + body) … ] + CommentComposer
    - Sidebar = MapCard (Google Maps) + RelatedEvents [ `EventCard` (standard) × N ]
  - `AIAssistant` (floating trigger + right-side drawer)
  - `BottomBar` (mobile only)

**Mobile-web note:** Below `md` the two bands stack to a single column (poster → info → About → Comments → Map → Related), `TopNav` shrinks to logo + Bell + Avatar, `BottomBar` returns as primary nav, and the sidebar's `EventCard`s drop to full-width; the `AIAssistant` drawer slides over only the right portion and never blocks the sticky RSVP/Save actions.

#### CreateEvent (`/create`)

**Layout & elements:**
```
┌──────────── TopNav (sticky) ────────────┐
├──────────────────────────────────────────┤
│ ┌ FORM (col 1) ──────────────┐  ┌ LIVE PREVIEW (col 2) ┐ │
│ │ FlyerUpload (drop / pick)   │  │  ┌────────────────┐  │ │
│ │ FormField: Title            │  │  │  EventCard      │  │ │
│ │ FormField: Date 📅  Time    │  │  │  (standard,     │  │ │
│ │ FormField: Location 📍      │  │  │  mirrors form   │  │ │
│ │ FormField: Price Cap. Age   │  │  │  state live)    │  │ │
│ │ Description ▢               │  │  └────────────────┘  │ │
│ │   [ ✨ Write with AI ]      │  │                       │ │
│ │ AITagsPanel: #Tag× #Tag× …  │  │                       │ │
│ │ ── Sports toggle ⬤ ───────  │  │                       │ │
│ │  ↳ players_needed / skill / │  │                       │ │
│ │    position / indoor·outdoor│  │                       │ │
│ │ [ Publish ] (hot-pink CTA)  │  │                       │ │
│ └─────────────────────────────┘  └───────────────────────┘ │
└─────────────────── [BottomBar — Create tab elevated pink] ──┘
```
Desktop is a two-column workbench: a scrolling **form** on the left and a **live `EventCard` preview** on the right that re-renders from `createEventForm` state as fields change. Fields flow top→bottom: flyer upload, then `FormField`-wrapped inputs (Title; Date with Calendar icon + Time; Location with MapPin icon; Price / Capacity / Age), the Description textarea with its "✨ Write with AI" button, the AI-tags panel, the Sports toggle (which reveals run fields when on), and the Publish CTA. Mobile hides the preview and shows the form single-column.

**Access:** gated to `role='organizer'` (creating events requires the Organizer role); the **Sports toggle / host path** (`is_sports`) additionally requires `is_host=true`, so posting a pickup run needs `role='organizer'` **and** `is_host`. Matches `POST /api/events` auth and the `BottomBar` Create-tab gate (§8).

**What the user can do:**
- Fill the form (state held in the `createEventForm` reducer); the right-hand `EventCard` previews it live.
- **Generate a description**: "✨ Write with AI" → `POST /api/ai/generate-description` (`{ title, category, details?, tone? }`); button shows "Writing…" then drops the draft into the textarea; persisting later sets `description_is_ai=true`.
- **Auto-tag**: after the description completes, `POST /api/events/:id/autotag` returns `#tag` suggestions (`confidence ≥ 0.6`) into the AI-tags panel; keep or remove each removable "×" pill via `POST /api/events/:id/tags` / `DELETE /api/events/:id/tags/:tagId`.
- **Toggle Sports** to reveal run fields (`players_needed`, `skill_level`, position/`sports_positions`, indoor/outdoor `venue_setting`), which post as the nested `sports_details` on create.
- **Save & publish**: `POST /api/events` creates a `draft` (owner = caller, `source='native'`), then `POST /api/events/:id/publish` validates required fields, sets `published_at`, and enqueues the `event_embedding` + followed-organizer notifications.

**User stories served:** 11 (create an event with a flyer/image and details so people can discover and RSVP), 12 (AI suggests tags and helps write my description so it reads well and surfaces in searches), 9 (host path — post a run showing players needed, skill level, and spots via the Sports toggle → `sports_details`).

**Component hierarchy:**
- **CreateEvent** =
  - `TopNav`
  - FormColumn =
    - FlyerUpload (→ `flyer_url`)
    - `FormField` (Title)
    - `FormField` (Date + Calendar icon) · `FormField` (Time)
    - `FormField` (Location + MapPin icon)
    - `FormField` (Price) · `FormField` (Capacity) · `FormField` (Age → `age_label`)
    - DescriptionField = textarea + WriteWithAIBtn ("✨ Write with AI" · "Writing…" state)
    - AITagsPanel [ TagPill (label + × remove) … ]
    - SportsToggle → SportsFields = `FormField` (players_needed) + SkillSelect (`skill_level`) + PositionField (`sports_positions`) + SettingToggle (indoor/outdoor)
    - PublishBtn (hot-pink CTA)
  - PreviewColumn = `EventCard` (standard variant, bound to `createEventForm`)
  - `AIAssistant` (floating)
  - `BottomBar` (mobile; Create tab elevated pink, gated)

**Mobile-web note:** Below `md` the `EventCard` live preview is hidden and the form is a single scrolling column; the elevated pink Create tab in `BottomBar` is the entry point (only rendered for `role='organizer'`; the Sports toggle inside is shown only when `is_host`), and inputs use the standard 12px-radius `FormField` spec with the violet focus ring for touch.

#### SportsPickupDetail (`/sports/:id`)

**Layout & elements:**
```
┌──────────────── TopNav (sticky) ────────────────┐
├───────────────────────────────────────────────────┤
│ ▓▓ DARK HEADER (2-col) ▓▓                           │
│ ┌ InfoCol ───────────────┐  ┌ SportsCounter card ─┐ │
│ │ CategoryBadge (Sports)  │  │  filled / total     │ │
│ │ Title · sport           │  │  ▓▓▓▓▓▓░░░ progress  │ │
│ │ host · RoleBadge        │  │  ┌ position picker ┐ │ │
│ │   (Sports Host · green) │  │  │ [GK] [DEF] [MID]│ │ │
│ │ ◷ time  ⚲ venue         │  │  │ [FWD] [Any]     │ │ │
│ │ {price} entry           │  │  └─────────────────┘ │ │
│ │ SkillBadge (run level)  │  │  [ Join (hot-pink) ] │ │
│ └─────────────────────────┘  └─────────────────────┘ │
│ ░░ gradient seam h-20 ░░                             │
├───────────────────────────────────────────────────┤
│ LIGHT BODY — Roster table                           │
│  Player      Position   Slot   Skill      Status    │
│  ◉ Marcus    Striker     1     SkillBadge  claimed  │
│  ◉ Leo       MID         2     SkillBadge  claimed  │
│  · open slot  MID        3     —           OPEN     │
│  ── Waitlist (FIFO) ──                              │
│  ◉ Priya     —          —      SkillBadge  #1       │
└── AIAssistant "Ask Loop" (right drawer — must NOT cover roster) ─ [BottomBar] ┘
```
Desktop dark header is two columns: an **InfoCol** (category, title/sport, host row with the green "Sports Host" `RoleBadge`, time/venue, `{ev.price} entry` rendered literally — not `$$`, per the Figma note, and run-level `SkillBadge`) beside the **SportsCounter** card (filled/total = `players_signed_up`/`players_needed`, progress bar, position-picker grid, Join CTA). Below the `gradientSeam`, the light body is the **roster table**: claimed rows (player, position label, slot number, `SkillBadge`, status) plus open-slot rows and a FIFO **waitlist** section. Mobile stacks header → counter card → roster.

**What the user can do:**
- View the run from `GET /api/events/:id` (`sports_details` + positions); the counter/progress read `sports_details.players_signed_up` vs `players_needed` (sports cards read the roster count, **not** `rsvp_count`).
- **Pick a position** in the picker grid (hydrated from `GET /api/events/:id/positions` with per-slot `open_slots`; selection held in `selectedPositionId`).
- **Join & claim a spot** with the Join CTA → `POST /api/events/:id/roster` (`{ sports_position_id?, slot_number? }`); server assigns the lowest free slot → `claimed`, or `waitlisted` with a `waitlist_position` when at `players_needed`. **Leave/release** → `DELETE /api/events/:id/roster` (auto-promotes the next waitlisted player).
- Read the live roster + waitlist from `GET /api/events/:id/roster`.
- **Host management** (owner = `is_host`): from a roster row, `PATCH /api/events/:id/roster/:entryId` to promote from the waitlist, move a player's position, or mark `attended` / `no_show` / `cancelled` (remove).
- Ask the AIAssistant ("Ask Loop") for related runs without leaving the page.

**User stories served:** 8 (join a pickup run and claim a position to lock my spot before it fills), 9 (the posted run displayed with players needed, skill level, and spots filled), 10 (host sees and manages who has claimed a spot so the run has enough players to go ahead).

**Component hierarchy:**
- **SportsPickupDetail** =
  - `TopNav`
  - SportsHeader (dark, 2-col) =
    - InfoCol = `CategoryBadge` (Sports) + Title/sport + HostRow (host name + `VerifiedBadge` + `RoleBadge` "Sports Host" green — rendered off `users.is_host`, not a role) + MetaRows (time, venue, `{price} entry`) + `SkillBadge` (run level)
    - `SportsCounter` = FilledTotal (`players_signed_up`/`players_needed`) + ProgressBar + `AlmostFullBadge` (when near capacity) + PositionPickerGrid [ PositionSlot (label + `open_slots`, selectable → `selectedPositionId`) … ] + JoinBtn (hot-pink CTA)
  - GradientSeam
  - RosterSection (light) =
    - RosterTable [ RosterRow (avatar + name + position_label + slot_number + `SkillBadge` + StatusBadge + host `PATCH` controls) … ] + OpenSlotRows
    - WaitlistTable [ WaitlistRow (avatar + name + `waitlist_position`) … ]
  - `AIAssistant` ("Ask Loop" drawer — positioned so it does not cover the roster)
  - `BottomBar` (mobile only)

**Mobile-web note:** Below `md` the header, `SportsCounter`, and roster stack in one column and `BottomBar` returns; the "Ask Loop" `AIAssistant` drawer (`w-320`, `translate-x`) slides over only the right edge with a `z-40` backdrop and, per the Figma note, must not obstruct the roster table — the roster stays scrollable/tappable underneath while the drawer is open.

### Shared Component Library

The six screens above are composed from one reusable component set (exact Figma export names), defined once and varied by props/state — this list is the shared front-end architecture, so a fix to any component propagates everywhere it appears:

- **`TopNav`** — sticky top nav on every logged-in screen; `isLoggedIn` toggles logged-out (Login + Signup) vs logged-in (Bell + Avatar); active link tinted violet.
- **`BottomBar`** — mobile-only fixed tab bar on all primary screens; the elevated pink **Create** tab is gated to `role='organizer'` (the sports/host path inside Create additionally requires `is_host`).
- **`EventCard`** — the core event tile on ForYouFeed, Discover, EventDetail (Related), CreateEvent (live preview), OrganizerProfile/UserProfile grids. Variants `standard` | `ForYou-with-AIChip` via the `showRationale` prop; anatomy = poster, `CategoryBadge`/`AIChip` top-left, `AlmostFullBadge` top-right, title, organizer row, meta row, `GoingStack` + `SaveBtn` + `RSVPBtn`.
- **`AIChip`** — violet Sparkles rationale pill inside the ForYou `EventCard` only (`max-w-168px`, ellipsis, `flex-shrink-0` gap from `AlmostFullBadge`).
- **`AlmostFullBadge`** — hot-pink near-capacity pill (`flex-shrink-0`, `whitespace-nowrap`) on `EventCard` and the `SportsCounter`.
- **`GoingStack`** — 3 overlapping avatars + "+N going" on `EventCard` and the EventDetail GoingCard (`sm`/`md` sizes).
- **`RSVPBtn`** — hot-pink CTA (filled | outline) on cards and EventDetail; also the styling base for the Onboarding `PrimaryCTA`, CreateEvent `PublishBtn`, and Sports `JoinBtn`.
- **`SaveBtn`** — bookmark toggle, fills violet when saved; on every `EventCard` and EventDetail.
- **`FollowBtn`** — violet "Follow" / outlined "Following" on EventDetail's organizer row, OrganizerProfile, and SocialFeed suggestions.
- **`VerifiedBadge`** — 16px violet check on organizer/host rows and profiles.
- **`RoleBadge`** — tinted role pill: Attendee gray | Organizer violet | Promoter pink | **Sports Host green** (the "Sports Host" tint renders off `users.is_host`, not a role — see §10).
- **`CatRow`** — horizontally-scrollable category chips (`GET /api/categories`) on ForYouFeed and Discover; selected = filled `#6D5EFC` + white text.
- **`FilterBar`** — multi-select filter pills on Discover; selected = filled `#6D5EFC`; renders `parsedFilters` as removable pills.
- **`FormField`** / **`PasswordField`** — labeled input wrapper (13px label, 12px radius, violet focus ring) used across Auth, Onboarding, and CreateEvent.
- **`AIAssistant`** — floating violet Sparkles trigger + right-side slide-in drawer (`w-320`, `z-40` backdrop / `z-50` drawer) available globally; never covers main content (and specifically must not cover the SportsPickupDetail roster).
- **Sports-only:** **`SportsCounter`** (filled/total + progress bar + position-picker grid + Join CTA) and **`SkillBadge`** (run/position skill level) on SportsPickupDetail; **Social-only:** **`StoriesRow`** + **`PostCard`** on SocialFeed.

---

## 6. Data Model

The PostgreSQL schema below is the source of truth for Loop's Prisma schema; behavior-signal capture and vector storage are first-class because the behavior-based "For You" recommender is the headline feature. Tables and columns are `snake_case` (Prisma models map to them via `@@map`), all timestamps are `timestamptz` (UTC), and all surrogate PKs are `uuid` defaulting to `gen_random_uuid()` unless a composite/natural key or `bigint` identity is noted. Requires the `pgvector` and `citext` extensions, plus `cube` + `earthdistance` for the `earth_distance()` radius filter used in "near me" and the recommender pre-filter (§9.2 D) — or `postgis` if we standardize on it (and optionally `pg_trgm` for fuzzy title search). `vector(384)` is the **pinned dimension** used everywhere — chosen with a MiniLM-class local model (e.g. `all-MiniLM-L6-v2` = 384) over OpenAI `text-embedding-3-small` (1536); it can be re-pinned later since every vector row tracks its own `model`/`vector_version` (see §10, Decisions Log).

### Enum types

| Enum type | Values |
|---|---|
| `user_role` | `attendee`, `organizer` — the only two roles (Organizer/Promoter is one role) |
| `organizer_kind` | `organizer`, `promoter` — display sub-type only, set only when `role = organizer`; drives the RoleBadge tint, grants no extra permissions |
| `event_source` | `native`, `ticketmaster`, `seatgeek` |
| `event_status` | `draft`, `published`, `cancelled`, `past` |
| `rsvp_status` | `going`, `interested`, `waitlisted`, `cancelled` |
| `skill_level` | `all_levels`, `beginner`, `intermediate`, `advanced` |
| `venue_setting` | `indoor`, `outdoor` |
| `roster_status` | `claimed`, `waitlisted`, `cancelled`, `no_show`, `attended` |
| `tag_source` | `ai`, `organizer`, `system` |
| `interest_source` | `onboarding`, `user_added`, `inferred` |
| `interaction_type` | `impression`, `view`, `click`, `dwell`, `save`, `unsave`, `rsvp`, `rsvp_cancel`, `attend`, `search`, `search_result_click`, `follow`, `unfollow`, `share`, `category_click`, `tag_click`, `comment`, `post_like`, `claim_spot`, `release_spot`, `ai_query`, `rec_impression`, `rec_click`, `rec_dismiss` |
| `interaction_surface` | `for_you`, `discover`, `search`, `event_detail`, `social`, `organizer_profile`, `user_profile`, `assistant`, `landing`, `notification` |
| `notification_type` | `event_reminder`, `rsvp_confirmation`, `followed_new_event`, `roster_update`, `comment_reply`, `new_follower`, `social_like`, `event_updated`, `event_cancelled`, `system` |
| `notification_channel` | `in_app`, `push`, `email` |
| `reminder_status` | `scheduled`, `sent`, `cancelled` |
| `ai_generation_type` | `description`, `tags`, `event_embedding`, `user_vector`, `search_parse`, `chat` |
| `ai_message_role` | `user`, `assistant`, `system` |
| `post_kind` | `flyer`, `recap`, `update` |
| `feedback_type` | `bug`, `feature_request`, `general`, `content_report`, `other` |
| `feedback_status` | `new`, `triaged`, `in_progress`, `resolved`, `wont_fix` |

---

### 6.1 Accounts & Identity

#### `users`
Roles, host capability, profile, and home location all live here (requirements 1 & 7).

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `email` | `citext` | Unique, case-insensitive login identity. Not null. |
| `password_hash` | `text` | Argon2/bcrypt hash; null for social-auth-only accounts |
| `role` | `user_role` | `attendee` or `organizer`. Default `attendee`. |
| `organizer_kind` | `organizer_kind` | Display sub-type (Organizer/Promoter badge); null unless `role = organizer` |
| `is_host` | `boolean` | Host **capability** — an Organizer flagged here can post/manage pickup runs (the sports/roster model). A sub-capability of the Organizer role, not a role itself, and only settable when `role='organizer'`. Default `false`. |
| `display_name` | `varchar(120)` | Public name on cards/profiles |
| `handle` | `citext` | Unique @handle (UserProfile) |
| `is_verified` | `boolean` | Drives VerifiedBadge. Default `false`. |
| `avatar_url` | `text` | Profile avatar / GoingStack image |
| `cover_image_url` | `text` | Profile & organizer cover banner |
| `bio` | `text` | Profile bio |
| `home_city` | `varchar(120)` | Onboarding city / "near me" default |
| `home_lat` | `double precision` | Home latitude (Google Maps) |
| `home_lng` | `double precision` | Home longitude |
| `home_place_id` | `text` | Google Maps place_id for the home city |
| `location_radius_km` | `integer` | Preferred "near me" radius. Default `40`. |
| `onboarding_completed_at` | `timestamptz` | Null until interests + city step is done |
| `notification_prefs` | `jsonb` | Per-channel/type toggles |
| `follower_count` | `integer` | Denormalized cache for profile headers. Default `0`. |
| `following_count` | `integer` | Denormalized cache. Default `0`. |
| `last_active_at` | `timestamptz` | Last-seen timestamp, stamped by auth middleware on authenticated requests. Used for "active recently" display and as an optional low-activity-user decay tweak — the ranker's decay keys off `interaction_events.created_at`, not this column. |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Default `now()` |

Constraints: `UNIQUE(email)`, `UNIQUE(handle)`, `CHECK (organizer_kind IS NULL OR role = 'organizer')`, `CHECK (is_host = false OR role = 'organizer')` (hosting is an Organizer-only sub-capability — a plain Attendee can never be a host).

#### `oauth_accounts`
Backs the Auth-screen social-login buttons.

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE) |
| `provider` | `varchar(40)` | e.g. `google`, `apple` |
| `provider_uid` | `varchar(255)` | Provider's user id |
| `created_at` | `timestamptz` | Default `now()` |

Constraint: `UNIQUE(provider, provider_uid)`.

#### `user_sessions`
Groups behavior signals into browsing sessions (needed for dwell/sequence features). A row is opened at login/signup **and** upserted by `POST /api/interactions` on first anonymous touch (see note), so a client-minted `session_id` always has a matching row before any `interaction_events`/`search_queries` FK references it.

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK — for anonymous sessions this is the **client-minted id** (from a first-touch cookie), upserted by the ingest endpoint, not `gen_random_uuid()` |
| `user_id` | `uuid` | FK → `users.id` (nullable for anonymous sessions) |
| `device` | `varchar(40)` | `mobile_web` \| `desktop_web` |
| `user_agent` | `text` | Raw UA string |
| `started_at` | `timestamptz` | Default `now()` |
| `ended_at` | `timestamptz` | Null while active |

> **Anonymous-session note (fix):** `interaction_events.session_id` / `search_queries.session_id` are `FK → user_sessions.id`. Because §7.7/§8 send anonymous beacons with a client-minted `session_id`, the `POST /api/interactions` (and `POST /api/search`) handler **upserts a `user_sessions` row (`user_id = NULL`) for that id before inserting signals** — otherwise the FK would fail. Session grouping is thus preserved for anonymous traffic rather than being forced to `NULL`.

---

### 6.2 Categories & Interests (editable many-to-many, requirement 4)

#### `categories`
Lookup for the **6 fixed categories + an `other` catch-all** (7 slugs total) plus their Figma color tokens. The Figma export defines colors for the 6 branded categories; **`other` needs an explicit neutral `color_hex`** (e.g. a gray token) since the design system doesn't provide one, so `CatRow`/`CategoryBadge` can always render. Referenced by events, interests, and behavior signals, so category is a stable FK, not free text.

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `slug` | `varchar(40)` | Unique (`music`, `nightlife`, `sports`, `networking`, `food`, `campus`, `other`) |
| `name` | `varchar(60)` | Display label |
| `color_hex` | `varchar(7)` | Category color from Figma tokens (e.g. `#6D5EFC`) |
| `icon` | `varchar(40)` | lucide-react icon name |
| `sort_order` | `integer` | Chip/filter ordering |

#### `interests`
Seed catalog of the 24 onboarding interests (normalized, not a text blob).

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `slug` | `varchar(60)` | Unique machine key, e.g. `afrobeats` |
| `label` | `varchar(80)` | Chip label, e.g. "Afrobeats" |
| `category_id` | `uuid` | FK → `categories.id` (**NOT NULL**); maps interest → category for cold-start seeding. Non-null so a user whose picks all mapped to a null category can't produce an empty `u_seed` (§9.2 E) — every interest belongs to exactly one of the 6 categories (or `other`). |
| `icon` | `varchar(40)` | lucide-react icon name |
| `is_active` | `boolean` | Soft-hide retired interests without deleting picks. Default `true`. |
| `sort_order` | `integer` | ChipGrid ordering |

#### `user_interests`
Editable M:N join — rows are added/removed as users curate interests post-onboarding.

| Column | Postgres Type | Description |
|---|---|---|
| `user_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE). Part of composite PK. |
| `interest_id` | `uuid` | FK → `interests.id` (ON DELETE CASCADE). Part of composite PK. |
| `source` | `interest_source` | `onboarding`, `user_added`, or `inferred` |
| `weight` | `numeric(5,4)` | Affinity 0–1 seeding the preference vector; onboarding picks seed high |
| `created_at` | `timestamptz` | Default `now()` |

PK: `(user_id, interest_id)` — guarantees no duplicate picks.

---

### 6.3 Events, Sports & Provenance (requirements 5 & 6)

#### `events`
Native and externally-synced events share this table. Provenance columns support dedupe + refresh; structured location powers "near me".

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `organizer_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE). Null for synced/external events. |
| `external_organizer_name` | `varchar(160)` | Promoter/venue name for synced events lacking a native user |
| `title` | `varchar(200)` | Event title |
| `slug` | `varchar(160)` | URL slug for native events; null for synced |
| `description` | `text` | Body copy (may be AI-generated) |
| `description_is_ai` | `boolean` | True if produced by "Write with AI". Default `false`. |
| `flyer_url` | `text` | Poster/flyer image |
| `category_id` | `uuid` | FK → `categories.id` (drives color + filters) |
| `status` | `event_status` | `draft`/`published`/`cancelled`/`past`. Default `draft`. |
| `source` | `event_source` | `native`/`ticketmaster`/`seatgeek`. Default `native`. |
| `external_id` | `varchar(255)` | Provider event id; null for native |
| `external_url` | `text` | Canonical provider URL (dedupe/refresh + "buy tickets") |
| `raw_payload` | `jsonb` | Full provider JSON as fetched (re-parse without re-fetch) |
| `last_synced_at` | `timestamptz` | Last successful provider sync; drives refresh cadence |
| `starts_at` | `timestamptz` | Start datetime |
| `ends_at` | `timestamptz` | End datetime (nullable) |
| `timezone` | `varchar(64)` | IANA tz for correct local display |
| `venue_name` | `varchar(160)` | Venue label |
| `address` | `text` | Full street address |
| `city` | `varchar(120)` | City for filter / "near me" |
| `lat` | `double precision` | Latitude (Google Maps) |
| `lng` | `double precision` | Longitude |
| `google_place_id` | `text` | Google Maps place_id (nullable) |
| `price_min` | `numeric(10,2)` | Lowest price (nullable; ranges for synced events) |
| `price_max` | `numeric(10,2)` | Highest price (nullable) |
| `is_free` | `boolean` | Fast filter for "free events" NL queries. Default `false`. |
| `currency` | `char(3)` | ISO 4217. Default `USD`. |
| `capacity` | `integer` | Total capacity (nullable); feeds AlmostFullBadge |
| `age_min` | `smallint` | Minimum age for logic/filtering (nullable) |
| `age_label` | `varchar(20)` | Display badge, e.g. "21+", "All ages" |
| `is_sports` | `boolean` | True when a `sports_details` row exists. Default `false`. |
| `rsvp_count` | `integer` | Denormalized `going` count (GoingStack, non-sports). Default `0`. |
| `save_count` | `integer` | Denormalized. Default `0`. |
| `view_count` | `integer` | Denormalized. Default `0`. |
| `search_document` | `tsvector` | Keyword-search index over title + description + venue (see note below). |
| `published_at` | `timestamptz` | When it went live (nullable) |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Default `now()` |

Constraints/indexes: `UNIQUE(source, external_id)` — dedupe/upsert key; native rows keep `external_id = NULL` (distinct under Postgres NULL semantics). `UNIQUE(slug) WHERE slug IS NOT NULL`. GIN on `search_document`; B-tree on `(status, starts_at)`, `(category_id, city, starts_at)`, `(organizer_id)`; geo index on `(lat, lng)`.

> **`search_document` note (fix):** implement as a `GENERATED ALWAYS AS (...) STORED` `tsvector` over own-row columns only — `to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(venue_name,''))` — because a generated column cannot reference another table. To fold `event_tags` into keyword search, maintain the column via an `AFTER INSERT/UPDATE` trigger on `event_tags` instead of a generated expression.

#### `event_tags`
AI auto-categorization output (organizer/system tags allowed). Removable "×" pills on CreateEvent.

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `event_id` | `uuid` | FK → `events.id` (ON DELETE CASCADE) |
| `slug` | `varchar(60)` | Normalized tag, e.g. `afrobeats`, `21plus`, `rooftop` |
| `label` | `varchar(80)` | Display tag, e.g. "#Afrobeats" |
| `source` | `tag_source` | `ai`/`organizer`/`system` |
| `confidence` | `numeric(5,4)` | AI confidence 0–1 (null for manual tags) |
| `created_at` | `timestamptz` | Default `now()` |

Constraint: `UNIQUE(event_id, slug)`.

#### `sports_details`
1:1 with a sports event (`is_sports = true`). Run-level fields.

| Column | Postgres Type | Description |
|---|---|---|
| `event_id` | `uuid` | PK **and** FK → `events.id` (ON DELETE CASCADE) — enforces 1:1 |
| `sport` | `varchar(60)` | e.g. "Soccer", "Basketball" |
| `skill_level` | `skill_level` | Overall run skill level |
| `venue_setting` | `venue_setting` | `indoor`/`outdoor` |
| `players_needed` | `integer` | Target/total roster size (progress bar + AlmostFullBadge) |
| `players_signed_up` | `integer` | Denormalized count of active `claimed` roster entries. Default `0`. |
| `duration_minutes` | `integer` | Run length (nullable) |
| `default_position` | `varchar(60)` | Free-form label for simple runs with no structured slots (nullable) |
| `notes` | `text` | Host notes (bring bibs, etc.) |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Default `now()` |

Constraint: `CHECK (players_needed > 0)`.

#### `sports_positions`
Definable slots per run — powers the position-picker grid and open-slot counts.

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `sports_detail_id` | `uuid` | FK → `sports_details.event_id` (ON DELETE CASCADE) |
| `label` | `varchar(60)` | Position label, e.g. "Striker", "Goalkeeper", "Any" |
| `capacity` | `integer` | How many players this position holds (≥1) |
| `skill_level` | `skill_level` | Optional per-position skill requirement (nullable) |
| `sort_order` | `integer` | Display order in the picker grid |

Constraints: `UNIQUE(sports_detail_id, label)`, `CHECK (capacity >= 1)`. Open slots = `capacity` − count of `claimed` roster entries for the position. **For simple runs with no structured positions, seed one synthetic "Any" position** whose `capacity = players_needed`, so every claim carries a non-null `sports_position_id` (see roster note below).

> **Single capacity ceiling (fix):** the run has two capacity notions — `sports_details.players_needed` (run total, enforced by the roster capacity trigger) and `Σ sports_positions.capacity` (sum of slots). They must be kept equal, or they diverge badly: if `Σ capacity < players_needed` every position fills while `players_signed_up < players_needed` (run never "fills," progress bar never completes); if `Σ capacity > players_needed` the run force-waitlists while the picker still shows open slots. **Invariant: `Σ sports_positions.capacity = sports_details.players_needed`**, enforced at create/edit (validate on `POST`/`PATCH /events`) — or treat `players_needed` as *derived* (`= Σ capacity`) and drop the standalone value. The synthetic single-"Any"-position case satisfies this by construction.

#### `roster_entries`
The spot-claim model — the host sees exactly who claimed which position, with waitlist/cancel semantics (requirement 5, host stories).

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `event_id` | `uuid` | FK → `events.id` (ON DELETE CASCADE) — denormalized for fast roster reads + per-run uniqueness |
| `sports_detail_id` | `uuid` | FK → `sports_details.event_id` (ON DELETE CASCADE) |
| `sports_position_id` | `uuid` | FK → `sports_positions.id` (ON DELETE SET NULL); null = generic spot |
| `user_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE) — the player who claimed |
| `slot_number` | `smallint` | Which numbered slot within the position (1..capacity); null while waitlisted |
| `status` | `roster_status` | `claimed`/`waitlisted`/`cancelled`/`no_show`/`attended` |
| `waitlist_position` | `integer` | FIFO order among waitlisted; null otherwise |
| `claimed_at` | `timestamptz` | When the spot was claimed. Default `now()`. |
| `cancelled_at` | `timestamptz` | Set when status → `cancelled` (nullable) |
| `checked_in_at` | `timestamptz` | Attendance timestamp (nullable) |

Constraints/indexes:
- `UNIQUE(event_id, user_id) WHERE status IN ('claimed','waitlisted')` — at most one live spot per player per run, re-joinable after cancel.
- `UNIQUE(sports_position_id, slot_number) WHERE status = 'claimed'` — no double-claim of a numbered slot; frees on cancel.
- `UNIQUE(event_id, slot_number) WHERE status = 'claimed' AND sports_position_id IS NULL` — defense-in-depth for any generic (position-less) claim. **Note:** with the "seed a synthetic 'Any' position" convention above, `sports_position_id` is *never* NULL for a claim, so this partial index is normally inert; it's kept only as a safety net in case a run is ever created without the synthetic position. Pick one convention as canonical — we use the synthetic-position path — and this index guards the other.
- `CHECK (status <> 'claimed' OR slot_number IS NOT NULL)`.
- A **capacity trigger** (crosses rows, so not expressible as a `CHECK`): on claim, enforce `count(claimed for run) <= sports_details.players_needed`; overflow becomes `waitlisted`.
- Index `(event_id, status)` for the host roster view; `(user_id)` for "my runs".

---

### 6.4 Engagement & Behavioral Signals (requirement 2)

#### `rsvps`
RSVP status plus the **attendance** signal the ranker needs (one row per user/event; status flips in place).

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE) |
| `event_id` | `uuid` | FK → `events.id` (ON DELETE CASCADE) |
| `status` | `rsvp_status` | `going`/`interested`/`waitlisted`/`cancelled` |
| `guests_count` | `integer` | +N guests. Default `0`. |
| `attended` | `boolean` | Attendance signal (top-weight for ranking). Default `false`. |
| `checked_in_at` | `timestamptz` | QR check-in / attendance timestamp (nullable) |
| `created_at` | `timestamptz` | Default `now()` (recency signal) |
| `updated_at` | `timestamptz` | Last status change |

Constraint: `UNIQUE(user_id, event_id)`.

#### `saved_events`
Bookmark toggle (SaveBtn) — a clean standalone signal.

| Column | Postgres Type | Description |
|---|---|---|
| `user_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE). Part of composite PK. |
| `event_id` | `uuid` | FK → `events.id` (ON DELETE CASCADE). Part of composite PK. |
| `saved_at` | `timestamptz` | Default `now()` (recency signal) |

PK: `(user_id, event_id)` — idempotent save.

#### `follows`
Self-referential follow graph (follower → any user; "organizer" semantics come from the followee's role).

| Column | Postgres Type | Description |
|---|---|---|
| `follower_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE). Part of composite PK. |
| `followee_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE). Part of composite PK. |
| `created_at` | `timestamptz` | Default `now()` |

PK: `(follower_id, followee_id)`; `CHECK (follower_id <> followee_id)`.

#### `interaction_events`
Append-only behavior log — the raw signal stream the preference-vector builder replays (impressions, clicks, dwell, category/tag clicks, saves, RSVPs, attends, shares, follows).

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `bigint` | PK, identity (high-volume append-only) |
| `user_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE; nullable for anonymous) |
| `session_id` | `uuid` | FK → `user_sessions.id` (groups a browsing session; nullable) |
| `event_id` | `uuid` | FK → `events.id` (ON DELETE SET NULL; null for non-event signals) |
| `category_id` | `uuid` | FK → `categories.id` (set for `category_click`; nullable) |
| `target_user_id` | `uuid` | FK → `users.id` (ON DELETE SET NULL; the organizer for follow/unfollow) |
| `interaction_type` | `interaction_type` | The signal, e.g. `impression`, `view`, `dwell`, `save`, `rsvp`, `attend` |
| `surface` | `interaction_surface` | Where it happened (`for_you`, `discover`, `search`, …) |
| `weight` | `numeric(6,4)` | Signal weight used by the vector builder. Default `1.0`. |
| `dwell_ms` | `integer` | Time on card/detail for `dwell`/`view` (nullable) |
| `feed_position` | `integer` | Rank of the card when interacted with (position-bias correction) |
| `tag` | `varchar(60)` | Set for `tag_click` (nullable) |
| `recommendation_id` | `uuid` | FK → `recommendation_impressions.id` — links a click back to what was recommended (nullable) |
| `search_query_id` | `uuid` | FK → `search_queries.id` (set for `search`/`ai_query`/`search_result_click`; nullable) |
| `metadata` | `jsonb` | Free-form extras (scroll depth, referrer, etc.) |
| `created_at` | `timestamptz` | Signal timestamp — decay/recency input. Default `now()`. |

Indexes: `(user_id, created_at)`, `(event_id, interaction_type)`, `(interaction_type)`.

#### `search_queries`
Natural-language + filter search log — a strong intent signal plus NL-search analytics.

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `users.id` (ON DELETE SET NULL; nullable for anonymous) |
| `session_id` | `uuid` | FK → `user_sessions.id` (nullable) |
| `raw_query` | `text` | Verbatim text ("free Afrobeats party this weekend") |
| `parsed_filters` | `jsonb` | Structured filters the NL parser produced (category, date range, price, city, geo) |
| `surface` | `interaction_surface` | `search`, `for_you`, or `assistant` |
| `query_embedding` | `vector(384)` | Query embedding for semantic recall (nullable). DIM pinned to 384. |
| `result_count` | `integer` | Results returned |
| `clicked_event_id` | `uuid` | FK → `events.id` (ON DELETE SET NULL) — first result clicked (relevance signal) |
| `latency_ms` | `integer` | Server response time (perf monitoring) |
| `created_at` | `timestamptz` | Default `now()` |

#### `user_category_affinities`
Rolled-up per-category preference — a cheap, human-readable bridge between raw signals and the dense vector, and the fast source for "Because you like X" rationale.

| Column | Postgres Type | Description |
|---|---|---|
| `user_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE). Part of composite PK. |
| `category_id` | `uuid` | FK → `categories.id`. Part of composite PK. |
| `score` | `numeric(8,4)` | Time-decayed affinity aggregated from `interaction_events` |
| `positive_signals` | `integer` | Count of saves/RSVPs/attends in this category |
| `impression_count` | `integer` | Impressions in this category (CTR-style normalization) |
| `last_signal_at` | `timestamptz` | Most recent activity in this category |
| `updated_at` | `timestamptz` | When this rollup was last recomputed |

PK: `(user_id, category_id)`.

---

### 6.5 AI & Vectorization — pgvector (requirement 3)

#### `event_embeddings`
Per-event content embedding (title + description + tags + category), matched against user vectors. Separate table isolates the ANN index and enables re-embedding.

| Column | Postgres Type | Description |
|---|---|---|
| `event_id` | `uuid` | PK **and** FK → `events.id` (ON DELETE CASCADE) — **one active row per event**; a re-embed overwrites in place |
| `embedding` | `vector(384)` | Event content embedding. DIM pinned to 384. |
| `model` | `varchar(80)` | Embedding model/version used to produce the current row |
| `content_hash` | `text` | Hash of embedded text; skip re-embedding if unchanged |
| `vector_version` | `integer` | Which build produced the current row (reproducibility; bumped on a model migration) |
| `updated_at` | `timestamptz` | Default `now()` |

Index: HNSW/IVFFlat on `embedding` (`vector_cosine_ops`).

> **1:1 vs. rollback (fix):** this table holds **one active vector per event** (keeps the kNN join trivial). A model migration re-embeds every row in a batch and bumps `vector_version` — it does **not** keep old and new side by side, so `model`/`vector_version` are for reproducibility and forward-migration, not simultaneous A/B or in-place rollback. If true A/B ever matters, promote the PK to `(event_id, model)` + an `is_active` flag (deferred — out of MVP scope). Same applies to `user_preference_vectors` below.

#### `user_preference_vectors`
Per-user preference vector powering the "For You" feed, computed from interest seeds + aggregated interaction signals.

| Column | Postgres Type | Description |
|---|---|---|
| `user_id` | `uuid` | PK **and** FK → `users.id` (ON DELETE CASCADE) — 1:1 |
| `embedding` | `vector(384)` | Behavior-derived taste vector. DIM pinned to 384. |
| `model` | `varchar(80)` | Model/version that produced it |
| `vector_version` | `integer` | Version for recompute/rollback |
| `signal_count` | `integer` | Signals folded in (cold-start blending). Default `0`. |
| `decay_half_life_days` | `integer` | Recency half-life used when building it |
| `last_built_from` | `timestamptz` | Watermark: latest interaction timestamp included |
| `last_computed_at` | `timestamptz` | When the vector was last recomputed |

Index: HNSW/IVFFlat on `embedding` (`vector_cosine_ops`).

#### `recommendation_impressions`
Closes the recommender feedback loop: what was shown, why, at what rank, and what happened. Stores the "Because you…" AIChip copy.

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE) |
| `event_id` | `uuid` | FK → `events.id` (ON DELETE CASCADE) |
| `feed_run_id` | `uuid` | Groups all items from one feed build |
| `rank` | `integer` | Position in the ranked feed |
| `score` | `numeric(8,6)` | Model relevance score at serve time |
| `rationale_text` | `varchar(168)` | AIChip copy (max-w-168px), e.g. "Because you saved Afrobeats Night" |
| `rationale_signal` | `interaction_type` | Dominant signal behind the rationale (nullable) |
| `model_version` | `varchar(80)` | Ranking model/version served |
| `surface` | `interaction_surface` | Usually `for_you` |
| `shown_at` | `timestamptz` | Default `now()` |
| `clicked` | `boolean` | Whether the user clicked. Default `false`. |
| `clicked_at` | `timestamptz` | Click timestamp (nullable) |
| `converted` | `boolean` | Whether it led to a save/RSVP. Default `false`. |

#### `ai_generation_logs`
Provenance/audit + cost tracking for every AI call (description, tagging, embeddings, NL parse, assistant chat).

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `type` | `ai_generation_type` | Which AI feature produced this |
| `event_id` | `uuid` | FK → `events.id` (ON DELETE SET NULL; nullable) |
| `user_id` | `uuid` | FK → `users.id` (ON DELETE SET NULL; nullable) |
| `model` | `varchar(80)` | Model name/version |
| `prompt` | `text` | Input prompt (nullable) |
| `output` | `jsonb` | Structured/text output |
| `tokens_used` | `integer` | Token count (nullable) |
| `latency_ms` | `integer` | Round-trip latency |
| `created_at` | `timestamptz` | Default `now()` |

#### `ai_conversations`
Threads for the conversational planning assistant (AIAssistantDrawer).

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE) |
| `title` | `text` | Auto-summarized thread title (nullable) |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Default `now()` |

#### `ai_messages`
Individual assistant/user messages within a conversation.

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `conversation_id` | `uuid` | FK → `ai_conversations.id` (ON DELETE CASCADE) |
| `role` | `ai_message_role` | `user`/`assistant`/`system` |
| `content` | `text` | Message text |
| `event_refs` | `jsonb` | Array of event ids surfaced as inline result cards (nullable) |
| `created_at` | `timestamptz` | Default `now()` |

---

### 6.6 Social Layer (SocialFeed + EventDetail)

#### `comments`
Threaded comments on either an event or a social post (mutually exclusive target preserves real FK integrity).

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `author_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE) |
| `event_id` | `uuid` | FK → `events.id` (ON DELETE CASCADE) — set for EventDetail comments (nullable) |
| `post_id` | `uuid` | FK → `posts.id` (ON DELETE CASCADE) — set for post comments (nullable) |
| `parent_comment_id` | `uuid` | FK → `comments.id` (ON DELETE CASCADE) — threading (nullable) |
| `body` | `text` | Comment text |
| `created_at` | `timestamptz` | Default `now()` |
| `edited_at` | `timestamptz` | Nullable — set only if/when a `PATCH /api/comments/:id` edit endpoint ships (not in MVP §7); otherwise always null |
| `deleted_at` | `timestamptz` | Soft delete (nullable) |

Constraint: `CHECK ((event_id IS NOT NULL) <> (post_id IS NOT NULL))` — exactly one target.

> **Comment-count integrity (fix):** dropped the earlier `like_count` column — no comment-like endpoint or `comment_like` interaction exists in §7, so it would be permanently `0` (liking is a **post** feature via `post_likes`). Also: `POST …/comments` increments `posts.comment_count` and `DELETE /api/comments/:id` is a soft-delete (`deleted_at`) that must **decrement** `posts.comment_count` (and exclude the row from `GET`), so the displayed count matches visible comments.

#### `posts`
Instagram-style SocialFeed PostCard, optionally tied to an event.

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `author_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE) |
| `event_id` | `uuid` | FK → `events.id` (ON DELETE SET NULL) — optional linked event |
| `kind` | `post_kind` | `flyer`/`recap`/`update` |
| `image_url` | `text` | Post image |
| `caption` | `text` | Caption (nullable) |
| `like_count` | `integer` | Denormalized. Default `0`. |
| `comment_count` | `integer` | Denormalized. Default `0`. |
| `created_at` | `timestamptz` | Default `now()` |

#### `post_likes`

| Column | Postgres Type | Description |
|---|---|---|
| `post_id` | `uuid` | FK → `posts.id` (ON DELETE CASCADE). Part of composite PK. |
| `user_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE). Part of composite PK. |
| `created_at` | `timestamptz` | Default `now()` |

PK: `(post_id, user_id)`.

#### `stories`
Ephemeral avatar-ring stories (StoriesRow), auto-expiring.

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `author_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE) |
| `event_id` | `uuid` | FK → `events.id` (ON DELETE SET NULL) — optional linked event |
| `media_url` | `text` | Story image/video |
| `caption` | `varchar(160)` | Optional caption |
| `created_at` | `timestamptz` | Default `now()` |
| `expires_at` | `timestamptz` | Auto-expiry (typically +24h) |

#### `story_views`
Seen-state so the ring renders viewed/unviewed.

| Column | Postgres Type | Description |
|---|---|---|
| `story_id` | `uuid` | FK → `stories.id` (ON DELETE CASCADE). Part of composite PK. |
| `viewer_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE). Part of composite PK. |
| `viewed_at` | `timestamptz` | Default `now()` |

PK: `(story_id, viewer_id)`.

---

### 6.7 Notifications & Reminders (requirement 7)

#### `notifications`
Backs the TopNav bell — followed-organizer events, RSVP confirmations, roster/social updates, and delivered reminders.

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE) — recipient |
| `type` | `notification_type` | Notification category |
| `channel` | `notification_channel` | `in_app`/`push`/`email` |
| `actor_id` | `uuid` | FK → `users.id` (ON DELETE SET NULL) — who triggered it (nullable) |
| `event_id` | `uuid` | FK → `events.id` (ON DELETE SET NULL) — related event; SET NULL so `event_cancelled`/historical notices survive event deletion (nullable) |
| `title` | `varchar(160)` | Headline |
| `body` | `text` | Detail text (nullable) |
| `metadata` | `jsonb` | Extra payload |
| `is_read` | `boolean` | Default `false` |
| `read_at` | `timestamptz` | Nullable |
| `created_at` | `timestamptz` | Default `now()` |

Index: `(user_id, is_read, created_at)`.

#### `event_reminders`
Scheduled pre-event reminders for saved/RSVP'd events (reminder story); a background job scans due rows and emits notifications.

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `users.id` (ON DELETE CASCADE) |
| `event_id` | `uuid` | FK → `events.id` (ON DELETE CASCADE) |
| `offset_minutes` | `integer` | Lead time before start (e.g. 60, 1440) |
| `remind_at` | `timestamptz` | Computed fire time |
| `channel` | `notification_channel` | Delivery channel |
| `status` | `reminder_status` | `scheduled`/`sent`/`cancelled`. Default `scheduled`. |
| `sent_at` | `timestamptz` | Nullable |
| `created_at` | `timestamptz` | Default `now()` |

Constraint: `UNIQUE(user_id, event_id, remind_at)`; index `(remind_at) WHERE status = 'scheduled'` for the dispatcher.

---

### 6.8 Organizer Analytics & Feedback (requirement 8)

#### `event_analytics_daily`
Daily rollup powering the organizer's performance view, populated from `interaction_events`/`rsvps`/`saved_events`.

| Column | Postgres Type | Description |
|---|---|---|
| `event_id` | `uuid` | FK → `events.id` (ON DELETE CASCADE). Part of composite PK. |
| `date` | `date` | Rollup day. Part of composite PK. |
| `views` | `integer` | Detail/card views. Default `0`. |
| `saves` | `integer` | Saves that day. Default `0`. |
| `rsvps` | `integer` | RSVPs that day. Default `0`. |
| `shares` | `integer` | Shares that day. Default `0`. |

PK: `(event_id, date)`.

#### `feedback`
In-app feedback-form submissions.

| Column | Postgres Type | Description |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `users.id` (ON DELETE SET NULL; nullable for anonymous) |
| `type` | `feedback_type` | `bug`/`feature_request`/`general`/`content_report`/`other` |
| `status` | `feedback_status` | Triage state. Default `new`. |
| `subject` | `varchar(160)` | Short summary (nullable) |
| `message` | `text` | Feedback body |
| `rating` | `smallint` | Optional 1–5 satisfaction (nullable) |
| `email` | `citext` | Reply-to for anonymous submitters (nullable) |
| `screen` | `varchar(80)` | Screen/route it was sent from |
| `app_version` | `varchar(20)` | Client version (nullable) |
| `user_agent` | `text` | Device/browser context |
| `reported_event_id` | `uuid` | FK → `events.id` (ON DELETE SET NULL) — set for content reports (nullable) |
| `created_at` | `timestamptz` | Default `now()` |
| `resolved_at` | `timestamptz` | Nullable |

---

### Relationships

A `user` (any role) has many `interaction_events`, `search_queries`, `rsvps`, `saved_events`, and `user_interests`, and exactly one `user_preference_vector`. A `user` with `role = organizer` authors many `events`; an organizer additionally flagged `is_host = true` authors sports `events` and manages their roster (hosting is an Organizer-only sub-capability). `follows` is a self-referential M:N on `users` (follower → followee), so organizers, promoters, and hosts are all followable. Each `event` belongs to one `category`, optionally has one `sports_details` (1:1, shared PK) which owns many `sports_positions`, and players claim spots through `roster_entries` (a user × event × position claim with slot/waitlist state). An `event` has many `event_tags` and `comments`, exactly one `event_embedding`, and is engaged with via `rsvps`, `saved_events`, and `posts`. `interests` ↔ `users` is a true M:N via the editable `user_interests`. Every rankable action is logged in `interaction_events` and `search_queries`; those signals plus `user_interests` seeds are aggregated into `user_preference_vectors` and `user_category_affinities`, which are matched by nearest-neighbor against `event_embeddings` to build the "For You" feed. `recommendation_impressions` record each served feed item and its rationale, and `interaction_events.recommendation_id` points back to close the loop. AI outputs are audited in `ai_generation_logs`; the assistant threads live in `ai_conversations`/`ai_messages`. The social layer (`posts`/`post_likes`/`comments`, `stories`/`story_views`), messaging (`notifications`, `event_reminders`), `event_analytics_daily`, and `feedback` all hang off users and events.

**Counter conventions (fix):** non-sports "going"/GoingStack surfaces read `events.rsvp_count`; **sports cards read `sports_details.players_signed_up`**, since a run fills via `roster_entries`, not `rsvps`. The signal builder reads attendance from **both** `rsvps.attended` (non-sports) and `roster_entries.status = 'attended'` (sports); both also emit an `attend` row in `interaction_events`.

### Search: Elasticsearch vs pgvector

Two complementary retrieval paths, both inside one Postgres instance for the MVP — no Elasticsearch:

- **Keyword / filter / facet search → PostgreSQL directly.** Exact-match and structured filtering (category, city/radius, date range, `is_free`/price, age, "Sports near me this weekend") uses B-tree indexes on `events.category_id`/`city`/`starts_at`/`status`, a generated `events.search_document` `tsvector` (GIN) over title/description/venue, and `pg_trgm` for fuzzy title matching. This is deterministic, cheap, always fresh, and adds no second datastore for a 3-person capstone. **Elasticsearch/OpenSearch is a documented future scale-out**, not an MVP dependency: if keyword relevance/typo-tolerance/faceting or synced-catalog volume outgrows Postgres FTS, we mirror published events into an ES index that takes over the keyword+filter path, leaving everything below unchanged.
- **Semantic / behavioral matching → pgvector.** The headline "For You" feed and the semantic half of natural-language search run on `pgvector`: one `event_embedding` per event and one `user_preference_vector` per user, retrieved top-K by cosine similarity (HNSW/IVFFlat). NL search also embeds the query into `search_queries.query_embedding` for semantic recall.

**How they coexist (the request pipeline):** a natural-language query is first parsed into structured filters stored in `search_queries.parsed_filters`; the keyword/filter engine (Postgres FTS today, Elasticsearch later) produces a bounded candidate set honoring hard constraints (radius, date, free/price, category); pgvector then **re-ranks** that candidate set by semantic + behavioral similarity to the user's `user_preference_vector`, and the top items are logged to `recommendation_impressions` with their "Because you…" rationale. Filtering never sends the whole DB to the model — this directly answers the proposal's open question: Postgres/Elasticsearch narrows, pgvector personalizes.

### Ambiguities Resolved

- **Four roles in the Figma export vs. the two-role constraint.** `project_knowledge.md` lists `attendee`/`organizer`/`promoter`/`sportsHost`. Resolved to a two-value `user_role` (`attendee`, `organizer`). `sportsHost` → the `users.is_host` boolean capability, which is an **Organizer-only sub-capability** (an organizer flagged `is_host` unlocks the sports/roster model; a plain attendee cannot host — enforced by `CHECK (is_host = false OR role = 'organizer')`). `promoter` → the nullable `organizer_kind` display sub-type within the Organizer/Promoter role (drives only the pink RoleBadge tint, grants no extra permissions). Pickup runs are an event type (`events.is_sports` + `sports_details`), not a persona. This matches the Decisions Log in `user_stories.md`. The Figma `RoleBadge` "Sports Host" (green) variant, if kept, renders off `users.is_host` — it is not a role.
- **"EventAI" vs "Loop".** An earlier draft of `project_plan.md` mislabeled the app "EventAI"; the app/team is **Loop** — corrected in this document. The schema uses no product name internally.
- **`location` as a single field on User/Event.** Split into structured `city` + `lat` + `lng` + `*_place_id` (plus `venue_name`/`address` on events, `home_*` + `location_radius_km` on users) to support Google Maps "near me" radius queries.
- **Category as free text vs. lookup.** Promoted to a `categories` lookup table holding the Figma color tokens and icons, because category is simultaneously a filter facet, an FK on events/interests, and a behavior signal (`category_click`) — it needs a stable id, not an enum or string.
- **RSVP vs. Save vs. Attendance conflation.** Kept `rsvps` and `saved_events` as distinct tables (save is a clean standalone signal), and folded attendance into `rsvps` via `attended` + `checked_in_at` rather than a separate table, since non-sports attendance is always tied to an RSVP; it is still emitted as an `attend` row in `interaction_events` so the ranker sees it as a distinct top-weight signal. Sports attendance lives on `roster_entries`.
- **"Categories liked/clicked" — log vs. rollup.** Captured both: raw `category_click`/`tag_click` rows in `interaction_events`, and a time-decayed rollup in `user_category_affinities` for cheap, explainable "Because you like X" rationale.
- **Sports "position" as a single column.** The planned single `position` string on `SportsDetail` can't express a multi-slot roster. Kept `default_position` for trivial runs but added `sports_positions` (label + capacity) and `roster_entries` (claims), with partial unique indexes guaranteeing one holder per numbered slot and one live claim per user, plus a capacity trigger and waitlist/cancel/promotion semantics. Position-less runs seed a synthetic "Any" position so no claim is left unguarded.
- **Roster: "open spot rows" vs. "claim rows".** Chose the claim model (`roster_entries` = actual claims) over pre-seeding one row per empty slot, because partial unique constraints enforce integrity more cleanly and open slots are computable (`capacity` − claimed).
- **Comment target ambiguity (event vs. post).** Resolved to one `comments` table with nullable `event_id` and `post_id` and a `CHECK` enforcing exactly one target, preserving real FK integrity to both instead of a polymorphic `commentable` pattern.
- **Stories as posts vs. separate.** Kept `stories` (+ `story_views` for viewed/unviewed rings) separate from `posts`, matching the distinct ephemeral StoriesRow vs. persistent PostCard in Figma.
- **Reminders folded into notifications vs. separate.** Split `event_reminders` (schedulable, with `offset_minutes`/`remind_at`/`status`) from `notifications` so the dispatcher can efficiently scan due rows; delivered reminders still surface as a `notifications` row.
- **External vs. native events in one table.** Single `events` table with `source` + nullable `external_id`/`organizer_id`, `raw_payload`, `external_url`, `last_synced_at`, and a `UNIQUE(source, external_id)` upsert key so re-syncing Ticketmaster/SeatGeek never duplicates rows (native rows keep `external_id = NULL`, distinct under Postgres unique semantics).
- **Age requirement type.** Kept both `age_min` (smallint, for filtering logic) and `age_label` (varchar, for the "21+"/"All ages" flyer badge).
- **Price as single value vs. range.** Used `price_min`/`price_max` + `is_free` rather than one `price`, because synced external events commonly carry price ranges.
- **Where vectors live.** Isolated in `event_embeddings`/`user_preference_vectors` (not inline `vector` columns on hot tables), with `model`/`vector_version`/`content_hash` for recompute and rollback; a single vector per user was chosen over separate long/short-term vectors to keep the capstone lean.
- **`search_document` as a generated column.** A `GENERATED` `tsvector` can only reference own-row columns, so it covers title/description/venue only; `event_tags` are folded in via a trigger when tag search is needed.
- **Vector dimension.** `vector(384)` is **pinned** everywhere (a MiniLM-class local model, e.g. `all-MiniLM-L6-v2`); it can be re-pinned later, tracked per row via `model`/`vector_version`.

---

## 7. API Contracts

### Conventions

- **Base path & transport.** All routes are under `/api`; JSON over HTTPS. IDs are `uuid` strings, timestamps are ISO-8601 UTC. Money is expressed as `price_min`/`price_max` (`numeric`) plus `currency` (ISO-4217, default `USD`) matching `events`.
- **Auth.** Auth is a signed, **stateless JWT carried in an HTTP-only, Secure, SameSite cookie** (`Authorization: Bearer <jwt>` also accepted); expiry is encoded in the token, not persisted. The `user_sessions` table is the **analytics/browsing-session** row (opened at login, `ended_at` stamped at logout) that `interaction_events.session_id` groups by — it is **not** the credential store. `/api/auth/refresh` re-issues the JWT cookie. Protected routes require a valid token. Each row's **Description** notes the role/capability gate: `attendee` (any authed user), `organizer` (`users.role='organizer'`), `host` (`users.is_host=true`, which implies `role='organizer'` — hosting is an Organizer-only sub-capability), `owner` (must own the row), or `admin` (internal).
- **Error envelope.** Non-2xx responses return `{ "error": { "code": SNAKE_CASE, "message": string, "details"?: object } }`. Common codes (HTTP): `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (422), `CONFLICT` (409), `RATE_LIMITED` (429), `EXTERNAL_API_ERROR` (502). Error-case cells list the codes each route can add on top of these defaults.
- **Pagination.** List endpoints take `?cursor=&limit=` (default 20, max 50) and return `{ "data": [...], "nextCursor": string|null }`. Fixed lookups (`/interests`, `/categories`) are unpaginated.
- **Shared shapes.** `EventCard` = `{ id, title, slug, flyer_url, category:{slug,name,color_hex}, organizer:UserRef|null, external_organizer_name, source, starts_at, ends_at, timezone, venue_name, city, lat, lng, price_min, price_max, is_free, currency, age_label, capacity, is_sports, players_needed|null, players_signed_up|null, rsvp_count, save_count, view_count, going_stack:{ count, avatars:[{user_id,display_name,avatar_url}] }, distance_km, external_url }`. The `organizer`, `going_stack` avatars, `capacity`, and (when `is_sports`) `players_needed`/`players_signed_up` are included so the card's `FollowBtn`, `GoingStack`, and `AlmostFullBadge` (§5) render from the list payload that `GET /api/events`, `POST /api/recommendations`, and `GET /api/events/:id/related` all return — the `AlmostFullBadge` compares `players_signed_up`/`players_needed` for sports and `rsvp_count`/`capacity` otherwise. `UserRef` = `{ id, display_name, handle, avatar_url, role, organizer_kind, is_verified }`. `SelfUser` = the full `GET /api/auth/me` payload. User-story numbers (1–14) map to §4 / `user_stories.md`.

### 7.1 Auth & Session

| CRUD | HTTP Verb | Endpoint | Description | Request Shape | Response Shape | Error Cases | User Stories |
|---|---|---|---|---|---|---|---|
| Create | POST | `/api/auth/signup` | Register: creates a `users` row, sets `role` + optional `organizer_kind` (only valid when `role=organizer`), hashes `password_hash`, issues a JWT cookie + opens an analytics `user_sessions` row. Public. | `{ email, password, role:"attendee"\|"organizer", organizer_kind?:"organizer"\|"promoter", display_name, handle? }` | `201 { user:{ id, email, role, organizer_kind, is_host, display_name, handle, onboarding_completed_at:null, created_at }, session:{ expires_at } }` + `Set-Cookie` | VALIDATION_ERROR (incl. `organizer_kind` set when `role≠organizer`), CONFLICT (email/handle taken), RATE_LIMITED | 1 (pick interests on signup) |
| — | POST | `/api/auth/login` | Authenticate email+password, issue JWT cookie, open an analytics `user_sessions` row. Public. | `{ email, password }` | `200 { user:{ id, email, role, organizer_kind, is_host, display_name, handle, is_verified, onboarding_completed_at }, session:{ expires_at } }` + `Set-Cookie` | VALIDATION_ERROR, UNAUTHORIZED (bad creds), RATE_LIMITED | — (infra) |
| — | POST | `/api/auth/logout` | Clear the JWT cookie, stamp `user_sessions.ended_at=now()`. Auth. | `{}` (cookie) | `204` + cleared `Set-Cookie` | UNAUTHORIZED | — (infra) |
| — | POST | `/api/auth/refresh` | Re-issue the JWT cookie from the refresh cookie, extend expiry. | `{}` (refresh cookie) | `200 { session:{ expires_at } }` + rotated `Set-Cookie` | UNAUTHORIZED (invalid/expired) | — (infra) |
| — | POST | `/api/auth/oauth/:provider` | Social login/signup (`provider`∈`google`\|`apple`): verifies token, upserts `oauth_accounts` (+`users` on first login), issues JWT cookie. Public. | `{ id_token, role?:"attendee"\|"organizer", organizer_kind? }` (role used only when creating a new user) | `200 { user:{ id, email, role, organizer_kind, is_host, display_name, handle, onboarding_completed_at }, session:{ expires_at }, is_new:bool }` + `Set-Cookie` | VALIDATION_ERROR, UNAUTHORIZED (invalid token), CONFLICT (email/handle taken) | — (infra) |
| Read | GET | `/api/auth/me` | Return the authenticated user's full self profile + prefs. Auth. | none (cookie) | `200 SelfUser` = `{ id, email, role, organizer_kind, is_host, display_name, handle, is_verified, avatar_url, cover_image_url, bio, home_city, home_lat, home_lng, home_place_id, location_radius_km, onboarding_completed_at, notification_prefs, follower_count, following_count, last_active_at, created_at, updated_at }` | UNAUTHORIZED | — (infra) |
| Read | GET | `/api/auth/oauth-accounts` | List the current user's linked social accounts (`oauth_accounts` where `user_id`=self). Auth. | none | `200 { data:[{ id, provider, provider_uid, created_at }] }` | UNAUTHORIZED | — (infra) |
| Delete | DELETE | `/api/auth/oauth-accounts/:id` | Unlink a social account (own row); blocked if it's the only credential and no `password_hash`. Owner. | none | `204` | UNAUTHORIZED, FORBIDDEN (not owner), CONFLICT (last credential), NOT_FOUND | — (infra) |

### 7.2 Users, Profile & Interests

| CRUD | HTTP Verb | Endpoint | Description | Request Shape | Response Shape | Error Cases | User Stories |
|---|---|---|---|---|---|---|---|
| Read | GET | `/api/users/:id` | Public profile of any user; includes viewer-relative `is_following`; excludes email/prefs. Public. | none | `200 { id, display_name, handle, role, organizer_kind, is_host, is_verified, avatar_url, cover_image_url, bio, home_city, follower_count, following_count, is_following:bool\|null, created_at }` | NOT_FOUND | 6, 14 |
| Update | PATCH | `/api/users/:id` | Edit own profile: avatar/cover/bio/name/handle, home city+geo+radius, `is_host` toggle (organizers only — the sports/host sub-capability), `notification_prefs`, onboarding completion. Owner (self). | `{ display_name?, handle?, bio?, avatar_url?, cover_image_url?, home_city?, home_lat?, home_lng?, home_place_id?, location_radius_km?, is_host?, notification_prefs?:{ [type]:{ in_app?, push?, email? } }, onboarding_completed_at? }` | `200 SelfUser` | UNAUTHORIZED, FORBIDDEN (not self), VALIDATION_ERROR (incl. `is_host=true` when `role≠organizer`), CONFLICT (handle taken), NOT_FOUND | 1, 7, 9 |
| Read | GET | `/api/users/:id/saved` | Paginated saved events (`saved_events`→`events`). Owner (self). | `?cursor=&limit=` | `{ data:[{ event:EventCard, saved_at }], nextCursor }` | UNAUTHORIZED, FORBIDDEN (not self), NOT_FOUND | 5 |
| Read | GET | `/api/users/:id/rsvps` | Paginated RSVPs (`rsvps`→`events`), optional status filter. Owner (self). | `?status=going\|interested\|waitlisted\|cancelled&cursor=&limit=` | `{ data:[{ rsvp:{ id, status, guests_count, attended, created_at }, event:EventCard }], nextCursor }` | UNAUTHORIZED, FORBIDDEN (not self), VALIDATION_ERROR (bad status), NOT_FOUND | 5 |
| Read | GET | `/api/users/:id/events` | Paginated events authored by this organizer (`events.organizer_id=:id`). Public sees `published`/`past`; owner also sees `draft`/`cancelled`. Powers the organizer profile (upcoming vs past). | `?status=upcoming\|past\|draft\|cancelled&cursor=&limit=` | `{ data:[EventCard + { status, rsvp_count, save_count }], nextCursor }` | VALIDATION_ERROR, NOT_FOUND | 6, 11, 14 |
| Read | GET | `/api/interests` | Public catalog of the 24 onboarding interests (`interests`), active only by default, ordered by `sort_order`. | `?includeInactive=bool` | `{ data:[{ id, slug, label, category_id, icon, is_active, sort_order }] }` (unpaginated fixed set) | — | 1 |
| Read | GET | `/api/users/:id/interests` | List a user's selected interests (`user_interests`→`interests`) with source/weight. Public. | none | `{ data:[{ interest:{ id, slug, label, category_id, icon }, source:"onboarding"\|"user_added"\|"inferred", weight, created_at }] }` | NOT_FOUND | 1 |
| Update | PUT | `/api/users/:id/interests` | Replace the user's entire multi-select interest set in one call (onboarding submit + bulk re-edit); diffs `user_interests` transactionally. Owner (self). | `{ interest_ids:uuid[], source?:"onboarding"\|"user_added" }` | `{ data:[{ interest:{...}, source, weight, created_at }] }` | UNAUTHORIZED, FORBIDDEN (not self), VALIDATION_ERROR (unknown/inactive id), NOT_FOUND | 1 |
| Create | POST | `/api/users/:id/interests` | Add a single interest (idempotent on composite PK `(user_id,interest_id)`). Owner (self). | `{ interest_id, source?:"user_added" }` | `201 { interest:{...}, source, weight, created_at }` | UNAUTHORIZED, FORBIDDEN (not self), VALIDATION_ERROR (unknown/inactive), CONFLICT (already picked), NOT_FOUND | 1 |
| Delete | DELETE | `/api/users/:id/interests/:interestId` | Remove one interest (`user_interests` row) — lets a user edit which interests they keep. Owner (self). | none | `204` | UNAUTHORIZED, FORBIDDEN (not self), NOT_FOUND (pick not found) | 1 |
| Create | POST | `/api/users/:id/follow` | Current user follows `:id`: inserts `follows(follower_id=me, followee_id=:id)`, bumps `follower_count`/`following_count`. Auth. | `{}` (target=`:id`) | `201 { follower_id, followee_id, created_at, is_following:true, followee:{ id, follower_count } }` | UNAUTHORIZED, VALIDATION_ERROR (self-follow, `follower≠followee`), CONFLICT (already following), NOT_FOUND | 6, 14 |
| Delete | DELETE | `/api/users/:id/follow` | Current user unfollows `:id`: deletes the `follows` row, decrements counts. Auth. | none | `204` | UNAUTHORIZED, NOT_FOUND (not following/no such user) | 6, 14 |
| Read | GET | `/api/users/:id/followers` | Paginated followers of `:id`, with viewer-relative `is_following`. Public. | `?cursor=&limit=` | `{ data:[{ user:UserRef + { is_following }, created_at }], nextCursor }` | NOT_FOUND | 14 |
| Read | GET | `/api/users/:id/following` | Paginated users that `:id` follows, with viewer-relative `is_following`. Public. | `?cursor=&limit=` | `{ data:[{ user:UserRef + { is_following }, created_at }], nextCursor }` | NOT_FOUND | 6 |

### 7.3 Events & Discovery

| CRUD | HTTP Verb | Endpoint | Description | Request Shape | Response Shape | Error Cases | User Stories |
|---|---|---|---|---|---|---|---|
| Read | GET | `/api/events` | List & discover **published** events with multi-select filters, keyword + geo search, and sorting; personalized ranking when authed. Public. | query `{ category:string[] (categories.slug), source:string[] ("native"\|"ticketmaster"\|"seatgeek"), q, nearLat, nearLng, radiusKm, city, dateFrom:ISO, dateTo:ISO, priceMin, priceMax, isFree:bool, ageMax:int (matches events with age_min ≤ ageMax or null), isSports:bool, sort:"relevance"\|"date"\|"distance"\|"popularity", cursor, limit }` (array facets repeated: `?category=music&category=nightlife`; geo is flat scalars `?nearLat=40.7&nearLng=-74&radiusKm=40`) | `{ data:[EventCard], nextCursor }` | VALIDATION_ERROR, RATE_LIMITED | 3, 4 |
| Read | GET | `/api/events/:id` | Full event detail: core fields, category, tags, `sports_details` + positions (open-slot counts), going stack, organizer, viewer flags. Increments `view_count`. Public. | none | `{ id, organizer:UserRef\|null, external_organizer_name, title, slug, description, description_is_ai, flyer_url, category:{slug,name,color_hex,icon}, status, source, external_id, external_url, starts_at, ends_at, timezone, venue_name, address, city, lat, lng, google_place_id, price_min, price_max, is_free, currency, capacity, age_min, age_label, is_sports, rsvp_count, save_count, view_count, published_at, tags:[{id,slug,label,source,confidence}], sports_details:{ sport, skill_level, venue_setting, players_needed, players_signed_up, duration_minutes, default_position, notes, positions:[{id,label,capacity,skill_level,sort_order,open_slots}] }\|null, going_stack:{ count, avatars:[{user_id,display_name,avatar_url}] }, viewer:{ is_saved, rsvp_status, roster_status }\|null }` | NOT_FOUND | 5, 8, 11 |
| Create | POST | `/api/events` | Create a native event; starts `draft`. Sets `organizer_id`=caller, `source="native"`. Optional `sports_details`+`positions` (sets `is_sports`). Auth: `organizer`; additionally requires `host` (`is_host=true`) when `is_sports`. | `{ title, description?, description_is_ai?, flyer_url?, category_id, starts_at, ends_at?, timezone, venue_name?, address?, city, lat?, lng?, google_place_id?, price_min?, price_max?, is_free?, currency?, capacity?, age_min?, age_label?, is_sports?, sports_details?:{ sport, skill_level, venue_setting, players_needed, duration_minutes?, default_position?, notes?, positions?:[{label, capacity, skill_level?, sort_order?}] } }` | `201 { ...event as GET /events/:id, status:"draft" }` | UNAUTHORIZED, FORBIDDEN (non-organizer/non-host), VALIDATION_ERROR | 9, 11 |
| Update | PATCH | `/api/events/:id` | Partial-update an owned native event (any editable field or nested `sports_details`; `status:"cancelled"` allowed). Synced events reject edits. Owner. | `{ title?, description?, description_is_ai?, flyer_url?, category_id?, starts_at?, ends_at?, timezone?, venue_name?, address?, city?, lat?, lng?, google_place_id?, price_min?, price_max?, is_free?, currency?, capacity?, age_min?, age_label?, status?:"cancelled", sports_details?:{ sport?, skill_level?, venue_setting?, players_needed?, duration_minutes?, default_position?, notes? } }` | `{ ...event as GET /events/:id }` | UNAUTHORIZED, FORBIDDEN (not-owner/synced), NOT_FOUND, VALIDATION_ERROR | 9, 11 |
| Delete | DELETE | `/api/events/:id` | Delete an owned native event (cascades `event_tags`/`comments`/`rsvps`/`roster_entries`). Synced events not deletable. Owner. | none | `204` | UNAUTHORIZED, FORBIDDEN (not-owner/synced), NOT_FOUND | 11 |
| — | POST | `/api/events/:id/publish` | Transition owned event `draft`→`published`; validates required fields, sets `published_at`, enqueues `event_embedding` + followed-organizer notifications. Owner. | `{}` | `{ id, status:"published", published_at }` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR (incomplete draft), CONFLICT (already published/cancelled) | 11, 14 |
| Read | GET | `/api/events/:id/related` | Related events via shared category/tags + `event_embeddings` cosine similarity (pgvector). Excludes self & unpublished. Public. | `?limit=` (≤20, def 8) | `{ data:[EventCard] }` | NOT_FOUND | 2, 4 |
| Read | GET | `/api/events/:id/tags` | List an event's tags (`ai`/`organizer`/`system`) backing the removable "×" pills. Public. | none | `{ data:[{ id, slug, label, source, confidence, created_at }] }` | NOT_FOUND | 12 |
| Create | POST | `/api/events/:id/tags` | Add a tag to an owned event (organizer-added, or accept an AI suggestion). Idempotent on `UNIQUE(event_id,slug)`. Owner. | `{ slug, label, source?:"organizer"\|"ai", confidence? }` | `201 { id, event_id, slug, label, source, confidence, created_at }` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, CONFLICT (duplicate slug) | 12 |
| Delete | DELETE | `/api/events/:id/tags/:tagId` | Remove a tag pill from an owned event. Owner. | none | `204` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | 12 |
| Read | GET | `/api/events/:id/comments` | Threaded comments (top-level, or replies via `parentId`), paginated; excludes soft-deleted. `reply_count` is a derived count of child rows. Public. | `?parentId=&cursor=&limit=` | `{ data:[{ id, author:{id,display_name,handle,avatar_url}, body, parent_comment_id, reply_count, created_at, edited_at }], nextCursor }` | NOT_FOUND | — |
| Create | POST | `/api/events/:id/comments` | Post a comment or threaded reply (sets `comments.event_id`; `parent_comment_id` nesting). Auth. | `{ body, parent_comment_id? }` | `201 { id, event_id, author:{...}, body, parent_comment_id, like_count:0, created_at }` | UNAUTHORIZED, NOT_FOUND (event/parent), VALIDATION_ERROR | — |
| Delete | DELETE | `/api/comments/:id` | Soft-delete a comment (sets `deleted_at`); works for both event and post comments. Auth: comment author OR event owner OR post author. | none | `204` | UNAUTHORIZED, FORBIDDEN (not author/owner), NOT_FOUND | — |

### 7.4 Engagement, RSVP & Roster

| CRUD | HTTP Verb | Endpoint | Description | Request Shape | Response Shape | Error Cases | User Stories |
|---|---|---|---|---|---|---|---|
| Create/Update | PUT | `/api/events/:id/rsvp` | Upsert the caller's RSVP; flips `rsvps.status` in place (`UNIQUE(user_id,event_id)`), **adjusts `events.rsvp_count` only on transitions into/out of `status='going'`** (so the "+N going" count/GoingStack isn't inflated by `interested`/`waitlisted`), emits an `rsvp` interaction. `waitlisted` is accepted but has no auto-promotion for non-sports (organizer-managed only; sports waitlists live on the roster). Non-sports events (sports use the roster). Auth. | `{ status:"going"\|"interested"\|"waitlisted"\|"cancelled", guests_count?:int=0 }` | `{ id, user_id, event_id, status, guests_count, attended, checked_in_at, created_at, updated_at, event_rsvp_count }` | UNAUTHORIZED, NOT_FOUND, VALIDATION_ERROR, CONFLICT (event cancelled/past) | 5 |
| Delete | DELETE | `/api/events/:id/rsvp` | Cancel the caller's RSVP — `rsvps.status='cancelled'`, decrement `events.rsvp_count`, emit `rsvp_cancel`. Auth. | none | `204` (or `{ status:"cancelled", event_rsvp_count }`) | UNAUTHORIZED, NOT_FOUND | 5 |
| Read | GET | `/api/events/:id/rsvps` | Organizer view of who RSVP'd; optional status filter, with counts. Owner. Paginated. | `?status=going&cursor=&limit=` | `{ data:[{ id, user:{ id, display_name, handle, avatar_url, is_verified }, status, guests_count, attended, checked_in_at, created_at }], nextCursor, counts:{ going, interested, waitlisted } }` | UNAUTHORIZED, FORBIDDEN (not organizer), NOT_FOUND | 13 |
| Update | PATCH | `/api/events/:id/rsvps/:userId` | Organizer check-in: mark an attendee `attended=true`, `checked_in_at=now()` (feeds the ranker's top-weight non-sports attendance signal, emits `attend`). Owner (organizer). | `{ attended:true }` | `{ user_id, event_id, attended, checked_in_at }` | UNAUTHORIZED, FORBIDDEN (not organizer), NOT_FOUND | 13 |
| Create | PUT | `/api/events/:id/save` | Idempotent bookmark — inserts `saved_events(user_id,event_id)`, increments `events.save_count`, emits `save`. Auth. | none | `{ user_id, event_id, saved_at, save_count, saved:true }` | UNAUTHORIZED, NOT_FOUND | 5 |
| Delete | DELETE | `/api/events/:id/save` | Remove bookmark from `saved_events`, decrement `events.save_count`, emit `unsave`. Auth. | none | `204` (or `{ save_count, saved:false }`) | UNAUTHORIZED, NOT_FOUND | 5 |
| Read | GET | `/api/events/:id/positions` | Position-picker grid for a sports run: each `sports_positions` row with computed open slots (`capacity`−`claimed`) and per-slot occupancy. Public. | none | `{ sports_detail:{ event_id, sport, skill_level, venue_setting, players_needed, players_signed_up }, positions:[{ id, label, capacity, skill_level, sort_order, claimed_count, open_slots, slots:[{ slot_number, claimed }] }] }` | NOT_FOUND (event or non-sports) | 8, 9 |
| Read | GET | `/api/events/:id/roster` | Host + players view of who claimed which position, open slots, and the FIFO waitlist (`roster_entries` grouped by status). Auth. Paginated. | `?cursor=&limit=` | `{ sports_detail:{ event_id, players_needed, players_signed_up, skill_level }, claimed:[{ id, user:{ id, display_name, avatar_url }, sports_position_id, position_label, slot_number, status, claimed_at, checked_in_at }], waitlist:[{ id, user:{...}, waitlist_position, claimed_at }], open_slots }` | UNAUTHORIZED, NOT_FOUND | 8, 9, 10 |
| Create | POST | `/api/events/:id/roster` | Join the run AND claim a spot. Body picks a `sports_position_id` (+optional `slot_number`); server assigns the lowest free slot → `claimed`, or if at `sports_details.players_needed` → `waitlisted` with a `waitlist_position`. Omit `sports_position_id` for simple runs (synthetic "Any" position). One live claim per user per run; emits `claim_spot`. Auth. | `{ sports_position_id?, slot_number? }` | `{ id, event_id, sports_detail_id, sports_position_id, user_id, slot_number, status:"claimed"\|"waitlisted", waitlist_position, claimed_at }` | UNAUTHORIZED, NOT_FOUND (event/position), CONFLICT (already claimed or slot taken), VALIDATION_ERROR | 8 |
| Delete | DELETE | `/api/events/:id/roster` | Leave the run / release the caller's spot — sets live `roster_entries.status='cancelled'`, frees the slot; capacity trigger auto-promotes the next waitlisted player. Emits `release_spot`. Auth. | none | `204` | UNAUTHORIZED, NOT_FOUND | 8 |
| Update | PATCH | `/api/events/:id/roster/:entryId` | Host management of one entry: promote from waitlist (assign slot), mark `no_show`/`attended` (sets `checked_in_at`), move position, or remove a player (`cancelled`). Owner (host). | `{ status?:"claimed"\|"waitlisted"\|"cancelled"\|"no_show"\|"attended", sports_position_id?, slot_number? }` | `{ id, user_id, sports_position_id, slot_number, status, waitlist_position, checked_in_at, cancelled_at }` | UNAUTHORIZED, FORBIDDEN (not host), NOT_FOUND, CONFLICT (slot taken), VALIDATION_ERROR | 10 |

### 7.5 Social & Notifications

| CRUD | HTTP Verb | Endpoint | Description | Request Shape | Response Shape | Error Cases | User Stories |
|---|---|---|---|---|---|---|---|
| Read | GET | `/api/notifications` | Caller's bell feed from `notifications` (followed-organizer events, RSVP confirmations, roster/social updates, delivered reminders); optional unread filter. Auth. Paginated. Response carries live `unread_count`. | `?is_read=false&cursor=&limit=` | `{ data:[{ id, type, channel, actor:{ id, display_name, avatar_url }\|null, event_id, title, body, metadata, is_read, read_at, created_at }], nextCursor, unread_count }` | UNAUTHORIZED | 6, 7 |
| Update | PATCH | `/api/notifications/:id/read` | Mark one notification read (`is_read=true`, `read_at=now()`). Owner (recipient). | `{}` | `{ id, is_read:true, read_at }` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | 7 |
| Update | POST | `/api/notifications/read-all` | Mark all of the caller's unread notifications read. Auth. | `{}` | `{ updated:int, unread_count:0 }` | UNAUTHORIZED | 7 |
| Create | POST | `/api/events/:id/reminders` | Schedule a pre-event reminder for a saved/RSVP'd event; server computes `event_reminders.remind_at = starts_at − offset_minutes`, `status='scheduled'`. Auth. | `{ offset_minutes:int, channel:"in_app"\|"push"\|"email" }` | `{ id, user_id, event_id, offset_minutes, remind_at, channel, status:"scheduled", created_at }` | UNAUTHORIZED, NOT_FOUND, VALIDATION_ERROR, CONFLICT (`UNIQUE(user_id,event_id,remind_at)`) | 7 |
| Read | GET | `/api/users/:id/reminders` | List a user's scheduled reminders (`event_reminders`). Owner (self). Paginated. | `?status=scheduled&cursor=&limit=` | `{ data:[{ id, event_id, offset_minutes, remind_at, channel, status, sent_at, created_at }], nextCursor }` | UNAUTHORIZED, FORBIDDEN (not self), NOT_FOUND | 7 |
| Delete | DELETE | `/api/reminders/:id` | Cancel a scheduled reminder — `event_reminders.status='cancelled'`. Owner. | none | `204` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | 7 |
| Read | GET | `/api/feed/social` | Instagram-style feed of `posts` (followed users + discovery), newest first, with the caller's like state + author badge. Auth. Paginated. | `?cursor=&limit=` | `{ data:[{ id, author:UserRef, event_id, kind:"flyer"\|"recap"\|"update", image_url, caption, like_count, comment_count, liked_by_me, created_at }], nextCursor }` | UNAUTHORIZED | 6, 14 |
| Create | POST | `/api/posts` | Create a `posts` row (PostCard), optionally linked to an event. Auth. | `{ kind:"flyer"\|"recap"\|"update", image_url, caption?, event_id? }` | `{ id, author_id, event_id, kind, image_url, caption, like_count:0, comment_count:0, created_at }` | UNAUTHORIZED, VALIDATION_ERROR, NOT_FOUND (event_id) | 14 |
| Create | POST | `/api/posts/:id/like` | Idempotent like — inserts `post_likes(post_id,user_id)`, increments `posts.like_count`, emits `post_like`. Auth. | none | `{ post_id, like_count, liked:true }` | UNAUTHORIZED, NOT_FOUND | — |
| Delete | DELETE | `/api/posts/:id/like` | Remove the caller's like from `post_likes`, decrement `posts.like_count`. Auth. | none | `{ post_id, like_count, liked:false }` (or `204`) | UNAUTHORIZED, NOT_FOUND | — |
| Read | GET | `/api/posts/:id/comments` | Threaded comments on a `posts` row (`comments.post_id`), paginated, excludes soft-deleted. Public. | `?parentId=&cursor=&limit=` | `{ data:[{ id, author:{id,display_name,handle,avatar_url}, body, parent_comment_id, reply_count, created_at, edited_at }], nextCursor }` | NOT_FOUND | 14 |
| Create | POST | `/api/posts/:id/comments` | Comment/reply on a post (`comments.post_id`, `parent_comment_id`), bumps `posts.comment_count`. Auth. | `{ body, parent_comment_id? }` | `201 { id, post_id, author:{...}, body, parent_comment_id, like_count:0, created_at }` | UNAUTHORIZED, NOT_FOUND (post/parent), VALIDATION_ERROR | 14 |
| Read | GET | `/api/stories` | Story rings (StoriesRow): non-expired `stories` (`expires_at`>now) grouped by author with the caller's viewed state from `story_views`. Auth. Paginated. | `?cursor=&limit=` | `{ data:[{ author:{ id, display_name, avatar_url }, all_viewed, stories:[{ id, media_url, caption, event_id, created_at, expires_at, viewed_by_me }] }], nextCursor }` | UNAUTHORIZED | — |
| Create | POST | `/api/stories` | Post an ephemeral story (`stories`); server sets `expires_at=now()+24h`. Auth. | `{ media_url, caption?, event_id? }` | `{ id, author_id, media_url, caption, event_id, created_at, expires_at }` | UNAUTHORIZED, VALIDATION_ERROR, NOT_FOUND (event_id) | — |
| Create | POST | `/api/stories/:id/view` | Idempotent seen-marker — upserts `story_views(story_id,viewer_id)`. Auth. | none | `{ story_id, viewed_at }` (or `204`) | UNAUTHORIZED, NOT_FOUND | — |

### 7.6 AI Features

| CRUD | HTTP Verb | Endpoint | Description | Request Shape | Response Shape | Error Cases | User Stories |
|---|---|---|---|---|---|---|---|
| — | POST | `/api/recommendations` | **Headline** behavior-based "For You" feed: pgvector kNN of `user_preference_vectors` vs `event_embeddings` (blended with `user_category_affinities` for cold-start), re-ranked; writes one `recommendation_impressions` row per item (feed_run_id, rank, score, rationale_text, rationale_signal). Auth. | `{ context?:{ surface:"for_you", tab?, category? }, cursor?, limit? }` (userId from session) | `{ data:[{ event:EventCard, score, rationale:{ text (≤168 chars → rationale_text), signal:interaction_type → rationale_signal }, recommendationId }], feedRunId, nextCursor }` | UNAUTHORIZED, VALIDATION_ERROR, RATE_LIMITED | 2 |
| Update | POST | `/api/recommendations/:recommendationId/feedback` | Closes the recommender loop: updates `recommendation_impressions` (clicked/clicked_at/converted) and emits an `interaction_events` row (`rec_click`/`rec_dismiss`/`rec_impression`, recommendation_id, feed_position). Auth. | `{ action:"click"\|"dismiss"\|"convert", feedPosition? }` | `{ ok:true }` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR | 2 |
| — | POST | `/api/search` | Natural-language search: NL parser produces `parsed_filters`, Postgres FTS/`search_document`+filters narrow candidates, pgvector re-ranks vs `user_preference_vectors`; logs a `search_queries` row (raw_query, parsed_filters, query_embedding, result_count, latency_ms, clicked_event_id). Public (anon `user_id` nullable). | `{ q, near?:{ lat, lng, radiusKm? }\|{ city }, filters?:{ category?:string[], dateFrom?, dateTo?, isFree?, priceMax?, city?, ageMax? }, cursor?, limit? }` | `{ parsedFilters:{ category:string[], dateFrom, dateTo, isFree, city, priceMax?, near? }, data:[EventCard], searchQueryId, nextCursor }` | VALIDATION_ERROR, RATE_LIMITED | 3, 4 |
| Create | POST | `/api/events/:id/autotag` | AI auto-categorization: generates and upserts suggested `#tag` pills into `event_tags` (source=`ai`, confidence 0–1) and logs `ai_generation_logs` (type=`tags`). Owner (organizer). | `{ title, description }` | `{ tags:[{ slug, label, source:"ai", confidence }] }` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, RATE_LIMITED | 12 |
| — | POST | `/api/ai/generate-description` | "Write with AI" — drafts an event description; logs `ai_generation_logs` (type=`description`); persisting the result sets `events.description_is_ai=true`. Owner (organizer). | `{ title, category, details?, tone?:"hype"\|"professional"\|"casual" }` | `{ description }` | UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, RATE_LIMITED | 12 |
| Create | POST | `/api/ai/conversations` | Start a conversational planning-assistant thread (AIAssistantDrawer); inserts an `ai_conversations` row. Auth. | `{ title? }` | `{ id, title, createdAt }` | UNAUTHORIZED, VALIDATION_ERROR | 2, 3 |
| Read | GET | `/api/ai/conversations/:id` | Fetch an assistant thread and its paginated messages (`ai_conversations` + `ai_messages`). Owner. | `?cursor=&limit=` | `{ id, title, createdAt, updatedAt, messages:[{ id, role:"user"\|"assistant"\|"system", content, eventRefs:uuid[], createdAt }], nextCursor }` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | 2, 3 |
| Create | POST | `/api/ai/conversations/:id/messages` | Send a user turn; persists user + assistant `ai_messages` (assistant row carries `event_refs`), bumps `ai_conversations.updated_at`, logs `ai_generation_logs` (type=`chat`). Owner. | `{ content }` | `{ message:{ id, role:"assistant", content, eventRefs:uuid[], createdAt }, eventRefs:uuid[] (inline result cards) }` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, RATE_LIMITED | 2, 3 |
| — | POST | `/api/ai/embeddings/rebuild` | Internal/admin batch job — regenerate `event_embeddings` and/or `user_preference_vectors` (re-embed on `content_hash` change or `force`), bump `vector_version`, record `ai_generation_logs` (type=`event_embedding`/`user_vector`). Admin. | `{ target:"events"\|"users"\|"all", eventIds?:uuid[], userIds?:uuid[], model?, force? }` | `{ jobId, queued:int, model, vectorVersion:int }` | UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR | — (infra; powers 2) |

### 7.7 External Sync, Feedback & Analytics

| CRUD | HTTP Verb | Endpoint | Description | Request Shape | Response Shape | Error Cases | User Stories |
|---|---|---|---|---|---|---|---|
| — | POST | `/api/admin/sync/ticketmaster` | Admin/cron pull from Ticketmaster Discovery into `events` (source=`ticketmaster`). Upserts on `UNIQUE(source,external_id)`: new rows inserted, existing refreshed (title/price/status/starts_at/external_url/raw_payload, `last_synced_at=now()`); rows fresh within the refresh window count as `skippedDuplicates`. Admin. | `{ city, lat, lng, radiusKm, dateFrom:ISO, dateTo:ISO }` | `{ fetched, inserted, updated, skippedDuplicates }` | UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, RATE_LIMITED, EXTERNAL_API_ERROR | infra — feeds 2, 3, 4 |
| — | POST | `/api/admin/sync/seatgeek` | Admin/cron pull from SeatGeek into `events` (source=`seatgeek`); identical dedupe/refresh semantics (upsert on `UNIQUE(source,external_id)`, refresh stale rows by `last_synced_at`). Admin. | `{ city, lat, lng, radiusKm, dateFrom:ISO, dateTo:ISO }` | `{ fetched, inserted, updated, skippedDuplicates }` | UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, RATE_LIMITED, EXTERNAL_API_ERROR | infra — feeds 2, 3, 4 |
| Read | GET | `/api/admin/sync/status` | Admin per-source ingestion health from `events`: latest `last_synced_at`, total row count, and stale-row count per provider. Admin. | none | `{ sources:[{ source:"ticketmaster"\|"seatgeek"\|"native", lastSyncedAt, eventCount, staleCount }] }` | UNAUTHORIZED, FORBIDDEN | infra |
| Create | POST | `/api/feedback` | Submit in-app feedback into `feedback` (auth optional: `user_id` from session when present else null with `email` reply-to; `user_agent` captured server-side). `content_report` sets `reported_event_id`. Public. | `{ type:"bug"\|"feature_request"\|"general"\|"content_report"\|"other", subject?, message, rating?(1-5), email?, screen, appVersion?, reportedEventId? }` | `{ id, status:"new" }` | VALIDATION_ERROR, NOT_FOUND (reportedEventId), RATE_LIMITED | — |
| Read | GET | `/api/admin/feedback` | Admin triage list of `feedback`, filterable by status/type, newest-first. Admin. Paginated. | `?status=&type=&cursor=&limit=` | `{ data:[{ id, type, status, subject, message, rating, email, screen, appVersion, userAgent, reportedEventId, userId, createdAt, resolvedAt }], nextCursor }` | UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR | — |
| Update | PATCH | `/api/admin/feedback/:id` | Admin advances triage state; `resolved`/`wont_fix` stamps `resolved_at`. Admin. | `{ status:"triaged"\|"in_progress"\|"resolved"\|"wont_fix" }` | `{ id, status, resolvedAt }` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR | — |
| Read | GET | `/api/events/:id/analytics` | Organizer performance time-series from `event_analytics_daily` for one event, per-day series + range totals. Owner. | `?from=YYYY-MM-DD&to=YYYY-MM-DD` | `{ eventId, range:{ from, to }, totals:{ views, saves, rsvps, shares }, series:[{ date, views, saves, rsvps, shares }] }` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR | 13 |
| Read | GET | `/api/organizers/:id/analytics` | Aggregate analytics across all of an organizer's events (self-only); sums `event_analytics_daily`, adds event count + `users.follower_count`, with a top-events breakdown. Owner (self). | `?from=YYYY-MM-DD&to=YYYY-MM-DD` | `{ organizerId, range:{ from, to }, totals:{ views, saves, rsvps, shares, events, followerCount }, series:[{ date, views, saves, rsvps, shares }], topEvents:[{ eventId, title, views, saves, rsvps, shares }] }` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | 13, 14 |
| Create | POST | `/api/interactions` | Batch behavior-signal ingest → append-only `interaction_events` (raw stream feeding the "For You" recommender + `user_category_affinities`). Beacon batch; auth optional (anonymous via a client-minted `session_id` — the handler **upserts a `user_sessions` row for that id first** so the FK holds). Side-effects: a `search_result_click` (carrying `search_query_id` + `event_id`) **back-writes `search_queries.clicked_event_id`**; a `rec_click`/`rec_dismiss` (carrying `recommendation_id`) updates `recommendation_impressions.clicked`/`converted`. Rate-limited. | `{ events:[{ interaction_type, surface, event_id?, category_id?, target_user_id?, tag?, dwell_ms?, feed_position?, recommendation_id?, search_query_id?, session_id?, weight?, metadata? }] }` | `{ accepted:int }` | VALIDATION_ERROR, RATE_LIMITED, UNAUTHORIZED | 2 |
| Read | GET | `/api/categories` | Public lookup of the fixed `categories` with Figma color/icon tokens for chips and filter facets, ordered by `sort_order`. | none | `{ data:[{ id, slug, name, colorHex:"#RRGGBB", icon, sortOrder }] }` (unpaginated fixed set) | — | 4 |

> **Attendance signal note:** non-sports attendance is set by the organizer via `PATCH /api/events/:id/rsvps/:userId` (check-in); sports attendance via host `PATCH /api/events/:id/roster/:entryId` → `attended`. Both emit an `attend` `interaction_events` row, so the ranker's highest-weight signal is captured from either path.

---

## 8. State Architecture

### State approach

Loop's front end keeps a hard split between **server state** (anything originating in Postgres and fetched over `/api`) and **client/UI state** (ephemeral view concerns). Server state is owned by a **TanStack Query (React Query)** cache keyed by resource; components never copy fetched data into `useState`. Client state lives in small React Contexts (auth, assistant, toast/modal) plus local component `useState`/`useReducer`.

- **Auth is server-authoritative.** The source of truth for a session is the **stateless JWT in an HTTP-only, Secure, SameSite cookie** set by the backend — the React app never reads or stores a JWT in `localStorage`/`sessionStorage`, the correct posture for mobile web (immune to XSS token theft). The client only holds a **mirror** of the current user in the `['me']` query cache (a subset of `users`: `id`, `role`, `organizer_kind`, `is_host`, `display_name`, `handle`, `avatar_url`, `is_verified`, `home_city`/`home_lat`/`home_lng`/`location_radius_km`, `follower_count`, `following_count`, `onboarding_completed_at`). A thin `AuthContext` exposes `currentUser`, `isAuthenticated`, and role/capability helpers derived from that cache — it stores no credentials.
- **Server-state cache (React Query):** events, For-You recommendations, event detail, search results, RSVPs, saves, interests catalog, roster, notifications, analytics, social feed, assistant threads. Each has a stable query key so mutations invalidate precisely.
- **Client/UI state:** filter selections, search input text, drawer open/closed, assistant draft, form inputs (CreateEvent, onboarding picks before commit), toast queue, modal target, mobile-nav active tab.
- **URL owns shareable state.** Active category, filter arrays, search text, and "near me" radius serialize into `?`-query params (React Router `useSearchParams`) so a Discover/search view is deep-linkable and survives refresh/back — the filter object is derived from the URL, not the reverse.

### State table

| Name | Type | Initial Value | Owner | What Triggers Updates |
|---|---|---|---|---|
| `currentUser` | object \| null (subset of `users`, incl. `follower_count`/`following_count`) | `null` (cache empty; `AuthContext.isAuthenticated=false`) | React Query key `['me']`; mirrored read-only by `AuthContext` | Set from `GET /api/auth/me` after `POST /api/auth/login` or `/signup`; cleared on `POST /api/auth/logout` (any 401 also clears it); refetched when profile edits / follow counts / `onboarding_completed_at` change |
| `events` (Discover / list) | `{ data: EventCard[], nextCursor }` | `{ data: [], nextCursor: null }` | React Query key `['events', filters]` | `GET /api/events?cursor=&limit=&category=&city=&nearLat=&…`; refetch on any `filters`/URL-param change; infinite-scroll appends the next page via `nextCursor` |
| `forYouFeed` (recommendations) | `{ data: RecItem[], feedRunId, nextCursor }`, item = `event` + `rationale.text` + `score` + `recommendationId` | `{ data: [], feedRunId: null, nextCursor: null }` | React Query key `['recommendations', currentUser.id]` | `POST /api/recommendations` on ForYouFeed mount / tab switch / pull-to-refresh; invalidated after RSVP, save, follow, and interest edits (see re-fetch note); rationale copy feeds the AIChip; clicks/dismisses post `POST /api/recommendations/:recommendationId/feedback` |
| `eventDetail` | `Event` (+ joined `sports_details`, `event_tags`, counts, viewer flags) | `undefined` (loading) | React Query key `['event', id]` | `GET /api/events/:id` on EventDetail/SportsPickupDetail mount; invalidated by that event's RSVP/save/roster-claim mutations |
| `comments` | `{ data: Comment[], nextCursor }` | `{ data: [], nextCursor: null }` | React Query key `['event', id, 'comments']` / `['post', id, 'comments']` | `GET /api/events/:id/comments` or `GET /api/posts/:id/comments`; invalidated after the matching `POST …/comments` (optimistic insert) |
| `searchQueryText` | string | `''` | Local `useState` in the search bar, synced to URL `?q=` | User typing (debounced ~300ms); mic input; cleared by the × button |
| `parsedFilters` | object (NL parser output, shape of `search_queries.parsed_filters`) | `null` | React Query key `['search', q, filters]` response | Returned by `POST /api/search` alongside results; feeds the chip bar so parsed constraints render as removable pills; logged server-side to `search_queries` |
| `filters` | object with **multi-select arrays** (see below) | `{ category: [], source: [], dateRange: null, price: {min:null,max:null}, near: {lat:null,lng:null,radiusKm: currentUser.location_radius_km ?? 40}, isFree: false, ageMax: null, isSports: false, sort: 'relevance' }` | **URL** `useSearchParams` (source of truth), read via a `useFilters()` hook | Chip/pill toggles in `CatRow`/`FilterBar` push new URL params; each change re-derives the object and re-triggers `['events', filters]` / `['recommendations']` |
| `selectedInterests` | `string[]` (interest ids/slugs) | `[]` (onboarding) / server set post-onboarding | Local `useState` during onboarding; React Query key `['me','interests']` once committed | Chip toggles in the onboarding `ChipGrid` (local, "Pick at least 3" gate); committed via `PUT /api/users/:id/interests` writing `user_interests`; editable later on the UserProfile Interests tab |
| `interestsCatalog` / `categories` | `Interest[]` / `Category[]` | `[]` | React Query keys `['interests']`, `['categories']` (long `staleTime`, near-static) | `GET /api/interests`, `GET /api/categories` once at app/onboarding load; rarely invalidated |
| `rosterState` | `{ claimed, waitlist, positions, playersSignedUp, playersNeeded, open_slots }` | `{ claimed: [], waitlist: [], positions: [], playersSignedUp: 0, playersNeeded: 0, open_slots: 0 }` | React Query key `['event', id, 'roster']` | `GET /api/events/:id/roster` (+ `GET /api/events/:id/positions` for the picker grid); invalidated after `POST /api/events/:id/roster` and `DELETE /api/events/:id/roster` (claim/release) and host `PATCH …/roster/:entryId`, reflecting `roster_entries.status` + `sports_details.players_signed_up` |
| `selectedPositionId` | uuid \| null | `null` | Local `useState` in the SportsCounter position-picker grid | User taps a `sports_positions` slot before pressing Join; reset on successful claim |
| `notifications` | `{ data: Notification[], nextCursor, unread_count }` | `{ data: [], nextCursor: null, unread_count: 0 }` | React Query key `['notifications']` | `GET /api/notifications`; invalidated on `PATCH /api/notifications/:id/read` and `POST /api/notifications/read-all`; refetched on bell open / window focus |
| `unreadCount` | number | `0` | Derived from `['notifications'].unread_count` (drives the TopNav bell dot) | Decremented optimistically on read; reconciled from the `unread_count` field returned by `GET /api/notifications` |
| `assistantDrawer` | `{ open, conversationId, messages, draft, thinking }` | `{ open:false, conversationId:null, messages:[], draft:'', thinking:false }` | `AssistantContext` (open/draft/thinking) + React Query key `['ai','conversation', conversationId]` for persisted `ai_messages` | Floating Sparkles button toggles `open`; new thread → `POST /api/ai/conversations`; send → optimistic user message + `thinking:true` → `POST /api/ai/conversations/:id/messages`; response appends the assistant message + inline `eventRefs` cards; backdrop tap closes |
| `loading flags` (per query) | derived: `isLoading`/`isFetching`/`isPending` | `isLoading:true` per fresh query | React Query per key | Managed automatically by each `useQuery`/`useMutation`; drives skeletons, spinners, "Writing…"/pending-button states |
| `error flags` (per query) | derived: `isError` + `error.code` | `null` | React Query per key | Set from the standard envelope `{error:{code,message}}`; `UNAUTHORIZED` clears `['me']`; `VALIDATION_ERROR` maps to form-field errors; `RATE_LIMITED` shows a toast |
| `toast` | `{ id, kind, message }[]` (queue) | `[]` | `ToastContext` (`useReducer`) | Pushed by mutation success/error ("RSVP confirmed", "Event published"); auto-dismiss timer pops entries |
| `modal` | `{ name: string\|null, payload?: object }` | `{ name: null }` | `ModalContext` | Opened by actions (share sheet, confirm-cancel-RSVP, report content → `POST /api/feedback`); closed on backdrop/esc |
| `mobileNav` | `{ activeTab: Screen, menuOpen: boolean }` | `{ activeTab: derived-from-route, menuOpen:false }` | Local to `BottomBar`/`TopNav`; `activeTab` derived from React Router location | Route change sets the active tab; BottomBar tap navigates; TopNav hamburger toggles `menuOpen` |
| `createEventForm` | object mirroring `events` + `sports_details` fields | empty draft (`status:'draft'`, `is_sports:false`, `tags:[]`) | Local `useReducer` in CreateEvent (optionally React Hook Form) | Field inputs; "✨ Write with AI" fills `description` (`description_is_ai=true`) via `POST /api/ai/generate-description`; the AI-tags panel populates removable `event_tags` pills via `POST /api/events/:id/autotag`; Publish → `POST /api/events` then `POST /api/events/:id/publish` |
| `eventAnalytics` / `organizerAnalytics` | `{ series: EventAnalyticsDaily[], totals, topEvents? }` | `undefined` | React Query keys `['event', id, 'analytics']`, `['organizer', id, 'analytics']` | `GET /api/events/:id/analytics` / `GET /api/organizers/:id/analytics` (owner only), from `event_analytics_daily`; refetched on date-range change |
| `socialFeed` / `stories` | `{ data: Post[], nextCursor }` / `StoryRing[]` | `{ data: [], nextCursor:null }` / `[]` | React Query keys `['social','feed']`, `['stories']` | `GET /api/feed/social`, `GET /api/stories`; post-like (`POST /api/posts/:id/like`) invalidates the post; story view (`POST /api/stories/:id/view` → `story_views`) updates ring state |
| `geolocation` | `{ status: 'idle'\|'prompt'\|'granted'\|'denied', coords }` | `{ status:'idle', coords:null }` | `useGeolocation()` hook (wraps `navigator.geolocation`) | User taps the location pill/"near me"; on `granted`, writes `near.lat/lng` into `filters` (URL) and may persist to `users.home_lat/home_lng` via `PATCH /api/users/:id`; `denied` falls back to `home_city` |
| `theme` | `'light' \| 'dark'` | `'light'` (or `prefers-color-scheme`) | `ThemeContext`, persisted to `localStorage` (non-sensitive) | User toggle; system-preference change (`matchMedia`) |

**Filters object detail (multi-select arrays):** `category: string[]` (category `slug`s → `categories`/`events.category_id`), `source: EventSource[]` (`['native','ticketmaster','seatgeek']` → `events.source`), `dateRange` (preset like `'weekend'`/`'today'` or `{from,to}` ISO → `events.starts_at`), `price: {min,max}` (→ `events.price_min`/`price_max`), `near: {lat,lng,radiusKm}` (→ `events.lat`/`lng` radius, seeded from `users.location_radius_km`), `isFree: boolean` (→ `events.is_free`), `ageMax: number|null` (→ events with `events.age_min ≤ ageMax` or null). All list facets are arrays so multiple chips can be active at once; each maps to a repeated query param (`?category=music&category=nightlife`), and `near` flattens to `nearLat`/`nearLng`/`radiusKm`, matching the `GET /api/events` facets in §7.3.

### Re-fetch, invalidation, and data flow

Mutations drive **query-key invalidation** rather than manual cache surgery. An **RSVP** (`PUT /api/events/:id/rsvp`, `rsvps`) invalidates `['event', id]`, `['users', me, 'rsvps']`, and `['recommendations']` (RSVP/attendance is a top-weight ranking signal). A **save** (`PUT /api/events/:id/save`, `saved_events`) invalidates `['event', id]`, `['users', me, 'saved']`, and `['recommendations']`. A **follow** (`POST /api/users/:id/follow`, `follows`) invalidates `['users', id]`, `['me']` (follow counts), and `['recommendations']`. **Editing interests** (`PUT /api/users/:id/interests`, `user_interests`) invalidates `['me','interests']` and `['recommendations']`, since interest seeds feed the `user_preference_vector`. **Login/signup** refetches `['me']` and then `['recommendations']`+`['events']`. A **roster claim/release** (`POST`/`DELETE /api/events/:id/roster`, `roster_entries`) invalidates `['event', id, 'roster']` and `['event', id]` (updating `sports_details.players_signed_up` and the AlmostFullBadge). A **filter or search change** re-triggers `['events', filters]` / `['search', q, filters]` because the key includes the filter object (kept in the URL). Separately, **behavior signals** (`impression`, `view`, `dwell`, `click`, `category_click`, `rec_impression`, `rec_click`, `share`) are **fire-and-forget** batches to `POST /api/interactions` (writing `interaction_events`) via a non-blocking beacon sender — anonymous sessions carry a client-minted `session_id` from a first-touch cookie; these never mutate the React Query cache or block the UI, and their failures are swallowed. Data flows **App → providers → screens → children**: `App` mounts `QueryClientProvider`, `AuthContext`, `ThemeContext`, `ToastContext`, `ModalContext`, and `AssistantContext`; screens call `useQuery`/`useMutation` and read context; leaf components (`EventCard`, `RSVPBtn`, `SaveBtn`, `FollowBtn`, `SportsCounter`) receive data as **props down** and raise **mutations up** through callbacks/hooks — no leaf fetches on its own.

### Mobile-web / responsive specifics

Layout switches on the Figma breakpoints (`mobile 390 / tablet 768 / desktop 1440`). Navigation is breakpoint-driven: below `md`, the fixed **`BottomBar`** is the primary nav (with the elevated pink Create tab, gated to `role='organizer'`; the sports/host path inside Create additionally requires `is_host`), and **`TopNav`** collapses to logo + bell + avatar; at `md`+ the `BottomBar` is hidden and `TopNav` shows centered links. Event grids render **one column** (`w-full`) on mobile and step up to the 2/3/4-column `flex-wrap` grid (`sm:calc(50%) → lg:33% → xl:25%`) on larger screens, so `filters`/feed state is layout-agnostic. The **AIAssistantDrawer** slides in from the right (`translate-x-full → 0`) as a `w-320` panel with a `z-40` backdrop that closes it on tap; on mobile it **covers only the right portion** and must not obstruct the SportsPickupDetail roster (per the Figma note), so the drawer's `open` state is independent of route and never unmounts the underlying screen. **"Near me"** uses the `useGeolocation()` hook: tapping the location pill triggers the browser permission prompt; on `granted` we set `filters.near.lat/lng` (and may persist to `users.home_lat/home_lng` via `PATCH /api/users/:id`), on `denied` we fall back to `users.home_city`/`home_lat` so the feed still works. Touch/scroll uses horizontal scroll-snap rows (`CatRow`, `FilterBar`, `StoriesRow`) with the `.scrollbar-hide` convention, vertical infinite scroll via `nextCursor` (IntersectionObserver), and pull-to-refresh to invalidate `['recommendations']`. For slow/offline networks, React Query serves cached data first with `staleWhileRevalidate` behavior, mutations use **optimistic updates** (save/RSVP/like flip instantly then reconcile against the returned counts), skeletons cover `isLoading`, and a global online/offline listener queues the fire-and-forget `POST /api/interactions` batch and surfaces a "You're offline" toast rather than blocking interaction.

---

## 9. AI Feature Specification

Loop's AI is a fully backend-only surface (embeddings, LLM, and NL-parse keys never reach the browser) whose headline is a behavior-based recommender: a `user_preference_vectors` × `event_embeddings` pgvector engine that turns onboarding interests and the `interaction_events` signal stream into a personalized "For You" feed, wrapped by natural-language search, auto-tagging, AI descriptions, and a grounded chat assistant.

### 9.1 Feature Specifications

Loop's AI surface is five user-facing features plus one assistant, all sharing one backend rule: **every embedding, LLM, and NL-parse call runs server-side** (the hosted embeddings/LLM API keys never reach the browser), and **every call is audited in `ai_generation_logs`** (`type`, `model`, `prompt`, `output`, `tokens_used`, `latency_ms`). Two retrieval layers underpin the features: a **keyword/filter layer** — whose MVP form is Postgres FTS (`events.search_document` tsvector + `pg_trgm` fuzzy + B-tree filters on `category_id`/`city`/`starts_at`/`status` + geo on `(lat,lng)`) and whose documented production/scale-out form is Elasticsearch (same layer, swappable, **not** in the MVP) — and a **semantic layer** on pgvector (`event_embeddings` × `user_preference_vectors`, cosine kNN via HNSW/IVFFlat). The vector dimension is **pinned to `vector(384)`** (`all-MiniLM-L6-v2` via the HF Inference API, chosen over OpenAI `text-embedding-3-small` = 1536), tracked per row via `model`/`vector_version` so it can be re-pinned later.

---

#### 1. Onboarding Interest Selection — seeds a new user's feed

**What it does (user's view):** On sign-up I tap a few interest chips (Afrobeats, Networking, Pickup Soccer…) and my "For You" feed is immediately relevant instead of empty.

**Where it lives:** `Onboarding` screen, Step 1 — the `ChipGrid` component (24 interest chips with a live "Pick at least 3" count badge; Continue stays disabled/gray until ≥3 selected).

**Input:** On load, `GET /api/interests` returns the catalog (`interests.id`, `slug`, `label`, `category_id`, `icon`, `sort_order`). On submit, the client sends the selected `interests.id[]` — no free text, no model call. The interest→category mapping (`interests.category_id`) is what makes each pick usable for cold-start.

**Output:** `PUT /api/users/:id/interests` replaces the whole set transactionally, writing one `user_interests` row per pick with `source="onboarding"` and a seed `weight` (onboarding picks seed high, e.g. `0.90`, in the `numeric(5,4)` 0–1 range). Response:
```json
{ "data": [ { "interest": { "id":"…", "slug":"afrobeats", "label":"Afrobeats", "category_id":"…", "icon":"music" },
             "source": "onboarding", "weight": 0.9, "created_at": "2026-07-06T…Z" } ] }
```
Server-side effect (not user-visible): the seed picks are folded into a cold-start `user_preference_vectors` row (blended from the embeddings of the picked interests' `category_id`s and back-filled into `user_category_affinities.score`), so the very first `POST /api/recommendations` has signal despite `signal_count = 0`.

**Validation:** GOOD = ≥3 valid, active `interests.id`s spanning at least one real category, producing a usable seed vector. BAD = fewer than 3, or unknown/`is_active=false` ids (rejected `VALIDATION_ERROR`). **Metric:** post-onboarding activation — the first `POST /api/recommendations` returns `data.length > 0`, and within the first session the new user's `recommendation_impressions.clicked = true` rate (day-0 rec CTR) is non-trivial (target ≥ the logged-out featured-card CTR); a persistently empty or 0-CTR first feed flags a broken seed.

**Endpoint:** `GET /api/interests` (catalog) → `PUT /api/users/:id/interests` (seed); editable later via `POST`/`DELETE /api/users/:id/interests/:interestId`.

**Fallback:** If the seed-vector build fails or the user completes with a sparse set, the feed degrades gracefully — the recommender falls back to `user_category_affinities`/interest categories filtered by `home_city` and recency (popularity-sorted published events), so the user still sees a populated feed, never a blank state. If `GET /api/interests` itself fails, the `ChipGrid` shows a retry state and the "near me city" Step 2 still lets them finish onboarding.

---

#### 2. Behavior-Based Recommendation Engine (HEADLINE) — the For You feed

**What it does (user's view):** My "For You" feed shows events picked for me, each with a small violet chip explaining why ("Because you saved Afrobeats Night"), and it gets sharper every time I save, RSVP, attend, or follow.

**Where it lives:** `ForYouFeed` screen — the featured hero card + the `EventCard (showRationale)` grid, each card carrying an `AIChip` (violet Sparkles pill, `max-w-168px`, `text-overflow:ellipsis`, `flex-shrink-0` so it never overlaps the `AlmostFullBadge`).

**Input (server-side, `userId` from session):** the caller's `user_preference_vectors.embedding` (built from `user_interests` seeds + time-decayed `interaction_events` per `decay_half_life_days`), their `user_category_affinities` rollup (for cold-start blending and rationale), plus context filters (`home_city`/geo, `status='published'`, future `starts_at`, and any `context.tab`/`category`). Candidates come from the keyword/filter layer (city/date/status B-tree narrow), then pgvector kNN re-ranks candidate `event_embeddings` by cosine similarity to the user vector.

**Output:** `POST /api/recommendations` returns ranked items and writes one `recommendation_impressions` row per item (`feed_run_id`, `rank`, `score`, `rationale_text`, `rationale_signal`, `model_version`, `surface="for_you"`):
```json
{ "data": [ { "event": { /* EventCard */ },
             "score": 0.8123,
             "rationale": { "text": "Because you saved Afrobeats Night", "signal": "save" },
             "recommendationId": "…uuid…" } ],
  "feedRunId": "…uuid…", "nextCursor": "…" }
```
`rationale.text` is ≤168 chars (persisted to `rationale_text varchar(168)`), templated "Because you [saved|liked|follow]…" off the dominant `interaction_type`/top `user_category_affinities` row → `rationale_signal`. The full ranking, decay, and blend math lives in §9.2; this spec is the API contract.

**Validation:** GOOD = a diverse, in-city, future-dated ranked set whose rationale cites a signal the user actually produced; BAD = stale/past/wrong-city events, duplicate spam, or a rationale referencing an interaction that doesn't exist. **Metric:** rec **CTR from `recommendation_impressions.clicked`** and conversion via `recommendation_impressions.converted` (click/RSVP after impression), fed by the loop `POST /api/recommendations/:recommendationId/feedback` (`click`/`dismiss`/`convert`) which also emits `rec_click`/`rec_dismiss`/`rec_impression` into `interaction_events` with `feed_position` for position-bias correction. A feed run whose CTR drops below the popularity-baseline CTR is treated as a regression.

**Endpoint:** `POST /api/recommendations` (serve) + `POST /api/recommendations/:recommendationId/feedback` (loop); signals ingested via `POST /api/interactions`.

**Fallback:** If the vector store or kNN query fails, or `user_preference_vectors.signal_count` is too low to trust, the feed falls back to a **deterministic popularity + affinity ranking** (Postgres-only: published, in-`home_city`, future events ordered by `user_category_affinities.score` then `rsvp_count`/`save_count` and recency) with rationale suppressed to a neutral "Popular near you" chip. The user always sees a full, non-empty grid — never a spinner-forever or blank feed — and pull-to-refresh retries the personalized path.

---

#### 3. Natural-Language Search — "search how you talk"

**What it does (user's view):** I type "free Afrobeats party this weekend" and get matching events, with the constraints I said (free, this weekend, Afrobeats) shown as removable chips so I can see what it understood.

**Where it lives:** `ForYouFeed` sticky **search bar** (NL placeholder "Try 'free Afrobeats party this weekend'", mic + location icons; mic is UI-only this build) and the `Discover` screen search bar; parsed constraints render as removable pills in the `FilterBar`.

**Input:** `POST /api/search` with `{ q, near?:{lat,lng,radiusKm}|{city}, filters?, cursor?, limit? }`. Server-side: (a) an LLM/NL parser turns `q` into structured `parsed_filters` (category slugs, `dateFrom`/`dateTo`, `isFree`, `priceMax`, `city`, geo); (b) the hosted embeddings API embeds `q` into `search_queries.query_embedding vector(384)`; (c) the keyword/filter layer (`events.search_document` FTS + `pg_trgm` fuzzy + B-tree/geo filters) narrows a bounded candidate set honoring hard constraints; (d) pgvector re-ranks candidates by cosine similarity to `event_embeddings` (blended with the caller's `user_preference_vectors` when authed).

**Output:** matches the endpoint — parsed filters + results + the logged query id:
```json
{ "parsedFilters": { "category": ["music","nightlife"], "dateFrom":"2026-07-11", "dateTo":"2026-07-12",
                     "isFree": true, "city": "Oakland", "priceMax": null, "near": null },
  "data": [ { /* EventCard */ } ], "searchQueryId": "…uuid…", "nextCursor": "…" }
```
Server writes one `search_queries` row (`raw_query`, `parsed_filters` jsonb, `query_embedding`, `result_count`, `latency_ms`); the first result the user opens stamps `search_queries.clicked_event_id` (via a `search_result_click` interaction).

**Validation:** GOOD = `parsed_filters` faithfully captures stated constraints (never invents a city/date the user didn't say) and returns on-topic results; BAD = hallucinated filters, ignored hard constraints (returns paid events for a "free" query), or empty results for a satisfiable query. **Metric:** `search_queries.result_count > 0` for satisfiable queries, and a healthy **click-through** rate = share of queries with a non-null `search_queries.clicked_event_id`; a rising rate of `result_count = 0` or null `clicked_event_id` flags parser/recall regressions. `latency_ms` is monitored for the parse+embed+retrieve round-trip.

**Endpoint:** `POST /api/search` (public; anonymous `user_id` nullable).

**Fallback:** If the NL parser or query-embedding call fails, the request **degrades to pure keyword search**: `q` runs straight through the Postgres FTS/`pg_trgm` layer with any explicitly-passed `filters`, `parsedFilters` is returned as best-effort (or empty), and results still render. If even that yields zero rows, the user sees an empty-state ("No matches — try removing a filter") with the parsed pills still removable, plus popularity-ranked suggestions for their city, rather than a hard error.

---

#### 4. Auto-Categorization / Tagging

**What it does (user's view):** After I write (or AI-write) my event, a panel suggests hashtag pills like #Afrobeats #21+ #Rooftop; I keep the good ones and remove the rest with an ×.

**Where it lives:** `CreateEvent` screen — the **AI-tags panel**, triggered right after the "✨ Write with AI" description completes; each suggestion is a removable "×" pill.

**Input:** `POST /api/events/:id/autotag` with `{ title, description }` (the event's `events.title` + `events.description`, optionally alongside its `events.category_id` context). The backend LLM call classifies the text into normalized tag slugs + confidence and upserts them.

**Output:** matches the endpoint; suggestions are upserted into `event_tags` (`source="ai"`, `confidence numeric(5,4)`, idempotent on `UNIQUE(event_id, slug)`):
```json
{ "tags": [ { "slug": "afrobeats", "label": "#Afrobeats", "source": "ai", "confidence": 0.92 },
           { "slug": "21plus",    "label": "#21+",       "source": "ai", "confidence": 0.87 },
           { "slug": "rooftop",   "label": "#Rooftop",   "source": "ai", "confidence": 0.71 } ] }
```
Accepting/removing a pill is handled by `POST /api/events/:id/tags` / `DELETE /api/events/:id/tags/:tagId` (kept tags stay `source="ai"`; organizer-added ones become `source="organizer"`). Kept tags flow into keyword search via the `event_tags` AFTER-INSERT/UPDATE trigger that maintains `events.search_document`, and into `event_embeddings` on next embed.

**Validation:** GOOD = tags are on-topic, normalized (dedupe against existing slugs), and each carries a real 0–1 `confidence`; BAD = generic/hallucinated tags ("#event", "#fun"), off-topic, or malformed slugs. **Metric:** display/persist only tags with **`confidence ≥ 0.6`** (lower-confidence suggestions are dropped, not shown), and track the organizer **accept rate** (tags kept vs. removed via the × pill) as the usefulness signal — a persistently low keep rate flags a weak prompt/threshold.

**Endpoint:** `POST /api/events/:id/autotag` (Owner/organizer; logs `ai_generation_logs` type=`tags`).

**Fallback:** If the tagging call fails or returns nothing above threshold, the panel shows "No tag suggestions — add your own" and the organizer manually types pills via `POST /api/events/:id/tags` (`source="organizer"`). Publishing is never blocked on AI tags; an event can go live with zero AI tags.

---

#### 5. AI-Generated Event Descriptions/Captions

**What it does (user's view):** I tap "✨ Write with AI" and my description box fills with a polished draft I can edit before publishing.

**Where it lives:** `CreateEvent` screen — the **"✨ Write with AI" button** beside the description textarea (button shows a "Writing…" state during generation; drops the draft into the textarea).

**Input:** `POST /api/ai/generate-description` with `{ title, category, details?, tone?:"hype"|"professional"|"casual" }` — sourced from the in-progress `createEventForm` (mirrors `events.title`, resolved `categories.name`, and any structured `details` the organizer has entered: venue, date, price, age). Only fields the organizer supplied are sent; the backend LLM is instructed to use only those facts.

**Output:** matches the endpoint:
```json
{ "description": "Rooftop Afrobeats all night in Oakland — DJ sets, skyline views, 21+. Doors 9PM, $15 early bird." }
```
The client fills the textarea; on save, persisting the result sets `events.description_is_ai = true` (so it's distinguishable from hand-written copy). The call is logged to `ai_generation_logs` (type=`description`).

**Validation:** GOOD = fluent copy that uses **only** the supplied `title`/`category`/`details` (no invented date, price, lineup, or venue), fits the chosen `tone`, and lands in a sane length; BAD = hallucinated facts (a time or artist the organizer never entered), off-tone, or wrong length. **Metric:** a **length + no-hallucinated-facts check** — reject/regenerate drafts outside a ~40–600-char window, and verify every concrete claim (date/price/venue/age) echoes a value present in the request payload (no numbers/dates absent from `details`); usefulness is tracked as the share of AI drafts published with `description_is_ai=true` and minimal post-edit.

**Endpoint:** `POST /api/ai/generate-description` (Owner/organizer).

**Fallback:** On failure/timeout the button returns from "Writing…" to its idle state and a toast says "Couldn't draft that — try again or write your own"; the textarea is left untouched and editable, and the organizer can publish with a hand-written description (`description_is_ai` stays `false`). AI drafting is never required to create or publish an event.

---

#### 6. Conversational Planning Assistant

**What it does (user's view):** I tap the floating Sparkles button and ask "what's free and fun this weekend near me?"; Loop chats back and drops a few tappable event cards inline.

**Where it lives:** `AIAssistantDrawer` — the fixed **floating violet Sparkles trigger** (bottom-right) opening a right-side slide-in drawer (`w-320`, `z-40` backdrop closes it) that never obstructs the underlying screen (must not cover the `SportsPickupDetail` roster); chat messages with up to 3 inline `EventCard` mini-previews.

**Input:** `POST /api/ai/conversations/:id/messages` with `{ content }` (the user's turn; thread started via `POST /api/ai/conversations`). Server-side the assistant interprets intent, reuses the same NL-parse → keyword/filter → pgvector re-rank pipeline as search (grounded in the caller's `user_preference_vectors`, `home_city`/geo, and `status='published'` future events) to fetch real candidate `events`, and persists the turn to `ai_messages`.

**Output:** matches the endpoint — an assistant `ai_messages` row carrying `event_refs` (the inline result cards):
```json
{ "message": { "id":"…", "role":"assistant",
              "content":"Here are 3 free events this weekend near you:",
              "eventRefs": ["evt-uuid-1","evt-uuid-2","evt-uuid-3"], "createdAt":"…Z" },
  "eventRefs": ["evt-uuid-1","evt-uuid-2","evt-uuid-3"] }
```
`eventRefs` are real `events.id`s the drawer hydrates into `EventCard` mini-previews; bumps `ai_conversations.updated_at`; logs `ai_generation_logs` (type=`chat`).

**Validation:** GOOD = replies grounded in real, in-scope `events` (every `eventRefs` id is a published, future, filter-satisfying event) with a concise answer; BAD = invented events, ids that don't resolve, or event cards that violate stated constraints (paid events for a "free" ask). **Metric:** grounding rate — 100% of returned `eventRefs` must resolve to real published `events` (any unresolved id is dropped before render) — plus engagement: click-through on the inline cards (logged as `interaction_events` on `surface="assistant"`), a low rate flagging unhelpful answers.

**Endpoint:** `POST /api/ai/conversations` (start) → `POST /api/ai/conversations/:id/messages` (turn); history via `GET /api/ai/conversations/:id`.

**Fallback:** On failure the drawer shows an inline error bubble ("I couldn't reach that right now — try again") and keeps the optimistic user message; if the model returns prose but no groundable events, it renders the text with a "Browse Discover" link (navigating to the `Discover` screen, which runs `POST /api/search`) instead of fabricated cards. The drawer is purely additive — closing it returns the user to a fully functional screen.

---

### 9.2 Behavioral Recommendation Algorithm (deep-dive)

> This is the engine behind `POST /api/recommendations` (§7.6). It turns the raw signal stream in `interaction_events` (§6.4) plus onboarding `user_interests` (§6.2) into one `user_preference_vectors.embedding` (§6.5), matches it against `event_embeddings.embedding` (§6.5) with pgvector, and re-ranks the result into the "For You" feed, writing every served item to `recommendation_impressions` (§6.5). All embedding/AI calls run on the backend only (API-key safety); the browser only ships fire-and-forget signals to `POST /api/interactions`.

#### (A) Signals we vectorize and their weights

**`interaction_events` is the single replay source for the vector build** (it's the only stream carrying `feed_position`/`surface` for position-bias, and it's append-only so history is preserved). The explicit tables (`rsvps`, `saved_events`, `follows`, `roster_entries`, `search_queries`) are the **current-state** source of truth for the app, but the builder does **not** also read them — that would double-count. To keep the two in sync, every engagement mutation emits its `interaction_events` row (§7 endpoints already do this for `save`/`rsvp`/`claim_spot`/`share`/etc., and — see the reversal fix below — for `unfollow` too). Each signal contributes a **base weight** `w`; the builder multiplies it by the time-decay factor (below), the position-bias factor, and (for engagement signals) the target event's `event_embeddings.embedding`.

The base weights `w` are the builder's canonical per-type weights, written into `interaction_events.weight` at ingest. **Every `interaction_type` the builder folds in has an explicit weight in the table below; any type not listed (e.g. a bare `click`, `impression`, `comment`) is written with `weight = 0` and excluded from the vector** — so an unclassified signal can never silently fold in at the `1.0` column default and outrank a real `save` or `rsvp`.

**Reversal handling (fix):** because the log is append-only, a negative signal can't simply be summed against its positive (a `+0.60 save` then `−0.30 unsave` would net *+0.30*, still pulling toward the event). Instead the builder treats a reversal as a **supersede**: when a user has a later `unsave`/`rsvp_cancel`/`release_spot`/`unfollow`/`rec_dismiss` for the same target, it **drops the earlier matching positive row entirely** (net contribution 0) rather than adding a smaller negative — and a `rec_dismiss` with no prior positive contributes its negative weight to push the vector away. This makes "reverses a prior save/going/claim/follow" true as written.

| Signal | `interaction_type` / source table | Base weight `w` | Notes |
|---|---|---|---|
| Attended | `attend` / `rsvps.attended=true` **or** `roster_entries.status='attended'` | **+1.00** | Strongest possible signal — the user physically showed up. Both attendance paths emit an `attend` row, so the builder reads one stream. |
| RSVP'd "going" | `rsvp` / `rsvps.status='going'` | **+0.80** | Hard commitment. `interested`/`waitlisted` count at **+0.55**. |
| Claimed a sports spot | `claim_spot` / `roster_entries.status='claimed'` | **+0.75** | The sports-run equivalent of an RSVP. |
| Saved / bookmarked | `save` / `saved_events` | **+0.60** | Clean standalone intent signal. |
| Followed an organizer | `follow` (emitted by `POST /users/:id/follow`) | **+0.50** | Applied via the followee's authored `event_embeddings` centroid (see C), not a single event. Emitted to `interaction_events` (with `target_user_id`) so both follow and its `unfollow` reversal are replayable. |
| Search-result click | `search_result_click` / `search_queries.clicked_event_id` | **+0.40** | Explicit "this matched what I typed." The query itself (`search`, `ai_query`) contributes via `search_queries.query_embedding` at **+0.35**. |
| Shared | `share` | **+0.45** | Advocacy ≈ strong save. |
| Category click | `category_click` (carries `category_id`) | **+0.30** | Feeds `user_category_affinities` primarily; small vector nudge via the category centroid. |
| Tag click | `tag_click` (carries `tag`) | **+0.25** | Nudge toward events sharing that `event_tags.slug`. |
| Post like | `post_like` | **+0.20** | Applied via the linked `posts.event_id` embedding when present. |
| Rec / card click | `rec_click`, `click` | **+0.18** | Explicitly weighted so a bare click never defaults to the `1.0` column value. A click is a weaker positive than a save; `rec_click` also updates `recommendation_impressions.clicked`. |
| Detail view | `view` | **+0.15** | Weak positive; scaled by `dwell_ms` (below). |
| Dwell | `dwell` (has `dwell_ms`) | **+0.10** base | Multiplied by a dwell factor `min(1, dwell_ms / 15000)` so a 15 s+ read = full weight, a 1 s bounce ≈ 0.07. |
| Impression only | `impression`, `rec_impression` | **0.00** | Not folded into the vector; used only as the denominator for CTR-style normalization in `user_category_affinities.impression_count`. |
| **Dismissed a rec** | `rec_dismiss` | **−0.40** | Negative: pushes the vector *away* from that event's embedding (contributes even with no prior positive). |
| **Unsaved** | `unsave` (emitted by `DELETE /save`) | **−0.30** | Supersedes the prior `save` (drops it to net 0), per the reversal rule above. |
| **Cancelled RSVP** | `rsvp_cancel` (emitted by `DELETE /rsvp`) | **−0.35** | Supersedes the prior `rsvp going`. |
| **Unfollowed** | `unfollow` (emitted by `DELETE /users/:id/follow`) | **−0.25** | Supersedes the prior `follow`. The `DELETE /follow` handler **writes an `unfollow` `interaction_events` row** before removing the `follows` row (else the reversal would leave no trace). |
| **Released spot** | `release_spot` (emitted by `DELETE /roster`) | **−0.30** | Supersedes the prior `claim_spot`. |

**Position-bias correction.** For feed-surface signals we divide the effective weight by a log of rank: `w_eff = w / (1 + ln(1 + feed_position))`, so a click on rank 20 counts more than a click on rank 1 (which the user saw first regardless of taste). `feed_position` and `surface` come straight off `interaction_events`.

**Time decay.** Every signal is aged by an exponential kernel keyed on `interaction_events.created_at`:

```
decay_i = exp( -Δt_i / H ),  Δt_i = (now - created_at_i) in days,
H = user_preference_vectors.decay_half_life_days   (default 30)
```

At the 30-day half-life, a signal is worth ~0.71 after 10 days, 0.50 at 30 days, 0.25 at 60 days. Stale taste ages out automatically without a delete job. `H` is stored per user so we can lengthen it for low-activity users (fewer signals → slower decay) later.

#### (B) Event embedding

Each published event gets exactly one row in `event_embeddings` (PK/FK `event_id`, 1:1 per active model).

1. **Compose the text** on the backend from own-row + joined fields (order matters for the model; keep it deterministic):
   `title` · `category.name` · top `event_tags.label` (source-agnostic, ordered by `confidence` desc, cap 8) · `venue_name` · `city` · a truncated `description` (~500 chars). Sports events append `sports_details.sport` + `skill_level`.
2. **Hash it.** `content_hash = sha256(composed_text || model)`. If the new hash equals the stored `event_embeddings.content_hash`, **skip the embedding call** — this is the cost guard for re-syncs and re-publishes.
3. **Embed** via the embeddings provider (backend only — **`all-MiniLM-L6-v2` served by the Hugging Face Inference API**, self-hostable on Fly/Railway later). Write `embedding` (`vector(384)`), set `model`, `content_hash`, bump `vector_version`, stamp `updated_at`. Log the call in `ai_generation_logs` (`type='event_embedding'`, `tokens_used`, `latency_ms`).
4. **When:**
   - On `POST /api/events/:id/publish` (draft→published) — the publish handler enqueues the embed (§7.3 already says publish "enqueues `event_embedding`").
   - On external sync (`POST /api/admin/sync/ticketmaster` / `/seatgeek`) — after upsert on `UNIQUE(source, external_id)`; the `content_hash` skip means only rows whose title/description/price actually changed are re-embedded.
   - On `PATCH /api/events/:id` if a composed field changed (hash miss).
   - **On tag mutation** — `POST /api/events/:id/tags` and `DELETE /api/events/:id/tags/:tagId` change the composed text (tags are part of it), so both handlers enqueue a hash-guarded re-embed; otherwise accepting/removing an AI tag would leave the stored embedding out of sync with its own `content_hash`.
   - **Batch/backfill** via `POST /api/ai/embeddings/rebuild` (`target:"events"`, optional `eventIds[]`, `force`) — re-embeds on `content_hash` change or `force`, bumps `vector_version`.
5. **Index:** HNSW on `embedding` with `vector_cosine_ops` (IVFFlat fallback), so nearest-neighbour retrieval is sub-linear.

#### (C) Per-user preference vector

`user_preference_vectors` holds one row per user. `embedding` is the **time-decayed, signal-weighted, position-corrected weighted average** of the `event_embeddings` of the events the user engaged with, blended with an onboarding **seed vector** for cold start.

**Behavior term** (over all positive+negative engagement signals `i` with a resolvable event embedding `e_i`):

```
        Σ_i ( w_i · w_eff_i · decay_i · e_i )
u_behavior = ─────────────────────────────────────      (then L2-normalize)
        Σ_i | w_i · w_eff_i · decay_i |
```

- `e_i` = the target event's `event_embeddings.embedding`.
- Negative signals (`rec_dismiss`, `unsave`, `rsvp_cancel`, `unfollow`, `release_spot`) enter with negative `w_i`, subtracting their event's direction. The denominator uses the absolute value so magnitudes don't cancel incorrectly.
- **Follow signals** have no single event, so `e_i` = the L2-normalized centroid of that organizer's last N (≤20) published `event_embeddings`. `category_click`/`tag_click` likewise use a category/tag centroid (avg of that category's recent event embeddings).

**Seed term** (onboarding taste, from `user_interests`):

```
u_seed = normalize( Σ_k user_interests.weight_k · centroid( category_of(interest_k) ) )
```

where `centroid(category)` is the mean `event_embeddings.embedding` of published events in that `categories.id` (precomputed and cached per category; refreshed nightly). `interests.category_id` maps each pick to its category; `user_interests.weight` (onboarding picks seed high, e.g. `0.90`) weights it.

**Blend** (drives cold-start → behavior handoff, using `signal_count`):

```
α = min(1, user_preference_vectors.signal_count / 20)
u = normalize( α · u_behavior + (1 − α) · u_seed )
```

At 0 signals `u = u_seed` (100% onboarding); at ≥20 folded signals `u = u_behavior` (100% behavior); linear in between.

**Bookkeeping written on each build:** `embedding` = `u`; `signal_count` = number of signals folded in; `last_built_from` = MAX(`created_at`) of the signals included (the watermark); `last_computed_at = now()`; `model`, `vector_version`, `decay_half_life_days`.

**Update over time / drift handling:**
- **Incremental, watermark-driven recompute.** A scheduled job (every ~15 min, and nightly full pass) selects users with new `interaction_events.created_at > last_built_from` and rebuilds their vector, re-reading the decayed history. Because decay is recomputed relative to `now()` on each build, old taste continuously loses weight — the vector *drifts* toward recent behavior without an explicit forgetting step.
- **Event-triggered recompute after high-value signals.** On `attend`, `rsvp` (going), or `save`, the mutation handler enqueues that user into `POST /api/ai/embeddings/rebuild` (`target:"users"`, `userIds:[me]`) so a strong new preference shows up in the very next feed pull rather than waiting for the schedule. This is why §8's invalidation rules invalidate `['recommendations']` after RSVP/save/follow/interest edits.
- **Interest edits** (`PUT /api/users/:id/interests`) rebuild `u_seed` and re-blend, so re-curating interests immediately re-shapes the feed (heavier when `signal_count` is still low).
- **Model migration:** `vector_version` + `model` record which build produced each vector, so a model change re-embeds all events + rebuilds all user vectors as one versioned batch (query/event/user vectors must share a model to be comparable). Tables hold one active vector per row (§6.5), so this is a forward migration, not a live A/B or in-place rollback — true A/B would need the `(id, model)` PK noted in §6.5 and is out of MVP scope.

`user_category_affinities` (a cheap parallel rollup: time-decayed `score`, `positive_signals`, `impression_count`, `last_signal_at` per `(user_id, category_id)`) is maintained by the same job — it is the fast, human-readable source for the re-rank category boost and the "Because you like X" rationale, and it survives even when the dense vector is mid-rebuild.

#### (D) Retrieval pipeline: PRE-FILTER → RANK → RE-RANK

Executed inside `POST /api/recommendations`. The whole DB is **never** sent to a model — SQL narrows first.

**Step 1 — PRE-FILTER (cheap SQL, produces a bounded candidate set of ~200–400).** Uses the B-tree/geo indexes on `events`:
```
WHERE status = 'published'
  AND starts_at BETWEEN now() AND now() + interval '30 days'      -- future window
  AND (category_id = ANY(:categoryIds) OR :categoryIds IS NULL)   -- from context.category
  AND earth_distance(lat,lng, :homeLat,:homeLng) <= :radiusKm      -- near-me, from users.home_lat/lng + location_radius_km
  AND id NOT IN (SELECT event_id FROM rsvps      WHERE user_id=:me AND status='going')   -- already going
  AND id NOT IN (SELECT event_id FROM saved_events WHERE user_id=:me)                     -- already saved (optional exclude)
  AND id NOT IN (SELECT event_id FROM recommendation_impressions
                 WHERE user_id=:me AND shown_at > now()-interval '3 days')               -- recently shown/dismissed churn guard
LIMIT 400
```
`context.category` from the request body constrains `:categoryIds`; `near`/radius comes from the caller or `users.home_lat/home_lng` + `location_radius_km`. **Note:** price / `is_free` / age are *search-and-Discover* filters (`GET /api/events`, `POST /api/search`, where `ageMax`/`priceMax`/`isFree` are real request inputs) — they are deliberately **not** For-You pre-filter predicates, because `users` has no age column and `POST /api/recommendations`'s `context` carries only `tab`/`category`. The recommender ranks across all price/age bands and lets the re-rank + the user's own vector express those preferences.

**Step 2 — RANK (pgvector cosine kNN over the candidate set).** Order candidates by cosine distance between the user vector and each candidate's `event_embeddings.embedding`:
```
SELECT e.id, (ee.embedding <=> :u) AS cos_dist
FROM candidates e
JOIN event_embeddings ee ON ee.event_id = e.id
ORDER BY ee.embedding <=> :u          -- <=> = cosine distance under vector_cosine_ops (HNSW)
LIMIT :K                               -- K = 80
```
`cos_sim = 1 − cos_dist`. Passing the pre-filtered id set keeps the ANN scan bounded and fresh.

**Step 3 — RE-RANK (blend semantic score with business signals + diversity).** For each of the K candidates compute:
```
recency    = exp( -(starts_at - now) days / 14 )        -- soon-ish events float up
affinity   = user_category_affinities.score for e.category_id, min-max normalized to [0,1]
popularity = log1p(rsvp_count + coalesce(players_signed_up,0) + 2*save_count) / log1p(maxInWindow)
             -- sports runs fill via roster_entries/sports_details.players_signed_up, NOT rsvps (§6 counter note),
             -- so include players_signed_up or pickup runs are systematically under-ranked
freshness  = 1 if no prior recommendation_impressions for (me,e) else 0.5   -- novelty
ε          = Bernoulli(0.10) exploration flag

score = 0.55*cos_sim
      + 0.15*affinity
      + 0.12*recency
      + 0.10*popularity
      + 0.08*freshness
      + ε * 0.15            -- exploration bump on a random 10% to avoid filter bubbles
```
Then apply **MMR diversity** to the sorted list to prevent one-category floods:
```
mmr = λ*score − (1−λ)*max_sim_to_already_selected     (λ = 0.7, sim via event embeddings)
```
greedily pick the next item maximizing `mmr`; additionally cap **≤3 consecutive** and **≤40%** of the page from any single `categories.id`.

**Step 4 — Persist + rationale.** For each item in the final ranked page, insert a `recommendation_impressions` row: `feed_run_id` (one uuid per build), `rank`, `score`, `model_version`, `surface='for_you'`, `shown_at=now()`, `clicked=false`, `converted=false`, and:
- `rationale_signal` = the `interaction_type` of the single highest `w_i·decay_i` signal that pulled this event in (or the dominant `user_category_affinities` category for seed-driven picks).
- `rationale_text` (≤168 chars, matches `varchar(168)`) generated by template from that signal, e.g. `"Because you saved Afrobeats Night"`, `"Because you follow Tunde"`, `"Popular with people who like Nightlife near you"`, `"New this weekend in Networking"`.

The response returns `data[]{ event:EventCard, score, rationale{text,signal}, recommendationId }`, `feedRunId`, and `nextCursor`. Clicks/dismisses/conversions come back through `POST /api/recommendations/:recommendationId/feedback`, which updates `recommendation_impressions.clicked/clicked_at/converted` and emits a matching `interaction_events` row (`rec_click`/`rec_dismiss`/`rec_impression` with `recommendation_id` + `feed_position`) — closing the loop that feeds the next vector rebuild.

#### (E) Cold-start

A brand-new user has zero rows in `interaction_events`, so `user_preference_vectors.signal_count = 0` and `α = 0` → the vector is **100% `u_seed`**, built purely from onboarding `user_interests` (interest→category centroids weighted by `user_interests.weight`). The build happens the moment onboarding submits `PUT /api/users/:id/interests`.

- **Feed for a 0-signal user:** the same PRE-FILTER → RANK → RE-RANK pipeline runs, but RANK matches against `u_seed`, and the RE-RANK leans harder on `popularity` and `recency` when `signal_count < 5` — we shift `0.13` of the weight **out of** `cos_sim` and into recency/popularity so the coefficients still sum to `1.0` (`cos_sim 0.55→0.42`, `recency 0.12→0.15`, `popularity 0.10→0.20`) — so the user sees the best, most relevant *nearby popular* events in their chosen categories rather than a flat cosine list. Rationale text falls back to `"Popular in {category} near you"` / `"Matches your interest in {interest.label}"`.
- **Blend handoff:** as signals accrue, `α = min(1, signal_count/20)` linearly shifts the vector from seed toward behavior (formula in C). By ~20 meaningful signals the feed is fully behavior-driven.
- **No-location fallback:** if the user has no `home_lat/home_lng` and geolocation is denied, drop the radius predicate and filter by `home_city` (string match on `events.city`); if that too is empty, widen to a national popular-events pool and rely on category filters + `popularity`/`recency`.
- **Empty-candidate fallback:** if PRE-FILTER returns fewer than ~10 candidates (sparse market / tight radius), progressively relax — first double `radiusKm`, then widen the `starts_at` window to 60 days, then drop category constraints — and finally serve a category-filtered "popular near you" list ranked by `popularity + recency` with no vector step, tagged with a generic rationale. The feed is never empty for an onboarded user.
- **Zero-interest edge case** (user skipped interest picks): seed from the platform-wide popular centroid of their `home_city`; the first few `view`/`save`/`click` signals rapidly personalize via the event-triggered rebuild in (C).

---

### 9.3 Search Architecture (two layers)

Loop's search is one pipeline built from two cleanly separated layers that never bleed into each other's job. **Layer 1** is a fast, deterministic keyword/filter engine that answers "which published events are even *eligible*" — it applies the hard, structured constraints (category, city/radius, date, price, age, free) and does exact/fuzzy keyword matching. **Layer 2** is a semantic/natural-language layer that answers "which of those eligible events *best match what the user meant*" — it parses free text into filters, embeds the query, and re-ranks Layer 1's candidate set by meaning (optionally personalized). The rule that keeps them honest: **Layer 1 decides membership (hard constraints, never violated); Layer 2 only decides order within that membership.**

| | **Layer 1 — Keyword / filter** | **Layer 2 — Semantic / NL** |
|---|---|---|
| Job | Narrow to an eligible candidate set (hard constraints + literal matches) | Re-rank that set by meaning; parse NL into those constraints |
| Determinism | Deterministic, always fresh, cheap | Approximate (embeddings + ANN), meaning-aware |
| Entry points (§7) | `GET /api/events` (Discover search bar + filter pills) | `POST /api/search` (NL "search how you talk") |
| MVP engine | **Postgres FTS**: `events.search_document` tsvector (GIN) + `pg_trgm` fuzzy title + B-tree filters + geo | **pgvector**: `event_embeddings.embedding` cosine, `search_queries.query_embedding`, LLM NL parser |
| Scale-out form | **Elasticsearch/OpenSearch** (same layer, same contract — swappable) | Unchanged (still pgvector) |
| AI/API keys | None (pure SQL) | LLM parse + embeddings API — **backend only, never the browser** |

#### Layer 1 — Keyword / filter search (fast, structured, deterministic)

Layer 1 powers the Discover search bar and the filter pills directly through `GET /api/events` (§7.3), and it is also the first stage inside `POST /api/search`. Its **MVP implementation is Postgres FTS**, exactly as declared in §6 ("Search: Elasticsearch vs pgvector"):

- **Keyword match** against the generated `events.search_document` tsvector (GIN index) covering title + description + venue_name, matched with `to_tsquery`/`plainto_tsquery` and scored with `ts_rank_cd`.
- **Fuzzy title** via `pg_trgm` similarity on `events.title`, so "afrobeats" still hits "Afrobeats Night" (typos/partial words the tsvector misses).
- **Structured filters** as B-tree lookups on the indexed columns from §6: `category_id` (via `categories.slug`), `city`, `starts_at` (date range), `status` (always pinned to `published`), plus `price_min`/`price_max`, `is_free`, and `age_min` (matches `age_min ≤ ageMax OR NULL`). These map one-to-one to the `GET /api/events` facets: `category[]`, `city`, `dateFrom`/`dateTo`, `priceMin`/`priceMax`, `isFree`, `ageMax`, `source[]`, `isSports`.
- **Geo radius** on `events.(lat, lng)` using the geo index (`nearLat`/`nearLng`/`radiusKm`), with a bounding-box prefilter then a Haversine/`earthdistance` (or PostGIS) distance for `distance_km` and the `sort:"distance"` option.

This is deterministic, always fresh, adds no second datastore for a 3-person capstone, and requires no AI key. The **production/scale-out form of this same layer is Elasticsearch/OpenSearch** — if keyword relevance, typo-tolerance, faceting, or synced-catalog volume outgrows Postgres FTS, published events are mirrored into an ES index that takes over the keyword+filter path behind the identical request/response contract. **ES is explicitly a documented future swap, not part of the MVP;** Layer 2 (pgvector) is untouched by that swap.

> **`GET /api/events` "personalized ranking when authed" (§7.3) is a Layer-1 concern, not Layer 2.** When an authed user hits `GET /api/events` with `sort=relevance`, the personalization is a **SQL-only tie-break** that borrows `user_category_affinities.score` (a cheap rollup, no vector step, no AI key) to nudge their preferred categories up — it deliberately does **not** invoke pgvector or the embeddings API. Full semantic/behavioral matching lives in `POST /api/search` (Layer 2) and `POST /api/recommendations`. This keeps `GET /api/events` fast, deterministic, and key-free while still feeling personal.

#### Layer 2 — Semantic / natural-language layer ("search how you talk")

Layer 2 is `POST /api/search`. It lets a user type "free Afrobeats party this weekend" instead of clicking pills, and it runs three backend stages in order:

1. **NL parse → `parsed_filters`.** A backend LLM call turns the raw text into structured filters, returning the §7 `parsedFilters` shape `{ category:string[], dateFrom, dateTo, isFree, city, priceMax?, near? }`, which is persisted to `search_queries.parsed_filters` (jsonb) and audited in `ai_generation_logs` (type=`search_parse`). For the example: `isFree:true`, `dateFrom`/`dateTo` = the coming weekend resolved against the request timezone, and `category` mapped to `categories.slug` values like `nightlife`/`music`. Note the deliberate split — the parser only extracts the **coarse, enforceable** constraints; the fine nuance ("*Afrobeats* specifically," "*party* vibe") is left for the embedding in stage 3, because it isn't a column.
2. **Embed the query → `query_embedding`.** The raw query (plus resolved parsed terms) is sent to the embeddings provider (`all-MiniLM-L6-v2` via the HF Inference API) and stored in `search_queries.query_embedding` (`vector(384)`, DIM pinned — **the same model that embeds events**, or the vectors aren't comparable).
3. **pgvector re-rank.** The query embedding is scored by cosine (`vector_cosine_ops`, HNSW/IVFFlat) against `event_embeddings.embedding` over the Layer-1 candidate set. **When the caller is authenticated, the score blends in cosine to their `user_preference_vectors.embedding`** so semantic search is personalized (a networking-leaning user's "mixer this weekend" surfaces events tilted to their taste); anonymous callers get pure query-to-event semantics.

All three stages happen server-side inside the endpoint; no API key ever reaches the browser (hard constraint).

#### Query flow and merge (ordered)

For `POST /api/search`:

1. **NL query in** (`{ q, near?, filters?, cursor, limit }`) → **parse** `q` into `parsed_filters` (stage 1). Any explicit `filters`/`near` in the request are merged with, and override, the parsed values (an explicit pill always beats an inferred one).
2. **Layer 1 produces the bounded candidate set.** Postgres FTS + filters + geo apply `parsed_filters` as **hard constraints** and restrict to `status='published'`. This returns a bounded set (e.g. top few hundred candidates by keyword rank / recency) — never the whole DB — carrying each row's keyword rank (`ts_rank_cd`) and title `pg_trgm` similarity.
3. **Layer 2 re-ranks that set by meaning** (stages 2–3): cosine(query, event) blended with cosine(user_vector, event) when authed.
4. **Merge into a single score and return.** Final order is a blend, `score = w_kw·norm(keyword_rank) + w_sem·cosine(query,event) [+ w_pers·cosine(user_vec,event)]`. **MVP defaults:** authed `w_kw=0.40, w_sem=0.50, w_pers=0.10`; anonymous `w_kw=0.45, w_sem=0.55` (no personalization term). On top of that, a fixed **additive `+0.30` exact/prefix-title-match boost** so a literal title match (someone typing the event's actual name) floats to the top regardless of semantic distance — keyword exact matches always win over merely "semantically close" ones. These weights are tuned later from `search_queries` logs (below). The response is `{ parsedFilters, data:[EventCard], searchQueryId, nextCursor }`; `parsedFilters` feeds the removable chip bar (§8 `parsedFilters` state) so the user sees and can drop any inferred constraint.

Two invariants make this predictable: **structured filters are hard constraints and are never violated** — semantics can only reorder events that already passed Layer 1, so a "free" search never surfaces a paid event just because it's semantically similar; and **the candidate set is always bounded by Layer 1 first**, so the embedding step re-ranks a few hundred rows, not the catalog.

#### Contrast with the "For You" feed

Semantic search and the headline recommender share the pgvector machinery but start from opposite ends. `POST /api/search` starts from **a query**: text → `parsed_filters` → keyword candidates → re-rank. `POST /api/recommendations` (§7.6) starts from **the user, with no query**: it does kNN of `user_preference_vectors` against `event_embeddings` (blended with `user_category_affinities` for cold-start) and writes `recommendation_impressions`. Search answers "find me *this*"; For You answers "surprise me with what fits my taste." Search only borrows the user vector as a *tie-breaking personalization signal* layered on top of an explicit query, whereas For You is *driven* by that vector.

#### Logging and relevance tuning

Every `POST /api/search` writes one `search_queries` row: `raw_query`, `parsed_filters`, `query_embedding`, `result_count`, and `latency_ms`; the first result the user opens stamps `clicked_event_id` (a `search_result_click` in `interaction_events` referencing `search_query_id`, posted via `POST /api/interactions`). The query itself also emits a `search` (and `ai_query`) interaction. Together these give the relevance-tuning loop what it needs — zero-result rates (`result_count = 0`), parse quality, click-through per query, and per-stage latency — to tune the `w_kw`/`w_sem`/`w_pers` blend weights and the parser prompt over time.

#### Fallback when the parser fails

The NL parser is treated as best-effort, never a hard dependency. If stage 1 fails, times out, is rate-limited (`RATE_LIMITED`), or returns unparseable/empty JSON, `POST /api/search` **degrades to a plain keyword search**: the raw `q` is run straight through Layer 1 (Postgres FTS on `search_document` + `pg_trgm` title fuzzy, honoring only any explicit `filters`/`near` the client already sent), `parsed_filters` is stored as `{}` (or just the explicit filters), and the failure is recorded in `ai_generation_logs`. Likewise, if the embeddings call (stage 2) fails, results fall back to Layer 1's keyword rank order with no semantic re-rank. In every degraded path the endpoint still returns valid `{ parsedFilters, data, searchQueryId, nextCursor }`, so the search bar always returns results and never hard-errors on an AI outage.

---

### 9.4 AI Feature Decisions Log

| Decision | Sprint | What changed | Why |
|---|---|---|---|
| Move all AI/embeddings/LLM calls to the BACKEND (never the browser) | Sprint 1 | Every embed, LLM parse, description/tag/chat call runs server-side and is audited in `ai_generation_logs`; the client only posts signals to `POST /api/interactions` | API-key safety — a hosted embeddings/LLM key in browser JS would be world-readable and abusable |
| Blend an onboarding seed vector with behavior via `α = min(1, signal_count/20)` | Sprint 2 | Cold-start `user_preference_vectors` is 100% `u_seed` at 0 signals and hands off linearly to `u_behavior` by ~20 folded signals | A brand-new user has zero `interaction_events`; interest→category centroids give the very first `POST /api/recommendations` real signal instead of a blank feed |
| Pre-filter in SQL before any vector/model step (PRE-FILTER → RANK → RE-RANK) | Sprint 2 | `POST /api/recommendations` and Layer 1 of `POST /api/search` narrow to a bounded ~200–400 candidate set via B-tree/geo indexes before pgvector kNN | Never send the whole catalog to ANN/the model; keeps the vector scan bounded, fresh, and cheap |
| Treat structured/parsed filters as hard constraints; semantics only reorders | Sprint 2 | In `POST /api/search`, Layer 1 decides membership and Layer 2 (embeddings) can only re-rank within it; explicit pills override inferred `parsed_filters` | A "free" search must never surface a paid event just because it's semantically close — predictability over cleverness |
| Skip re-embedding when `content_hash` is unchanged | Sprint 3 | `event_embeddings.content_hash = sha256(composed_text‖model)`; on re-publish/external sync/`PATCH` a matching hash short-circuits the embeddings API call | Cost/rate guard — Ticketmaster/SeatGeek re-syncs and idempotent re-publishes shouldn't burn embedding tokens on unchanged rows |
| 30-day exponential decay half-life on behavior signals | Sprint 3 | Signals aged by `exp(-Δt/H)`, `H = decay_half_life_days` (default 30) stored per user; recomputed relative to `now()` each build | Taste drifts toward recent behavior and stale signals age out automatically — no explicit forgetting/delete job |
| Only persist/display AI tags with `confidence ≥ 0.6` | Sprint 3 | `POST /api/events/:id/autotag` drops suggestions below the threshold before they reach the panel or `event_tags` | Filters generic/low-signal tags ("#event", "#fun") so the suggestion panel stays trustworthy; organizer accept rate is the tuning metric |
| Add a fallback to static/popular (nearby) events when `POST /api/recommendations` fails or returns too few | Sprint 2/3 | On vector/kNN failure or low `signal_count`, serve a deterministic popularity + `user_category_affinities` ranking (published, in-`home_city`, future) with a neutral "Popular near you" chip; PRE-FILTER progressively relaxes radius/window/category if candidates < ~10 | The user always sees a full feed — never a spinner-forever or blank state — on an AI/vector outage or in a sparse market |
| Position-bias correction + MMR diversity on the re-rank | Sprint 4 | Feed-surface signal weights divided by `1+ln(1+feed_position)`; final page runs MMR (`λ=0.7`) with ≤3-consecutive / ≤40%-per-category caps | Stop rank-1 clicks from dominating learned taste and prevent single-category floods / filter bubbles in the feed |
| Verify AI descriptions against supplied facts (length + no-hallucination check) | Sprint 4 | `POST /api/ai/generate-description` rejects/regenerates drafts outside ~40–600 chars or citing a date/price/venue/age absent from the request `details` | LLM copy must not invent times, prices, or lineups the organizer never entered; publishing is never blocked on AI |

---

## GitHub Work Plan (Issues, Milestones, Project Board)

Loop ships on a **4-sprint cadence, one calendar week per sprint**, with a **working, demoable MVP by the end of Sprint 2** (a real user can sign up, pick interests, browse a populated feed, filter/search, open an event, and save/RSVP — over live seed data). Sprints 3–4 layer the headline AI, the sports roster, follows/social, supporting AI, responsive polish, deploy, and any stretch we have room for.

Before writing code, set up the delivery scaffolding in GitHub:
- **Project board** (GitHub Projects) with five columns: **Backlog → Sprint → In Progress → Review → Done**. Every issue starts in Backlog and is pulled into Sprint at planning.
- **Milestones** — one per sprint (below); every issue is assigned to exactly one milestone.
- **Issues** — the starter set below seeds the board; each carries a `Type` label (`MVP` / `nice-to-have` / `stretch`), an area label (`backend` / `frontend` / `ai` / `infra`), and links the §/entity/endpoint/component it implements. `#` are numbered in dependency order, so the board reads top-to-bottom as the build order.

### Milestones

| Milestone | Week | One-line goal |
|---|---|---|
| **Sprint 1 — Foundation** | Week 1 | Repo + CI, Prisma schema/migrations (pgvector/citext), auth, onboarding, lookup + demo-event seed, external-sync stub. |
| **Sprint 2 — Core loop (MVP)** | Week 2 | Working MVP: event CRUD + publish, `GET /events` list/filter feed, EventCard grid, save/RSVP, basic For-You. |
| **Sprint 3 — AI + discovery depth** | Week 3 | Embeddings + preference vectors, real recommendation engine, NL search, auto-tag, AI description, sports roster, follows. |
| **Sprint 4 — Social, polish, deploy** | Week 4 | Notifications/reminders, social feed, comments, AI assistant, organizer analytics, feedback, responsive polish, deploy + selected stretch. |

### Starter Issues

| # | Issue title | References (§ of project_plan.md — schema entity / endpoint / component) | Sprint | Type |
|---|---|---|---|---|
| 1 | Repo, CI pipeline, and app scaffold (lint/test/build via GitHub Actions) | infra; stack §top-of-plan (React 18 + Tailwind v4, Postgres + Prisma) | 1 | MVP |
| 2 | Prisma schema + migrations for full §6 data model; enable `pgvector`/`citext`/`pg_trgm` extensions, `vector(384)` (DIM pinned) | §6 (all tables + enum types); §6 "Search: Elasticsearch vs pgvector" | 1 | MVP |
| 3 | Seed lookup data: 6 `categories` (Figma color tokens) + 24 `interests` | §6 `categories`, `interests`; `GET /api/categories`, `GET /api/interests`; CatRow, ChipGrid | 1 | MVP |
| 4 | **Seed 40–60 native demo events incl. pickup runs** (guarantees a non-empty feed for demo) | §6 `events`, `sports_details`, `sports_positions`; §10 Spec-audit note | 1 | MVP |
| 5 | External-sync stub + dedup: Ticketmaster + SeatGeek adapters, upsert on `UNIQUE(source, external_id)`, `raw_payload`/`last_synced_at`, **+ provider-taxonomy → Loop-category map** (provider genre/segment → one of the 6 categories or `other`; without it synced rows are invisible to CatRow/affinity) | §6 `events` provenance cols + `category_id` (NOT NULL); `POST /api/admin/sync/ticketmaster`, `/seatgeek`, `GET /api/admin/sync/status` (§7.7) | 1 | MVP |
| 5b | **Job runner/scheduler** (cron + worker): backs the reminder dispatcher, `event_status` `published→past` flip, vector-rebuild + `user_category_affinities` rollup, embedding-on-publish, story expiry. Stand up minimal (single cron process) in S1; the MVP silently depends on it. | §9.2(C) rebuild cadence; §6 `event_reminders`, `event_status`; infra | 1 | MVP |
| 6 | Auth: signup/login/logout/refresh + JWT in HTTP-only cookie + `GET /auth/me`; role + `organizer_kind` selector; **auth middleware upserts/attaches `user_sessions` (incl. anonymous first-touch) so `interaction_events.session_id` FK holds** | §6 `users`, `oauth_accounts`, `user_sessions`; §7.1 `/api/auth/*`; Auth screen, FormField, PasswordField, RoleBadge | 1 | MVP |
| 7 | Onboarding flow: interest `ChipGrid` ("Pick at least 3", Continue disabled <3) + Step 2 city/location; commit via `PUT /users/:id/interests`. **S1 persists `user_interests` only — the seed *vector* build defers to #19/#20 (embeddings don't exist yet); S2 basic feed uses the affinity/popularity fallback.** | §6 `user_interests`; §7.2 `GET /interests`, `PUT/POST/DELETE /users/:id/interests`; §5 Onboarding, ChipGrid; §9.1 #1 | 1 | MVP |
| 8 | App shell + navigation: `TopNav` (logged-out/in variants) + mobile `BottomBar` (elevated Create tab), routing, TanStack Query + Auth/Toast/Modal contexts | §8 state architecture; TopNav, BottomBar | 1 | MVP |
| 9 | Event CRUD + publish: create draft, edit, delete, `draft→published` transition (enqueues embedding + notifications) | §6 `events`; §7.3 `POST/PATCH/DELETE /events`, `POST /events/:id/publish` | 2 | MVP |
| 10 | CreateEvent screen: 2-col form + live `EventCard` preview (flyer upload, FormField inputs, Sports toggle + reveal fields, Publish CTA) | §5 CreateEvent; FormField, EventCard | 2 | MVP |
| 11 | `GET /events` list + multi-select filters (category/city/geo-radius/date/price/free/sports) + sort; `CatRow` + `FilterBar` wired to URL params | §7.3 `GET /api/events`; §8 filters object; CatRow, FilterBar (selected = filled #6D5EFC) | 2 | MVP |
| 12 | `EventCard` component (variants standard / ForYou-with-AIChip via `showRationale`) + responsive flex-wrap grid | §5 EventCard, AIChip, AlmostFullBadge, GoingStack; grid system (w-full → 50% → 33% → 25%) | 2 | MVP |
| 13 | Discover screen (search bar + location pill + CatRow + FilterBar + count header + grid) | §5 Discover; §7.3 `GET /events` | 2 | MVP |
| 14 | EventDetail screen: dark header (poster + info + `GoingStack` + RSVP/Save CTAs), light body (About + related) | §7.3 `GET /events/:id`, `/related`; §5 EventDetail, VerifiedBadge, RSVPBtn, SaveBtn | 2 | MVP |
| 15 | Save + RSVP: `SaveBtn` / `RSVPBtn` endpoints, optimistic UI, denormalized `rsvp_count`/`save_count`, saved/going tabs | §6 `rsvps`, `saved_events`; §7.4 `PUT/DELETE /events/:id/save`, `/rsvp`; SaveBtn, RSVPBtn, GoingStack | 2 | MVP |
| 16 | Behavior-signal beacon: fire-and-forget batch ingest to append-only `interaction_events` | §6 `interaction_events`; §7.7 `POST /api/interactions`; §8 re-fetch/data-flow | 2 | MVP |
| 17 | Basic For-You feed: cold-start seed vector from interests + `POST /recommendations` (popularity/affinity fallback acceptable), `AIChip` rationale, ForYouFeed screen | §6 `user_preference_vectors`, `user_category_affinities`, `recommendation_impressions`; §7.6 `POST /recommendations`; §9.1 #1–#2, §9.2(E); ForYouFeed, AIChip | 2 | MVP |
| 18 | UserProfile screen (Saved / Going / Interests tabs) | §5 UserProfile; §7.2 `GET /users/:id/saved`, `/rsvps`, `/interests`; RoleBadge | 2 | MVP |
| 19 | `event_embeddings` pipeline: compose text, `content_hash` skip-guard, hosted-embeddings call, HNSW index; run on publish / sync / edit | §6 `event_embeddings`; §7.6 `POST /ai/embeddings/rebuild`; §9.2(B); §6 `ai_generation_logs` | 3 | MVP |
| 20 | `user_preference_vectors` builder: signal-weighted, time-decayed (`H=30d`), position-corrected avg + seed blend `α=min(1,signal_count/20)`, watermark recompute. **Apply the spec-audit deltas before building: `interaction_events` is the single replay source; reversal = supersede; `attend` demoted / `rsvp='going'` is the effective top weight since there's no non-sports check-in UI at demo** | §6 `user_preference_vectors`, `user_category_affinities`; §9.2(A)/(C); `spec_audit_recommendation_search.md` | 3 | MVP |
| 21 | Recommendation engine proper: PRE-FILTER → RANK (pgvector kNN) → RE-RANK (coefficient blend + MMR) + rationale, `recommendation_impressions`, feedback loop | §7.6 `POST /recommendations`, `/:id/feedback`; §9.2(D); recommendation_impressions | 3 | MVP |
| 22 | Natural-language search: NL parse → `parsed_filters`, query embedding, FTS+geo candidate set, pgvector re-rank, removable parsed-filter chips | §6 `search_queries`; §7.6 `POST /search`; §9.3; Discover/ForYouFeed search bar (story 3) | 3 | MVP |
| 23 | Sports roster: SportsPickupDetail (counter card + progress bar + position-picker grid + Join CTA) + roster table w/ SkillBadge; join/release/waitlist + host manage; "Ask Loop" drawer must not cover roster | §6 `sports_details`, `sports_positions`, `roster_entries`; §7.4 `/positions`, `/roster`, `PATCH /roster/:entryId`; §5 SportsPickupDetail (stories 8, 10) | 3 | MVP |
| 24 | AI auto-tag: `POST /events/:id/autotag` (confidence ≥ 0.6) + removable "×" AI-tags panel on CreateEvent | §6 `event_tags`; §7.6 `POST /events/:id/autotag`, `/tags`; §9.1 #4; CreateEvent (story 12) | 3 | nice-to-have |
| 25 | AI description: `POST /ai/generate-description` + "✨ Write with AI" button ("Writing…" state) with fact/length check | §7.6 `POST /ai/generate-description`; §9.1 #5; `events.description_is_ai`; CreateEvent (story 12) | 3 | nice-to-have |
| 26 | Follows + OrganizerProfile: follow/unfollow, denormalized counts, `FollowBtn`, followers/following lists | §6 `follows`; §7.2 `POST/DELETE /users/:id/follow`, `/followers`, `/following`; §5 OrganizerProfile, FollowBtn, VerifiedBadge, RoleBadge (stories 6, 14) | 3 | nice-to-have |
| 27 | Followed-organizer new-event notifications + `TopNav` bell feed | §6 `notifications`; §7.5 `GET /notifications`, `PATCH /:id/read`, `read-all`; TopNav bell (story 6) | 3 | nice-to-have |
| 28 | Reminders: schedule pre-event reminders + dispatcher job scanning due rows → `notifications` | §6 `event_reminders`; §7.5 `POST /events/:id/reminders`, `GET /users/:id/reminders`, `DELETE /reminders/:id` (story 7) | 4 | nice-to-have |
| 29 | SocialFeed: `StoriesRow` + `PostCard` (3-col rails on desktop), posts + likes + stories/views | §6 `posts`, `post_likes`, `stories`, `story_views`; §7.5 `/feed/social`, `/posts`, `/stories`; §5 SocialFeed (story 14) | 4 | nice-to-have |
| 30 | Comments: threaded comments on EventDetail + posts | §6 `comments` (event/post target CHECK); §7.3 `/events/:id/comments`, §7.5 `/posts/:id/comments` | 4 | nice-to-have |
| 31 | Conversational AI assistant: floating `AIAssistant` trigger + right-side `AIAssistantDrawer` (w-320) with inline EventCard results | §6 `ai_conversations`, `ai_messages`; §7.6 `POST /ai/conversations`, `/messages`; §9.1 #6; AIAssistant, AIAssistantDrawer | 4 | nice-to-have |
| 32 | **OrganizerDashboard screen** (story 13, not in the 6 detailed §5 wireframes): RSVP list + check-in toggle (the only non-sports surface that fires the `attend` signal) + per-event & aggregate analytics | §6 `event_analytics_daily`; §7.4 `GET /events/:id/rsvps`, `PATCH /rsvps/:userId`; §7.7 `/events/:id/analytics`, `/organizers/:id/analytics` (story 13) | 4 | nice-to-have |
| 33 | In-app feedback form | §6 `feedback`; §7.7 `POST /api/feedback`; ModalContext | 4 | nice-to-have |
| 34 | Responsive / mobile-web polish pass: breakpoints (390/768/1440), BottomBar gating, flex-wrap grid, scroll-snap rows, single selected-state rule (filled #6D5EFC + white text) | §5 grid system, selectedState; §8 mobile-web/responsive specifics | 4 | MVP |
| 35 | Deploy: Dockerize, AWS **ECS Fargate** + **RDS Postgres** (pgvector), secrets/env, embeddings/LLM keys backend-only | infra; §9 backend-only AI-key constraint | 4 | MVP |
| 36 | **Stretch — Map view** (Google Maps) on Discover/EventDetail with "near me" radius pins | §6 `lat`/`lng`/`google_place_id`; §5 Discover/EventDetail | 4 | stretch |
| 37 | **Stretch — Ticketing/payments + QR check-in** (`rsvps.checked_in_at`) | §6 `rsvps` price/check-in fields | 4 | stretch |
| 38 | **Stretch — Promoter analytics deep-dive + AI flyer-image generation** | §7.7 organizer analytics; §5 CreateEvent flyer upload | 4 | stretch |
| 39 | **Stretch — TikTok-style vertical social feed** | §5 SocialFeed; §6 `posts`/`stories` | 4 | stretch |

### MVP vs Nice-to-have vs Stretch

**MVP — the core discover → save/RSVP loop + basic personalization + create + host a run (by end of Sprint 2 for the non-AI core; deepened in Sprint 3):**
- Story 1 — pick interests at signup (Onboarding `ChipGrid`).
- Story 2 — personalized "For You" feed (basic in S2 via seed vector + fallback; full pgvector engine + rationale in S3).
- Story 3 — natural-language search (`POST /search`).
- Story 4 — filter events by category / location / date (`GET /events`, CatRow, FilterBar).
- Story 5 — save & RSVP (SaveBtn / RSVPBtn).
- Story 8 — join a pickup run & claim a position (roster).
- Story 9 — create an event with flyer + details, and publish (CreateEvent + `POST /events/:id/publish`).
- Story 10 — host sees & manages who claimed a spot (roster management).
- Cross-cutting MVP: auth, seed data + external-sync/dedup, EventCard/feed grid, EventDetail, behavior-signal ingest, responsive polish, deploy.

**Nice-to-have (Sprint 3–4, valuable but not gating the MVP demo):**
- Story 6 — follow organizers/promoters (follows + OrganizerProfile).
- Story 7 — **reminders** before a saved/RSVP'd event (schedule + dispatcher).
- Story 12 — AI tag suggestions + AI "Write with AI" description polish.
- Story 13 — organizer sees RSVPs + performance analytics.
- Story 14 — followers grow + **full social layer** (SocialFeed, PostCard, StoriesRow, comments, AI assistant drawer).
- In-app feedback form.

**Stretch (only if time allows; explicitly out of the committed plan):**
- Map view (Google Maps pins / radius).
- Ticketing / payments.
- QR check-in.
- Promoter analytics deep-dive.
- AI flyer-image generation.
- TikTok-style vertical social feed.

---

## 10. Decisions Log

_The decisions that shaped Loop and why — the headline architectural calls are captured in the table below, and the fuller thematic running-log of every decision follows beneath it._

### Key architectural decisions

| Decision | Context | Alternatives considered | Tradeoffs |
|---|---|---|---|
| **"Sports Host" is an Organizer sub-capability, not a role and not an attendee capability** — roles stay Attendee + Organizer/Promoter; hosting is `users.is_host` (boolean), settable only when `role='organizer'` and enforced by `CHECK (is_host = false OR role = 'organizer')`. Pickup runs remain an event type (`events.is_sports` + `sports_details`). | The Figma export implied a 4-role model (attendee/organizer/promoter/sportsHost). Creating/managing events (including runs) is an organizer action, so hosting is scoped under the Organizer role rather than opened to every attendee — you must be an organizer, and an organizer flagged `is_host` unlocks the sports model. | A 3rd standalone `sportsHost` role as the Figma export implied; **making host a capability any Attendee can use** (the earlier call, now reversed); a separate persona table. | Hosting inherits organizer permissions/analytics with one clean gate and no dead role, and a plain attendee can't post runs — vs. attendees who only want to run a pickup game must first become organizers, and the RoleBadge "Sports Host" (green) tint renders off a boolean (`is_host`), not a `user_role` value. |
| **Docker + AWS ECS Fargate + RDS (Postgres) for deploy**, not Kubernetes. | Need a containerized deploy of the API plus Postgres+pgvector for a 3-person capstone with minimal ops time. | Kubernetes/EKS; bare EC2; Heroku/Render; Vercel + a managed DB. | Fargate means no cluster to manage, less ops overhead, and good-enough scale, vs. less low-level control, potential cost, and some AWS lock-in relative to k8s portability. |
| **Split search into Elasticsearch (keyword/filter) + pgvector (semantic)** — with Postgres FTS as the MVP form of the keyword layer and Elasticsearch as the documented scale-out. | Loop needs both hard-constraint keyword/facet filtering and meaning-aware semantic matching over the same event catalog (§6, §9.3). | Elasticsearch-only; pgvector-only; Postgres-FTS-only. | Right tool per job and a swappable keyword layer behind one contract, vs. two systems to run at scale — so the MVP runs one datastore (Postgres FTS + pgvector) and ES is deferred. |
| **Run all AI/LLM/embedding calls on the BACKEND, never the frontend.** | Hosted embeddings/LLM API keys must never ship to the browser; calls need auditing and caching. | Client-side calls to the AI provider directly from the browser. | API-key safety, centralized auditing (`ai_generation_logs`), and caching (`content_hash` skip), vs. an extra backend hop and added server cost. |
| **Auth = stateless JWT in an HTTP-only, Secure, SameSite cookie**; `user_sessions` is an analytics/browsing-session row, not the credential store. | Session auth for a responsive mobile web app that also logs behavior signals grouped by browsing session. | JWT in `localStorage`; server-side session store as the credential of record. | XSS-safe token storage and a clean decoupling (§6 never needs a token/expiry column), vs. needing a refresh-cookie rotation flow and CSRF-aware `SameSite` handling. |
| **Multi-select filters as repeated query params** on `GET /api/events` (`?category=music&category=nightlife`), geolocation as flat scalars (`nearLat`/`nearLng`/`radiusKm`). | Discover/search filter state must be deep-linkable, shareable, and survive back/refresh via `useSearchParams`. | A single nested JSON `filters` object in the query string; POST body for reads. | URL-owned, shareable, cache-friendly GET state, vs. a nested object can't be cleanly URL-encoded, so geo is flattened to scalars. |
| **Roster uses a claim model** (`sports_positions` + `roster_entries` = actual claims), not pre-seeded empty-slot rows. | The host must see exactly who claimed which slot, with waitlist/cancel/promote semantics and hard capacity integrity. | Pre-seed one row per empty slot; a single free-text `position` column on `sports_details`. | Partial unique indexes + a capacity trigger enforce integrity cleanly and open slots are computed (`capacity` − claimed), vs. a synthetic "Any" position must be seeded for position-less runs so no claim is unguarded. |
| **Interests are an editable M:N** (`interests` + `user_interests`) seeding the preference vector. | Users pick ≥3 at onboarding and re-curate later; interest→category centroids seed cold-start (§9.2). | A denormalized text/array blob on `users`; a fixed non-editable set. | Users can add/remove picks and edits immediately re-shape `u_seed` and the feed, vs. an extra join table and three interest endpoints (`PUT`/`POST`/`DELETE`) to maintain. |
| **Cold-start blends an onboarding seed vector with behavior** via `α = min(1, signal_count/20)`. | A brand-new user has zero `interaction_events`, so a pure behavior vector would be empty on the very first feed. | Popularity-only cold feed; wait for N signals before personalizing; content-only. | The first `POST /api/recommendations` is already relevant (100% seed at 0 signals, linear handoff to behavior by ~20 signals), vs. added blend/build complexity in the vector job. |
| **Skip re-embedding when `content_hash` is unchanged** (`sha256(composed_text‖model)`). | Ticketmaster/SeatGeek re-syncs and idempotent re-publishes would otherwise re-embed rows whose text didn't change. | Always re-embed on publish/sync/edit; time-based re-embed. | A cost/rate guard that only burns embedding tokens on real content changes, vs. a stale embedding if the composed-text formula changes without a `vector_version` bump. |

_A fuller thematic running-log of decisions follows below (Roles & personas · Naming · Data model · API & state · Spec audit · AI features), kept as the standing narrative that grew section-by-section._

### Roles & personas
- **Two roles only (Attendee, Organizer/Promoter); "Sports Host" is an Organizer sub-capability, not a role.** Creating and managing events — pickup runs included — is an Organizer action, so hosting is scoped under the Organizer role: you must be an organizer, and an organizer flagged `is_host` unlocks the sports/roster model. Modeled as `users.is_host` (boolean), settable only when `role='organizer'` and enforced by `CHECK (is_host = false OR role = 'organizer')`. Pickup runs remain an event *type* (`events.is_sports` + `sports_details`), not a persona. This overrides the Figma export (four roles).
  - **Reversal (superseding the earlier call):** an earlier version of this decision made hosting "a capability any Attendee can use." We reversed it — a plain attendee can no longer host. Rationale: posting/managing a run reuses the organizer create/manage surface (and its analytics), so gating it behind the Organizer role keeps one permission path (`role='organizer'`, plus `is_host` for the sports toggle) instead of two orthogonal gates, and avoids attendees creating events through a side door. The prior tradeoff (an attendee who only wants to run a pickup game must now become an organizer) was accepted.
- **"Promoter" is a display sub-type of Organizer, not a separate role.** Modeled as the nullable `organizer_kind` enum — it drives only the RoleBadge tint and grants no extra permissions.

### Naming
- **App/team name is "Loop"** — corrected an earlier draft that referred to "EventAI".

### Data model
- **Category is a lookup table, not free text or an enum** — it's a filter facet, an FK, and a behavior signal at once, so it needs a stable id (and it carries the Figma color tokens).
- **Interests are a proper editable M:N** (`interests` + `user_interests`), not a text blob — users curate which interests they keep after onboarding.
- **One `events` table for native and synced events** with `source` + `UNIQUE(source, external_id)` upsert key + `raw_payload`/`last_synced_at` for dedupe and refresh of Ticketmaster/SeatGeek data.
- **Behavior is captured as both a raw append-only log (`interaction_events`, `search_queries`) and rollups (`user_category_affinities`)**, then compiled into a per-user `user_preference_vector` (pgvector) — the substrate for the headline recommender.
- **Roster uses a claim model** (`sports_positions` + `roster_entries`) with partial unique indexes + a capacity trigger; position-less runs seed a synthetic "Any" position so capacity is always enforced.
- **Search split: Postgres FTS + filters narrow, pgvector personalizes/re-ranks.** Elasticsearch is a documented future scale-out, not an MVP dependency.
- **Vectors isolated in dedicated tables** (`event_embeddings`, `user_preference_vectors`) with `model`/`vector_version` for recompute/rollback; `vector(384)` is the pinned dimension (a MiniLM-class local model, e.g. `all-MiniLM-L6-v2`), re-pinnable later via `model`/`vector_version`.
- **AI providers pinned (Sprint 0, Lane B) — all free, all off-box.** Two separate models back Loop's AI, both reached by backend HTTP call so the Render web service carries neither in memory:
  - **Embeddings → `all-MiniLM-L6-v2` (384-d), served by the Hugging Face Inference API.** Endpoint (verified working, Sprint 0): `POST https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction` with `Authorization: Bearer $HF_API_TOKEN` — note HF **retired** the old `api-inference.huggingface.co` host (no longer resolves), so use `router.huggingface.co`. A spike confirmed it returns a **384**-float vector, matching the pinned DIM. The former `vector(1536)` placeholder is resolved to **`vector(384)`** — this one number is used by every vector column (`event_embeddings.embedding`, `user_preference_vectors.embedding`, `search_queries.query_embedding`) and their HNSW `vector_cosine_ops` indexes, so it must be identical across all three, and **the same model must embed both events and queries** or the vectors aren't comparable. Chosen over OpenAI `text-embedding-3-small` (1536): free, and a 4× smaller vector means smaller rows + faster ANN — acceptable because the semantic layer only *re-ranks* a bounded candidate set (§9.3), so raw recall precision isn't the bottleneck. Each row carries its own `model`/`vector_version`, so re-pinning to a 1536-d hosted model (or self-hosting MiniLM on Fly/Railway if HF's free tier throttles) is a versioned forward re-embed, not a schema rewrite.
  - **LLM → Groq** (free tier) for the generative features: `llama-3.1-8b-instant` for high-volume/latency-sensitive calls (NL-search parse, auto-tagging), `llama-3.3-70b-versatile` for quality-sensitive calls (chat assistant, AI descriptions). Chosen over OpenRouter's free variants (too slow) — Groq is the fastest hosted free option. MiniLM handles embeddings *only*; these generative features need a real LLM, hence a second provider + key (`GROQ_API_KEY`, alongside `HF_API_TOKEN`).
  - **Deploy note (pending, Lane A):** this stack assumes a **Render** web service + Render Postgres (pgvector) rather than the AWS ECS Fargate + RDS recorded elsewhere in this log; the deploy-target reversal is Lane A's to confirm at Sprint 4 (issue #35) and is intentionally left unchanged here.

### API & state (§7–§8)
- **Auth = stateless JWT in an HTTP-only, Secure, SameSite cookie** (not `localStorage`), the correct posture for mobile web (XSS-safe). The `user_sessions` table is the **analytics/browsing-session** row that groups `interaction_events` — deliberately decoupled from the credential store so §7 never references a token/expiry column that §6 doesn't have.
- **Multi-select filters are repeated query params on `GET /api/events`** (`?category=music&category=nightlife`), and geolocation is **flat scalars** (`nearLat`/`nearLng`/`radiusKm`) since a nested object can't be URL-encoded; the client `filters` object is URL-owned via `useSearchParams` for deep-linkable, shareable Discover/search views. `ageMax` is used consistently in §7 and §8 (matches `age_min ≤ ageMax` or null).
- **Interests are editable via three endpoints**: `PUT` (replace whole set — onboarding submit + bulk edit), `POST` (add one), `DELETE …/:interestId` (remove one).
- **Roster is a claim API**: `POST /api/events/:id/roster` joins + claims a position (auto-waitlists at capacity), `DELETE` releases (auto-promotes next waitlisted), host `PATCH …/roster/:entryId` manages promote/no_show/attended/remove.
- **Server state = TanStack Query cache; mutations invalidate query keys** (RSVP/save/follow/interest-edits all invalidate `['recommendations']` because they're ranking signals). **Behavior signals are fire-and-forget beacons** to `POST /api/interactions` — never block the UI.
- **Post comments reachable** via `GET/POST /api/posts/:id/comments` (not only event comments), so the `comments.post_id` branch + `posts.comment_count` are buildable.
- **Attendance capture**: non-sports via organizer check-in (`PATCH /api/events/:id/rsvps/:userId`), sports via host roster `PATCH` — both emit an `attend` signal so the ranker's top-weight signal is never lost.

### Consistency audit (whole-plan pass)
- **A cross-section feasibility + consistency audit** (data model ↔ endpoints ↔ state ↔ behavioral algorithm) was run and its findings applied inline. Fixes now in the plan: the shared `EventCard` payload carries `organizer`/`going_stack` avatars/`capacity`/sports counts (so cards render `FollowBtn`/`GoingStack`/`AlmostFullBadge` off list data); anonymous `interaction_events.session_id` is FK-safe (ingest upserts a `user_sessions` row; `user_sessions.id` accepts the client-minted id); `interests.category_id` is NOT NULL (no empty cold-start seed); the two vector tables are one-active-row-per-entity (model migration is a versioned forward re-embed, not live A/B); `interaction_events` is the **single replay source** for the vector build with **reversal = supersede** (unsave/cancel/release/unfollow drop the prior positive, and `unfollow` is now emitted to the log); `click`/`rec_click` are explicitly weighted (never default to `1.0`); tag add/remove re-embeds the event; the `POST /interactions` handler back-writes `search_queries.clicked_event_id` + `recommendation_impressions`; sports capacity has one ceiling (`Σ position.capacity = players_needed`); `rsvp_count` only tracks `going`; `comments.like_count` dropped (no comment-like feature); `earthdistance`/`cube` extensions added; `other` category needs a color token. Work-plan additions: a **job runner/scheduler** issue (#5b), a provider-taxonomy→category map (#5), S1 onboarding defers the seed vector (#7), the `attend`-demotion spec-delta applied before the vector builder (#20), and an **OrganizerDashboard** screen for story 13 / non-sports check-in (#32).

### Spec audit (headline features)
- **A red-team audit of the recommendation engine + NL search lives in [spec_audit_recommendation_search.md](spec_audit_recommendation_search.md).** It lists assumptions that may not hold, unhandled edge cases, and trust-killers, split into fix-before-Sprint-1 vs later. Biggest risk: the "it learns from you" promise runs on ~5-signal cold-start users over off-brand Ticketmaster/SeatGeek data — so **seed 40–60 native demo events (incl. pickup runs)** and guarantee a non-empty feed. The audit's "Spec deltas" list is the set of §9/§7 edits to make if we act on it (not yet applied).

### AI features (§9)
- **All AI runs backend-only** (embeddings/LLM/NL-parse keys never in the browser); every call audited in `ai_generation_logs`. See the fuller **§9.4 AI Feature Decisions Log** for the per-decision table (backend AI, seed-blend cold-start, SQL pre-filter, hard-constraint filters, `content_hash` re-embed skip, 30-day decay, `confidence≥0.6` tags, popular-events fallback, MMR/position-bias, description fact-check).
- **Headline recommender = pgvector engine**: signal-weighted, time-decayed (`H=30d`) weighted average of engaged `event_embeddings` → one `user_preference_vectors.embedding`, matched by cosine kNN. Pipeline is **PRE-FILTER (SQL) → RANK (pgvector cosine `<=>`) → RE-RANK (explicit coefficient blend + MMR)**; cold-start blends onboarding seeds via `α=min(1,signal_count/20)`. Price/age/free are *search* filters, not For-You pre-filters (no age column on `users`); popularity includes `players_signed_up` so sports runs aren't under-ranked.
- **Two search layers**: keyword/filter (Postgres FTS in MVP, Elasticsearch as future swap) decides *membership* as hard constraints; semantic pgvector layer only *re-ranks within* it. `GET /api/events` authed personalization is a SQL-only `user_category_affinities` tie-break, not a vector call.
