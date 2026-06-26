# Project Plan

Pod Members: **Benny Nketia, Heartwill Gbekle, Mussie Aregay**

## Problem Statement and Description

Local events are scattered across Instagram flyers, group chats, TikTok, and Eventbrite, so people constantly miss things happening near them — and organizers can't reach the right audience without reposting the same flyer everywhere. EventAI is an AI-powered platform that helps people discover local events through a personalized "For You" feed and natural-language search, while giving organizers and sports hosts one place to post and grow their events. Our headline AI feature is a behavior-based recommendation engine, seeded by the interests a user picks at signup and refined over time from what they save, search, RSVP to, and follow.
## User Roles and Personas

Attendee — discovers, saves, and RSVPs to events and follows organizers. Persona: Maya, 20, a college student who wants one feed showing what's worth going to this weekend.
Organizer / Promoter — creates and manages events and builds a following. Persona: Tunde, 24, a nightlife promoter tired of reposting the same flyer across five platforms.
Sports Host — posts pickup runs with player counts, positions, and skill level. Persona: Marcus, 28, who runs a Sunday soccer game and wants a roster that fills itself.

## User Stories

As an attendee, I want to pick my interests at signup, so that my feed is relevant from day one.
As an attendee, I want a personalized "For You" feed, so that I see events matching my taste without searching.
As an attendee, I want to search in plain language ("free events this weekend"), so that I find events without exact keywords.
As an attendee, I want to filter by category, location, and date, so that I can narrow things down.
As an attendee, I want to save and RSVP to events, so that I can track what I'm attending.
As an attendee, I want to follow organizers, so that their events appear in my feed.
As an organizer, I want to create an event with a flyer and details, so that people can discover and RSVP.
As an organizer, I want AI to auto-tag and help write my event description, so that it surfaces in searches and reads well.
As a sports host, I want to post a run with players-needed and skill level, so that the right players can join.
As an attendee, I want to join a pickup run and claim a spot, so that I secure my place in the game.

## Pages/Screens

Landing / Login / Signup, Onboarding (interest selection), Home / "For You" Feed, Search Results, Event Detail, Create Event, Organizer Profile, Saved / My RSVPs, and Profile / Settings.

<img width="1590" height="1050" alt="image" src="https://github.com/user-attachments/assets/02dc3dad-26ef-4cc2-924c-4c85bf742f3b" />




## Data Model

EntityKey fieldsUserid, name, email, password_hash, role, locationEventid, organizer_id → User, title, description, flyer_url, starts_at, location, category, price, capacity, age_requirementSportsDetailevent_id → Event, players_needed, skill_level, position, indoor_outdoor (optional, 1:1 with sports events)RSVPid, user_id → User, event_id → Event, statusSavedEventuser_id → User, event_id → EventFollowfollower_id → User, organizer_id → UserInterest / UserInterestuser's onboarding interest picksEventTagid, event_id → Event, tag (AI-generated)

Relationships: a User (organizer) has many Events; Users RSVP to / save many Events (many-to-many); Users follow many organizers; an Event optionally has one SportsDetail and many AI-generated EventTags.



## Endpoints

Auth: POST /auth/signup, POST /auth/login
Users: GET /users/:id, PATCH /users/:id, POST /users/:id/interests, GET /users/:id/saved
Events: GET /events (filters), POST /events, GET /events/:id, PATCH /events/:id, DELETE /events/:id
Engagement: POST|DELETE /events/:id/rsvp, POST|DELETE /events/:id/save, POST /events/:id/join, POST|DELETE /organizers/:id/follow
AI: POST /recommendations (For You feed), POST /search (natural-language search), POST /events/:id/autotag, POST /ai/generate-description

***Don't forget to set up your Issues, Milestones, and Project Board!***
