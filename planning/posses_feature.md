# Loop — Posses (event group coordination)

> **What this is:** the design + build plan for **Posses** — user-created groups that coordinate heading to an event together, with a shared group chat, DM invites, and public/mutuals discovery. It maps the feature onto Loop's existing messaging, social-graph, and notification infra (so we reuse, not rebuild), calls out the real gaps, and sequences the work into three shippable PRs.
>
> **Owner:** Mussie · **Date:** Mon Jul 27, 2026 · **Builds on:** the messaging stack ([`backend/src/messages/`](../backend/src/messages/)), the follow graph ([`backend/src/users/routes.js`](../backend/src/users/routes.js)), and notifications ([`backend/src/notifications/`](../backend/src/notifications/)).

---

## The one-line reframe

A **posse is not a new chat system.** It's an *event-scoped, named group thread* + a *membership policy* + a *discovery surface*. Loop already ships group chat, real-time (SSE), DM delivery, and message attachments — so most of this feature is a thin membership/policy layer on top of an existing `MessageThread`, plus discovery UI.

---

## What already exists (reuse)

| Capability | Where | Reuse for posses |
|---|---|---|
| **Named group threads** (N participants) | `MessageThread` + `ThreadParticipant[]` — a thread is a "group" by having 3+ participants ([messages/routes.js:12](../backend/src/messages/routes.js#L12)) | A posse's group chat **is** a named thread |
| **Real-time** | SSE bus, one `EventEmitter` per user ([messages/bus.js](../backend/src/messages/bus.js)); frames `message`/`typing`/`read`/`reaction` | Add posse roster frames to the same pipe |
| **DM delivery** | `POST /api/threads/dm` (idempotent by `dmKey`) ([routes.js:93](../backend/src/messages/routes.js#L93)) | Deliver posse invites |
| **Message attachments** | `Message.attachedEvent Json` — a slim event snapshot rendered as a card | Parallel `attachedPosse` payload → invite card |
| **Access control** | `requireParticipant(threadId, userId, res)` ([routes.js:47](../backend/src/messages/routes.js#L47)) | Chat access falls out for free (see below) |
| **RSVP + gates** | `Rsvp` + transition logic ([engagement/routes.js](../backend/src/engagement/routes.js)); age/capacity gates | Join → RSVP `going`, through the same gates |
| **Bell notifications** | `notifySelf` / `system` + `metadata.kind` pattern ([publish.js:252](../backend/src/notifications/publish.js#L252)) | Invite / join-request / approved notices |

### The design keystone: active members ⇒ thread participants

The single decision that keeps this clean: **active `PosseMember`s are mirrored into `ThreadParticipant` in the same transaction.**

- Chat access stays gated by the existing `requireParticipant` helper → **every message route works unchanged**.
- **Pending** requesters are *not* thread participants → they can't see the chat until approved. That behavior falls out for free.

---

## Gaps to build (everything else is reuse)

1. **Roster mutation** — the messaging system sets participants only at thread creation; there is **no add / remove / leave** route. Posses need this.
2. **Bidirectional mutuals query** — `getFriendIds` ([social.js:24](../backend/src/recommendations/social.js#L24)) is *one-directional* (people you follow). Reciprocal-follow discovery needs a new intersect query.
3. **Posse CRUD + join/request/approve routes**, serializers.
4. **Posse-invite message attachment** + Join action.
5. **RSVP `going` on join**, wired through existing gates.
6. **Notifications** via `notifySelf`/`system` + `metadata.kind` — **never a new `NotificationType` enum value** (deploys don't run enum migrations → a new value 500s every insert, [publish.js:243](../backend/src/notifications/publish.js#L243)).
7. **UI**: social-rail card, `/posses`, `/posse/:id` (reusing thread chat), EventDetail CTA + public-posse list.

---

## Data model

Matches schema conventions: UUID PKs (`gen_random_uuid()`), camelCase→`@map` snake_case, composite-PK join tables, no soft-delete.

```prisma
enum PosseVisibility {
  private   // invite-only; not discoverable
  mutuals   // discoverable by reciprocal follows (A follows B AND B follows A)
  public    // discoverable by anyone who can see the event

  @@map("posse_visibility")
}

enum PosseJoinPolicy {
  open      // discoverers join instantly
  ask       // discoverers request; captain approves

  @@map("posse_join_policy")
}

enum PosseRole {
  captain
  member

  @@map("posse_role")
}

enum PosseMemberStatus {
  active    // in the posse + in the thread
  pending   // requested to join; NOT in the thread yet

  @@map("posse_member_status")
}

model Posse {
  id         String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  eventId    String          @map("event_id") @db.Uuid
  threadId   String          @unique @map("thread_id") @db.Uuid
  creatorId  String          @map("creator_id") @db.Uuid
  name       String          @db.VarChar(80)
  note       String?         @db.VarChar(280)      // "meet at north gate 8pm"
  visibility PosseVisibility @default(private)
  joinPolicy PosseJoinPolicy @default(ask)         // only applies to mutuals/public
  createdAt  DateTime        @default(now()) @map("created_at") @db.Timestamptz(6)

  event   Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)
  thread  MessageThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  creator User          @relation(fields: [creatorId], references: [id], onDelete: Cascade)
  members PosseMember[]

  @@index([eventId, visibility])
  @@map("posses")
}

model PosseMember {
  posseId   String            @map("posse_id") @db.Uuid
  userId    String            @map("user_id") @db.Uuid
  role      PosseRole         @default(member)
  status    PosseMemberStatus @default(active)
  createdAt DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)

  posse Posse @relation(fields: [posseId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([posseId, userId])
  @@index([userId, status])
  @@map("posse_members")
}
```

**Notes**
- `threadId @unique` — one chat per posse; deleting either cascades.
- No `deletedAt`; a dissolved posse is a hard delete (thread cascades). Matches the codebase's no-tombstone convention.
- Capacity: threads cap at `MAX_GROUP=20` ([routes.js:36](../backend/src/messages/routes.js#L36)); posses inherit that ceiling.

---

## Visibility × join-policy matrix

| | **private** | **mutuals** | **public** |
|---|---|---|---|
| **Who can discover it** | nobody (invite only) | reciprocal follows | anyone who can see the event |
| **`open`** | (n/a) | discoverer joins instantly | discoverer joins instantly |
| **`ask`** | invite = instant join | discoverer requests → captain approves | discoverer requests → captain approves |

**Keystone property: an invite is always pre-approval.** Regardless of visibility or join-policy, accepting a DM invite adds you instantly. `ask` only gates *strangers discovering it* — never invitees. This makes the two toggles compose with no weird edge cases.

Per product decision, the creator picks the audience (`private` / `mutuals` / `public`), so we build **both** discovery paths — the reciprocal-mutuals query *and* the fully-public path — and the toggle selects the gate.

---

## Flows

### Create
From EventDetail ("Going together? Start a posse"). One transaction: create `Posse` + named `MessageThread`, add creator as `captain`/`active` + `ThreadParticipant`, optionally RSVP the creator `going`.

### Invite via DM (in-app card)
Pick a mutual → open/reuse a DM thread ([POST /api/threads/dm](../backend/src/messages/routes.js#L93)) → post a message carrying a posse payload (parallel to `attachedEvent`). Renders a card with a **Join** button → instant active join.

### Discover & join (mutuals / public)
Eligible users see the posse on the event page and a Posses feed. `open` → Join instantly; `ask` → Request (creates a `pending` member) → captain gets a `system`/`posse_join_request` notification → approve flips `pending`→`active` + adds `ThreadParticipant` + RSVPs `going`.

### Join ⇒ RSVP `going` (through gates)
Any path to `active` upserts the user's RSVP to `going` and bumps `rsvpCount`, reusing the transition logic in [engagement/routes.js](../backend/src/engagement/routes.js). **The event's existing gates still apply** (age-restriction, capacity) — you can't join a posse to bypass an 18+ gate. If the gate fails, the user still joins the posse but sees "you'll need to meet the age requirement to attend." **Leaving a posse does not cancel the RSVP** (one-way sync — you might still go solo).

### Leave / remove / captain transfer
Leaving removes you from `PosseMember` + `ThreadParticipant`. Captain leaving transfers to the oldest active member; if none remain, the posse dissolves (thread cascades).

---

## Real-time & notifications

- **Chat** — already live (it's a thread).
- **Roster events** (joined / requested / approved) — new SSE frame types (`posse_join`, `posse_request`) on the existing bus, so the captain's roster updates live.
- **Bell** — `notifySelf`/`system` + `metadata.kind`, kinds: `posse_invite`, `posse_join_request`, `posse_request_approved`. **No new enum value.**

---

## API surface (new routes)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/posses` | create (body: `event_id`, `name`, `note?`, `visibility`, `join_policy`) |
| `GET` | `/api/posses` | my posses (active + pending) |
| `GET` | `/api/posses/:id` | posse detail (roster, policy, thread id) |
| `GET` | `/api/events/:id/posses` | discoverable posses for an event (gated by viewer eligibility) |
| `PATCH` | `/api/posses/:id` | edit name/note/visibility/join-policy (captain) |
| `POST` | `/api/posses/:id/join` | join (open) or request (ask) → RSVP `going` on active |
| `POST` | `/api/posses/:id/invite` | `{user_id}` → DM invite card (captain/member) |
| `POST` | `/api/posses/:id/members/:uid/approve` | approve pending (captain) |
| `DELETE` | `/api/posses/:id/members/:uid` | remove (captain) or leave (self) |
| `DELETE` | `/api/posses/:id` | dissolve (captain) |

Serializers snake_case, mirroring `messages/serialize.js`. Access control mirrors `requireParticipant` — a `requirePosseMember` / `requireCaptain` helper.

---

## UI surfaces

- **Social left rail** — a "Your posses" card alongside "Your upcoming RSVPs".
- **`/posses`** — index of your posses (active + pending requests).
- **`/posse/:id`** — event header + roster (captain approve/remove controls) + group chat (reuse the existing thread chat component wholesale).
- **EventDetail** — "Start a posse" CTA + list of discoverable posses for that event (highest-intent entry point).

---

## Phasing (3 PRs, each shippable)

**PR 1 — Schema + backend.** `Posse`/`PosseMember` models + migration, CRUD/join/leave/approve routes, `requirePosseMember`/`requireCaptain` helpers, bidirectional-mutuals query, RSVP-`going`-on-join through gates, notifications, serializers. No UI.

**PR 2 — Core UI.** Create flow (EventDetail CTA), `/posse/:id` detail reusing thread chat, DM invite card + Join action, `/posses` index, social-rail card. Private posses fully usable end-to-end.

**PR 3 — Discovery.** `mutuals`/`public` visibility toggles, event-page discoverable list + Posses feed, request→approve queue, live roster SSE frames, captain transfer.

---

## Open questions / deferred

- **Blocking / reporting** inside a posse chat — deferred; messages already have a `flagged` column to build on.
- **Posse expiry** — a posse for a past event is dead weight; a cleanup job (like the story-expiry scheduler) could archive posses after the event ends. Deferred to post-MVP.
- **Multiple posses per event per user** — allowed by the model (no unique constraint on `[eventId, creatorId]`); revisit if it causes clutter.
