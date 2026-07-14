# Running Loop locally

Loop is a two-folder app: a **React 18 + Vite + Tailwind v4** frontend (an exact
implementation of the Figma export in `planning/project_knowledge.md`) and a
**Node + JavaScript + Express** backend that serves the demo event catalog.

The frontend talks to the backend through Vite's `/api` proxy, and falls back to
a bundled mock copy of the seed data if the backend is offline — so the UI always
renders.

> **Postgres status:** the public `/api/*` product endpoints still serve the
> in-memory seed catalog. Postgres + pgvector is live and used by the **admin
> sync/jobs pipeline** (`/api/admin/*`), which pulls events from Ticketmaster /
> SeatGeek and upserts them into the database via Prisma. The read/serve paths
> have not been cut over to Postgres yet. You only need Docker/Postgres running
> if you're working on sync, migrations, or the data model.

## Prerequisites

- Node 20+ and npm
- Docker (only for the Postgres + pgvector database — see step 0)

## 0. Start the database (Postgres 16 + pgvector, optional for the demo UI)

The DB runs in a single `pgvector/pgvector:pg16` container defined in
`docker-compose.yml`. It's exposed on host port **5433** (not 5432 — a native
Postgres already owns 5432 on the dev machine).

```bash
docker compose up -d          # start Postgres in the background
docker compose down           # stop (keeps data)
docker compose down -v        # stop AND wipe the data volume (fresh DB)
```

On first boot, `backend/db/init/01-extensions.sql` enables the extensions the
data model needs: `vector` (pgvector), `citext`, `pg_trgm`, `cube`,
`earthdistance`.

Point the backend at it (`backend/.env`, copied from `.env.example`):

```
DATABASE_URL=postgresql://loop:loop@localhost:5433/loop
```

Apply migrations and seed:

```bash
cd backend
npx prisma migrate dev        # apply migrations (incl. raw-SQL vector/tsvector indexes)
npx prisma db seed            # runs `node prisma/seed.js` (registered in package.json)
```

## 1. Start the backend (port 3000)

```bash
cd backend
npm install
npm run dev        # http://localhost:3000  (node --watch)
```

Sanity check:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/events | head -c 300
```

## 2. Start the frontend (port 5173)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Open http://localhost:5173. Requests to `/api/*` are proxied to the backend.

## Build / lint

```bash
# frontend
cd frontend && npm run build     # vite build -> dist/
# backend
cd backend  && npm run lint      # plain JS/JSX — no build step; runs directly
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
`frontend/src/lib/utils.js`.

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

**Backend — admin sync/jobs endpoints (Postgres-backed, via Prisma):**

- `POST /api/admin/sync/ticketmaster`, `POST /api/admin/sync/seatgeek` (pull + upsert events)
- `GET /api/admin/sync/status`
- `GET /api/admin/jobs`, `POST /api/admin/jobs/:name/run`

> The public product endpoints above still serve the in-memory seed catalog. The
> Postgres + pgvector data model exists (`backend/prisma/schema.prisma` + three
> migrations) and is written to by the admin sync pipeline, but the public read
> paths have not been migrated onto it yet. Auth and the real
> recommendation/embedding pipeline are specced in `planning/project_plan.md` and
> sequenced in `planning/implementation_playbook.md`.
