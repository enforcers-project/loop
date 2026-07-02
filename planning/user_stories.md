# Project Proposal

Pod Members: **Benny Nketia, Heartwill Gbekle, Mussie Aregay**

## Problem Statement

Local events are scattered across Instagram flyers, group chats, TikTok, Eventbrite, and word of mouth, so people constantly miss things happening near them — and organizers can't reach the right audience without reposting the same flyer everywhere. Our target audience is everyday people looking for things to do (parties, concerts, watch parties, pickup sports, networking, campus events), plus a secondary audience of organizers, promoters, and sports hosts who need to get their events in front of the right people.

## User Roles

Attendee — discovers, saves, and RSVPs to events and follows organizers.
Organizer / Promoter — creates and manages events and builds a following.
Sports Host — posts pickup runs with player counts, positions, and skill level.

## User Personas

Attendee


Maya, 20 — college sophomore. New to the area and into Afrobeats nights and campus events. She hears about most things too late, through group chats, and wants one feed that shows what's worth going to this weekend.
Devin, 26 — young professional. Recently relocated for work and knows almost no one. He wants networking mixers and low-key social events, and would follow a few promoters to stay in the loop.


Organizer / Promoter


Tunde, 24 — nightlife promoter. Throws monthly parties and reposts the same flyer across Instagram, TikTok, and group chats. He wants one place to post, get discovered, and grow a following he owns.
Priya, 22 — campus club lead. Runs workshops and meetups for a student org. She's not a marketer and wants help writing event descriptions so her events show up when people search "free campus events."


Sports Host


Marcus, 28 — pickup soccer organizer. Runs a Sunday game and constantly chases people to confirm so he hits 10 players. He wants a roster that fills itself and shows spots remaining.
Leo, 19 — casual baller. Organizes weekend basketball runs and wants players to find the game, claim a spot, and see skill level so games stay balanced.



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

9. As a host, I want to post a run showing players needed, skill level, and spots filled, so that the right players can find it and see if there's room.

10. As a host, I want to see and manage who has claimed a spot, so that I know my run will actually have enough players to go ahead.

### Organizer / Promoter

11. As an organizer, I want to create an event with a flyer/image and details, so that people can discover and RSVP to it.

12. As an organizer, I want AI to suggest tags and help write my event description, so that my event reads well and surfaces in the right searches.

13. As an organizer, I want to see who has RSVP'd and how my event is performing, so that I can gauge interest and plan accordingly.

14. As an organizer, I want people to follow me and see my following grow, so that I can reach the right audience without reposting the same flyer everywhere.


## Decisions Log — User Stories

- **Story we debated the scope of**: "As a user, I want to host a pickup run with spots, skill level, and positions" — debated whether hosting a run should be its own role (Sports Host) or a capability of an existing role. Debated whether to prescribe the position-claiming mechanic in the story or leave it to implementation; decided to keep "spots, skill level, and positions" in the story because it's a distinctive product behavior, not a technical detail.
  **How we resolved it**: Collapsed Sports Host into an attendee/host capability rather than a standalone role, since hosting a run uses the same verb set as any user action (create, view, manage) and doesn't require elevated permissions like a promoter. Kept two roles — Attendee and Organizer/Promoter — with pickup runs treated as an event type rather than a third persona.

- **Story we cut (and why)**: Cut the standalone "Sports Host" role and its two stories as a separate section — the capabilities overlapped entirely with Organizer, and the difference was event-type-specific fields (skill level, spots) rather than a different actor. Re-homed the two stories under Attendee as host capabilities instead of deleting the functionality.

- **Story that changed after Claude's feedback**: Original: "As a sports host, I want to post a run..." and "As a sports host, I want to see and manage who has claimed a spot..." — Claude flagged that a role should be defined by distinct permissions, not by content type, and Sports Host shared Organizer's exact capabilities. Revised to: "As a host, I want to post a run showing players needed, skill level, and spots filled..." and "As a host, I want to see and manage who has claimed a spot..." — reframing host as a peer capability any attendee can use, not a separate role.

- **AI feature story: user benefit we landed on**: For "As an organizer, I want AI to suggest tags and help write my event description," described the benefit as the event reading well and surfacing in the right searches — what the organizer experiences (better discovery, less writing friction), not the model, the prompt, or the re-ranking pipeline behind it.

## Wireframe (Bonus)

<img width="1590" height="1050" alt="image" src="https://github.com/user-attachments/assets/31cd7eb9-ad22-4b93-852d-2d72ec03b176" />

