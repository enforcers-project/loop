# Project Proposal

Pod Members: **Benny Nketia, Heartwill Gbekle, Mussie Aregay**

## Problem Statement

Local events are scattered across Instagram flyers, group chats, TikTok, Eventbrite, and word of mouth, so people constantly miss things happening near them — and organizers can't reach the right audience without reposting the same flyer everywhere. Our target audience is everyday people looking for things to do (parties, concerts, watch parties, pickup sports, networking, campus events), plus a secondary audience of organizers and promoters — including those who host pickup runs — who need to get their events in front of the right people.

## User Roles

Attendee — discovers, saves, and RSVPs to events, follows organizers, and can join pickup runs.
Organizer / Promoter — creates and manages events and builds a following. An organizer flagged as a **host** can also post and run pickup games (player counts, positions, skill level) — hosting is an Organizer sub-capability, not a separate role.

## User Personas

Attendee


Maya, 20 — college sophomore. New to the area and into Afrobeats nights and campus events. She hears about most things too late, through group chats, and wants one feed that shows what's worth going to this weekend.
Devin, 26 — young professional. Recently relocated for work and knows almost no one. He wants networking mixers and low-key social events, and would follow a few promoters to stay in the loop.


Organizer / Promoter


Tunde, 24 — nightlife promoter. Throws monthly parties and reposts the same flyer across Instagram, TikTok, and group chats. He wants one place to post, get discovered, and grow a following he owns.
Priya, 22 — campus club lead. Runs workshops and meetups for a student org. She's not a marketer and wants help writing event descriptions so her events show up when people search "free campus events."

Organizers who host pickup runs (`is_host`):

Marcus, 28 — an organizer who runs a Sunday soccer game and constantly chases people to confirm so he hits 10 players. He wants a roster that fills itself and shows spots remaining.
Leo, 19 — an organizer who runs weekend basketball games and wants players to find the run, claim a spot, and see skill level so games stay balanced.



## User Stories

### Attendee

1. As an attendee, I want to pick my interests when I sign up, so that my feed feels relevant from day one.

2. As an attendee, I want a personalized "For You" feed, so that I see events that match my taste without searching.

3. As an attendee, I want to search in plain language like "free events this weekend," so that I can find events without guessing the exact title.

4. As an attendee, I want to filter events by category, location, and date, so that I can quickly narrow down to what fits my plans.

5. As an attendee, I want to save and RSVP to events, so that I can keep track of what I'm planning to attend.

6. As an attendee, I want to follow organizers and promoters, so that their upcoming events show up in my feed.

7. As an attendee, I want a reminder before an event I saved or RSVP'd to, so that I don't find out about it too late or forget to go.

8. As an attendee, I want to join a pickup sports run and claim a position, so that I can lock in my spot before it fills up.

### Organizer / Promoter

9. As a host (an organizer with `is_host`), I want to post a run showing players needed, skill level, and spots filled, so that the right players can find it and see if there's room.

10. As a host (an organizer with `is_host`), I want to see and manage who has claimed a spot, so that I know my run will actually have enough players to go ahead.

11. As an organizer, I want to create an event with a flyer/image and details, so that people can discover and RSVP to it.

12. As an organizer, I want AI to suggest tags and help write my event description, so that my event reads well and surfaces in the right searches.

13. As an organizer, I want to see who has RSVP'd and how my event is performing, so that I can gauge interest and plan accordingly.

14. As an organizer, I want people to follow me and see my following grow, so that I can reach the right audience without reposting the same flyer everywhere.


## Decisions Log — User Stories

- **Story we debated the scope of**: "As a user, I want to host a pickup run with spots, skill level, and positions" — debated whether hosting a run should be its own role (Sports Host) or a capability of an existing role. Debated whether to prescribe the position-claiming mechanic in the story or leave it to implementation; decided to keep "spots, skill level, and positions" in the story because it's a distinctive product behavior, not a technical detail.
  **How we resolved it**: Kept two roles — Attendee and Organizer/Promoter — and made hosting a **sub-capability of the Organizer role** (`users.is_host`): you must be an organizer, and an organizer flagged `is_host` unlocks the sports/roster model. A plain attendee can join a run (story 8) but cannot host one. Pickup runs are treated as an event type (`events.is_sports` + `sports_details`), not a third persona.

- **Decision we reversed**: We first collapsed "Sports Host" into a capability **any Attendee** could use, reasoning that hosting reuses the same create/view/manage verbs as ordinary attendee actions. We reversed that: posting and managing a run is part of the organizer create/manage surface (and its analytics), so hosting is now scoped under the Organizer role rather than open to every attendee. This keeps one permission path (`role='organizer'`, plus `is_host` for the sports toggle) instead of two orthogonal gates, and stops attendees from creating events through a side door. Enforced by `CHECK (is_host = false OR role = 'organizer')`. Tradeoff accepted: an attendee who only wants to run a pickup game must first become an organizer.

- **Story we cut (and why)**: Cut the standalone "Sports Host" role and its own persona section — the capabilities overlapped entirely with Organizer, and the difference was event-type-specific fields (skill level, spots) rather than a different actor. Re-homed its two stories (9, 10) under Organizer / Promoter as the host (`is_host`) sub-capability instead of deleting the functionality; the host personas (Marcus, Leo) moved under Organizer as organizers who host runs.

- **Story that changed after Claude's feedback**: Original: "As a sports host, I want to post a run..." and "As a sports host, I want to see and manage who has claimed a spot..." — Claude flagged that a role should be defined by distinct permissions, not by content type, and Sports Host shared Organizer's exact capabilities. Revised to: "As a host (an organizer with `is_host`), I want to post a run showing players needed, skill level, and spots filled..." and "As a host (an organizer with `is_host`), I want to see and manage who has claimed a spot..." — reframing host as an Organizer sub-capability, not a separate role and not an attendee capability.

- **AI feature story: user benefit we landed on**: For "As an organizer, I want AI to suggest tags and help write my event description," described the benefit as the event reading well and surfacing in the right searches — what the organizer experiences (better discovery, less writing friction), not the model, the prompt, or the re-ranking pipeline behind it.

## Wireframe (Bonus)

<img width="1590" height="1050" alt="image" src="https://github.com/user-attachments/assets/31cd7eb9-ad22-4b93-852d-2d72ec03b176" />

