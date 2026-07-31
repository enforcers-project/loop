# Reflection #3

Pod Members: **Benny Nketia, Mussie Aregay, Heartwill Gbekle**

## Reflection Questions

* Name at least one thing that went well this sprint.

 A lot of Sprint 3 was about turning the MVP into something that actually feels like a real product, and that part landed. We got Posses (group RSVPs) working end-to-end — creating a posse, inviting friends, accept/decline, private posses only visible to invited members, and notifications that deep-link back to the posse. On top of that we shipped community reviews for events and organizers, sharing social posts into DMs, report + hide on posts/comments/stories, Load More + infinite scroll on Discover and For You, our AI assistant Loopy (with jailbreak hardening), and a proper dark-mode pass. We also expanded the seed catalog from 8 to 26 events so browsing doesn't feel empty during the demo.

* What challenges did your team face?

 The biggest challenge was scope creep from ourselves — every "small" polish item (share-to-DM, reviews, moderation, dark mode, pagination, DOB validation) individually felt tiny but collectively ate the sprint, and it pushed external event sync out again. We also had a run of auth and session bugs on mobile: the messenger stream dying when the JWT expired, the login response not returning the full user so avatars didn't show, and the messages widget covering the nav on small screens. The bug bash also surfaced a handful of UX issues we hadn't seen internally, which took a full day to triage and batch into fixes.

* Did you finish all of your planned tasks? If not, what contributed to that?

 Mostly yes on the social and polish side — posses, reviews, moderation, messaging depth, dark mode, pagination, and the bug-bash fixes all shipped. What slipped is external event sync (Ticketmaster / SeatGeek) — again — and the follows graph is still a soft boost in For You rather than a hard ranking signal. Two things contributed: we underestimated how much surface area posses would touch (invites, notifications, private visibility, join/leave), and the bug bash surfaced more real UX issues than we planned for, so we spent a chunk of the week triaging instead of building new things.

* What did the spec audit during the bug bash surface? Were there significant gaps between documented and actual behavior, and how did you address them? Is the Spec Reconciliation — Bug Bash section committed to your repo?

 The bug bash surfaced real gaps between what the spec described and what the app actually did. The "This Weekend" and "Today" quick filters weren't actually filtering — a Tuesday event was showing up under weekend. User search silently required 5+ characters before matching because it relied on trigram similarity. DOB validation accepted future dates and unrealistic ages. The story viewer didn't close when you tapped the backdrop, and the share modal had no way to copy a plain event link. We fixed the behavior so the code now matches the spec's intent. Honest answer on the section: the fixes themselves are committed, but a formal "Spec Reconciliation — Bug Bash" section has not been written back into the master spec yet — that's the first thing on our Sprint 4 punch list.

* Going into Sprint 4, is your master spec accurate? What sections still need updating?

 Mostly accurate for the core loop — the data model, auth, events, RSVP, NL search, and the recommender all match what's shipped. What still needs to be updated before demo: the social/features section needs Posses, community reviews, report/hide moderation, and Loopy added (none of these were in the original spec); the popular-events fallback section needs the defaults we actually picked written down (published, home city, next 30 days, ranked by save + RSVP); the "at risk" section needs external event sync moved from "at risk" to "stretch / cut"; and we need to add the Bug Bash reconciliation subsection capturing the filter, search, and DOB corrections.

* Which features and user stories are "at risk"? How will you change your plan for the final sprint?

 At risk going into Sprint 4:
 - **External event sync (Ticketmaster / SeatGeek).** Slipped two sprints in a row. Plan: officially cut it, demo on the 26-event native seed, mark as post-MVP.
 - **Push / email delivery for reminders.** Scheduler runs but no real provider is wired. Plan: ship email through one provider for the happy path only; SMS is out.
 - **Follows graph in For You ranking.** Currently a soft boost. Plan: leave as-is for demo, document the intended weight in the spec.
 - **Spec reconciliation writeback.** Plan: land the spec updates and the Bug Bash section in the first two days of Sprint 4 so the master spec matches the shipped app before demo day.
 - **Sports roster UI polish.** Read-only is fine for demo; the full join/leave flow stays as stretch.
