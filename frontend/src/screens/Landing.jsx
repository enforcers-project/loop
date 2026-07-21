import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Sparkles, Compass, Users } from 'lucide-react'
import { api } from '../lib/api'
import { CATEGORY_COLOR } from '../lib/utils'

/* Mini preview card used below the hero CTAs. */
function PreviewCard({ event }) {
  return (
    <Link
      to={event.isSports ? `/sports/${event.id}` : `/event/${event.id}`}
      className="group flex-shrink-0 overflow-hidden rounded-card bg-dark-card"
    >
      <div className="relative h-28 w-full overflow-hidden">
        <img
          src={event.poster}
          alt={event.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span
          className="absolute left-2 top-2 rounded-pill px-2 py-0.5 text-[10px] font-semibold text-white"
          style={{ backgroundColor: CATEGORY_COLOR[event.category] }}
        >
          {event.category}
        </span>
      </div>
      <div className="p-3">
        <p className="truncate font-display text-sm font-bold text-white">{event.title}</p>
        <p className="mt-0.5 truncate text-xs text-white/55">
          {event.date} · {event.isFree ? 'Free' : event.price}
        </p>
      </div>
    </Link>
  )
}

/* Skeleton placeholder matching PreviewCard's footprint so the hero preview
   grid and carousel hold their shape (no layout shift / blank row) while the
   popular-events fetch is in flight. */
function PreviewCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card bg-dark-card">
      <div className="loop-skeleton h-28 w-full" />
      <div className="space-y-2 p-3">
        <div className="loop-skeleton h-3.5 w-3/4 rounded" />
        <div className="loop-skeleton h-3 w-1/2 rounded" />
      </div>
    </div>
  )
}

const VALUE_PROPS = [
  {
    icon: Sparkles,
    title: 'A feed that learns you',
    body: 'Loop’s AI reads what you save, RSVP and follow to surface events you’ll actually love.',
  },
  {
    icon: Compass,
    title: 'Discover everything nearby',
    body: 'Afrobeats rooftops, pickup runs, food markets and campus nights all in one place.',
  },
  {
    icon: Users,
    title: 'Go with your people',
    body: 'See who’s going, follow your favorite organizers and never miss a moment.',
  },
]

export function Landing() {
  const [events, setEvents] = useState(null)
  useEffect(() => {
    api.events({ sort: 'popular' }).then((rows) => setEvents(rows ?? []))
  }, [])

  const loading = events === null
  const preview = (events ?? []).slice(0, 3)
  const carousel = (events ?? []).slice(0, 8)

  return (
    <div className="min-h-screen bg-white">
      {/* dark hero */}
      <div className="relative overflow-hidden bg-ink">
        {/* blurred bg image */}
        {events?.[0] && (
          <img
            src={events[0].poster}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-md"
          />
        )}
        <div className="relative">
          <LandingNav />

          <div className="mx-auto max-w-[1440px] px-5 pb-10 pt-8 text-center sm:pb-14 sm:pt-10 md:pt-16">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
              <Sparkles size={13} /> AI-powered local discovery
            </span>
            <h1 className="mx-auto mt-5 max-w-4xl font-display text-4xl font-bold leading-[1.05] text-white sm:text-5xl md:text-[88px]">
              Find your next <span className="text-primary">night out.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-white/60 md:text-lg">
              The events near you, ranked by what you actually love. Parties, pickup runs, food
              markets and more.
            </p>

            {/* CTAs */}
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/auth?mode=signup"
                className="rounded-button bg-accent px-6 py-3.5 text-sm font-semibold text-white transition-transform active:scale-95"
              >
                Get started
              </Link>
              <Link
                to="/feed"
                className="rounded-button border border-white/20 px-6 py-3.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Explore the feed
              </Link>
            </div>

            {/* mini search bar */}
            <div className="mx-auto mt-9 flex max-w-lg items-center gap-2 rounded-input bg-white px-4 py-3 shadow-hero">
              <Search size={18} className="text-text-muted" />
              <input
                placeholder="Try 'free Afrobeats party this weekend'"
                className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-placeholder"
              />
              <Link
                to="/discover"
                className="rounded-button bg-primary px-3.5 py-1.5 text-xs font-semibold text-white"
              >
                Search
              </Link>
            </div>

            {/* 3 event preview cards */}
            <div className="mx-auto mt-6 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => <PreviewCardSkeleton key={i} />)
                : preview.map((e) => <PreviewCard key={e.id} event={e} />)}
            </div>
          </div>

          {/* horizontal carousel */}
          <div className="mx-auto max-w-[1440px] px-5 pb-16">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/55">
              Happening near you
            </p>
            <div className="scrollbar-hide flex snap-x snap-proximity gap-4 overflow-x-auto pb-2">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="w-64 flex-shrink-0 snap-start">
                      <PreviewCardSkeleton />
                    </div>
                  ))
                : carousel.map((e) => (
                    <div key={e.id} className="w-64 flex-shrink-0 snap-start">
                      <PreviewCard event={e} />
                    </div>
                  ))}
            </div>
          </div>
        </div>
      </div>

      {/* gradient seam */}
      <div className="h-20 bg-gradient-to-b from-ink to-white" />

      {/* value props */}
      <section className="mx-auto max-w-[1140px] px-5 pb-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {VALUE_PROPS.map((v) => (
            <div
              key={v.title}
              className="rounded-card border border-border-light bg-white p-6 shadow-card"
            >
              <span className="grid h-11 w-11 place-items-center rounded-button bg-primary-light text-primary">
                <v.icon size={22} />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-ink">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{v.body}</p>
            </div>
          ))}
        </div>

        {/* single CTA */}
        <div className="mt-12 text-center">
          <h2 className="font-display text-3xl font-bold text-ink sm:text-4xl">
            Your city is happening. Don’t miss it.
          </h2>
          <Link
            to="/auth?mode=signup"
            className="mt-6 inline-block rounded-button bg-accent px-7 py-3.5 text-sm font-semibold text-white transition-transform active:scale-95"
          >
            Join Loop
          </Link>
        </div>
      </section>
    </div>
  )
}

/* The landing page renders its own transparent nav over the dark hero. */
function LandingNav() {
  return (
    <div className="border-b border-white/10">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5">
        <Link to="/" className="flex items-center">
          <img src="/logo.png" alt="Loop" className="h-7 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/auth?mode=login"
            className="rounded-button px-4 py-2 text-sm font-semibold text-white/80 hover:text-white"
          >
            Log in
          </Link>
          <Link
            to="/auth?mode=signup"
            className="rounded-button bg-accent px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-95"
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  )
}
