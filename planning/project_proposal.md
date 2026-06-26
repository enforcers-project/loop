# Project Proposal

Pod Members: **Benny Nketia, Heartwill Gbekle, Mussie Aregay**

## Problem Statement

Local events are scattered across Instagram flyers, group chats, TikTok, Eventbrite, and word of mouth, so people constantly miss things happening near them. There's no single place to reliably find events that match your interests, location, and timing. Our target audience is everyday people looking for things to do — parties, concerts, watch parties, pickup sports, networking, and campus events — plus a secondary audience of organizers, promoters, and sports hosts who struggle to get their events in front of the right people.

## Description

Loop is an AI-powered platform that helps people discover local events through a personalized feed and natural-language search, while giving organizers and sports hosts one place to post and grow their events. The main purpose is to get the right event in front of the right person at the right moment. Attendees sign up, pick a few interests, and get a personalized "For You" feed; they search how they actually talk ("free events this weekend"), save and RSVP to events, and follow organizers they like. Organizers post an event once and let AI auto-tag it and help write the description, so it reaches the right people without manual work.

## Expected Features List

- User accounts with roles: attendee, organizer/promoter, and sports host
- Event posting with flyer, title, date/time, location, category, price, capacity, age requirement, and RSVP
- Extra fields for pickup sports: players needed, players signed up, skill level, position, indoor/outdoor
- Searchable event feed with keyword, category, and location filters
- Save and RSVP to events
- Follow organizers and see their upcoming events
- Onboarding interest selection that seeds a new user's feed
- AI behavior-based recommendation engine (our headline AI feature) — a personalized "For You" feed
- AI natural-language search — maps how people talk to the right events
- Supporting AI (if time allows): auto-categorization/tagging of events and AI-generated event descriptions/captions
- Stretch goals: map view, ticketing/payments, QR check-in, promoter analytics, AI flyer images, TikTok-style feed

## Related Work

Similar apps include: 
- Eventbrite (ticketing, but weak discovery and no personalization)
- Meetup (built around recurring groups, not one-off local events)
- Partiful and Luma (great for events you're already invited to, not for discovering new ones)
- Posh/Fatsoma (nightlife ticketing only), and Instagram/TikTok (flyers with reach but no structure, search, or RSVP).

Loop stands out by being AI-native discovery across the categories these tools split apart — nightlife, sports, networking, and campus events all live in one personalized feed. Our recommendation engine and natural-language search help users find the right event even when they don't know what to search for, and our dedicated pickup-sports feature (player counts, positions, skill level) is something none of these offer.

## Open Questions

- How much seed event data (we're starting from Ticketmaster data) do we need so the feed and search feel full in the demo?
- How do we pre-filter events (by location, date, category) before the AI ranks them, so recommendations stay fast and don't send the whole database to the model?
- Where's the line between "map a search into filters" (realistic) and a full semantic search engine (out of scope) for natural-language search?
- How precise does "near me" need to be — do we ask for location permission, let users set a city, or both?
- How much of the social layer (follow, feed, comments) do we build for the MVP versus leave as future work?
