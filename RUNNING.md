# Running Loop locally

Loop is a two-folder app: a **React 18 + Vite + Tailwind v4** frontend (an exact
implementation of the Figma export in `planning/project_knowledge.md`) and a
**Node + TypeScript + Express** backend that serves the demo event catalog.

The frontend talks to the backend through Vite's `/api` proxy, and falls back to
a bundled mock copy of the seed data if the backend is offline — so the UI always
renders.

## Prerequisites

- Node 20+ and npm

## 1. Start the backend (port 4000)

```bash
cd backend
npm install
npm run dev        # http://localhost:4000  (tsx watch)
```

Sanity check:

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/events | head -c 300
```

## 2. Start the frontend (port 5173)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Open http://localhost:5173. Requests to `/api/*` are proxied to the backend.

## Build / typecheck

```bash
# frontend
cd frontend && npm run build     # tsc -b + vite build
# backend
cd backend  && npm run build     # tsc -> dist/
```

## What's implemented

**Frontend — all 18 Figma components:** FormField, PasswordField, EventCard,
AIChip, AlmostFullBadge, GoingStack, RSVPBtn, SaveBtn, FollowBtn, VerifiedBadge,
RoleBadge, TopNav, BottomBar, CatRow, FilterBar, StoriesRow, PostCard, AIAssistant.

**Frontend — all 12 screens / routes:**

| Screen | Route |
|---|---|
| Landing | `/` |
| Auth | `/auth` |
| Onboarding | `/onboarding` |
| For You Feed | `/feed` |
| Discover | `/discover` |
| Event Detail | `/event/:id` |
| Sports Pickup Detail | `/sports/:id` |
| Social Feed | `/social` |
| Create Event | `/create` |
| Organizer Profile | `/organizer/:id` |
| User Profile | `/profile` |
| AI Assistant Drawer | overlay (floating trigger, all in-app screens) |

Design tokens (colors, radii, shadows, fonts, the single selected-state rule)
are mapped 1:1 from the Figma JSON into `frontend/src/index.css` (`@theme`) and
`frontend/src/lib/utils.ts`.

**Backend — REST endpoints:**

- `GET /api/health`
- `GET /api/categories`, `GET /api/interests`, `GET /api/avatars`
- `GET /api/events` (filters: `category`, `isFree`, `isSports`, `q`, `sort`)
- `GET /api/events/:id`, `GET /api/events/:id/related`
- `POST /api/recommendations` (interest-affinity + popularity fallback ranking)
- `GET /api/organizers/:id`
- `GET /api/posts` (social feed)
- `POST /api/auth/signup`, `POST /api/auth/login`
- `POST /api/ai/search` (grounded NL search / assistant)

> This build uses an in-memory seed catalog. The Postgres + pgvector data model,
> auth, and the real recommendation/embedding pipeline are specced in
> `planning/project_plan.md` and sequenced in `planning/implementation_playbook.md`.
