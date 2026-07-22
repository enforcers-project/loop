import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Sparkles, Compass, Users } from 'lucide-react'
import {
  m,
  AnimatePresence,
  useScroll,
  useTransform,
  useInView,
  useMotionValue,
  useAnimationFrame,
  useReducedMotion,
  animate,
} from 'motion/react'
import { api } from '../lib/api'
import { CATEGORY_COLOR, formatCount } from '../lib/utils'
import {
  heroStagger,
  heroRise,
  wordParent,
  wordChild,
  staggerParent,
  fadeUp,
  springSnappy,
} from '../lib/motion'

// Link, but animatable — lets the hero/nav CTAs carry the same whileHover /
// whileTap spring the in-app buttons (RSVPBtn) use, while still routing.
// Created once at module scope so it isn't rebuilt on every render.
const MotionLink = m.create(Link)

// The headline, tokenized so each word can reveal on its own beat and the
// closing "night out." keeps the accent color. See the masked reveal below.
const HEADLINE = [
  { text: 'Find', accent: false },
  { text: 'your', accent: false },
  { text: 'next', accent: false },
  { text: 'night', accent: true },
  { text: 'out.', accent: true },
]

// Placeholder prompts that cycle in the hero search bar to hint at what the AI
// understands. Kept short so they never wrap inside the pill.
const SEARCH_HINTS = [
  'free Afrobeats party this weekend',
  'pickup basketball tonight',
  'food markets near me',
  'rooftop day parties',
]

/* Mini preview card used below the hero CTAs. Now an animatable Link so the
   whole card lifts on hover (the inner image already scales) for a more
   premium, tactile feel; springSnappy matches the app's other tap targets. */
function PreviewCard({ event }) {
  return (
    <MotionLink
      to={event.isSports ? `/sports/${event.id}` : `/event/${event.id}`}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.97 }}
      transition={springSnappy}
      className="group flex h-full flex-shrink-0 flex-col overflow-hidden rounded-card bg-dark-card"
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
    </MotionLink>
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

/* --------------------------------------------------------------------------
   Marquee — the "Happening near you" row auto-scrolls horizontally forever,
   pausing when hovered or keyboard-focused. Built with useAnimationFrame on a
   motion value (not CSS) so speed is frame-rate independent and the pause is
   instant. We render the list twice and wrap x at half the track width, so the
   loop is seamless. Reduced-motion users get the original manual scroll row.
-------------------------------------------------------------------------- */
function Marquee({ events }) {
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const trackRef = useRef(null)
  const halfRef = useRef(0)
  const pausedRef = useRef(false)

  // Half the track = exactly one copy of the list; scroll by that, then wrap.
  useEffect(() => {
    const measure = () => {
      if (trackRef.current) halfRef.current = trackRef.current.scrollWidth / 2
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [events])

  useAnimationFrame((_, delta) => {
    if (reduce || pausedRef.current || !halfRef.current) return
    const speed = 40 // px per second — slow enough to read each card
    let next = x.get() - (speed * delta) / 1000
    if (next <= -halfRef.current) next += halfRef.current // seamless wrap
    x.set(next)
  })

  if (reduce) {
    return (
      <div className="scrollbar-hide flex snap-x snap-proximity gap-4 overflow-x-auto pb-2">
        {events.map((e) => (
          <div key={e.id} className="w-64 flex-shrink-0 snap-start">
            <PreviewCard event={e} />
          </div>
        ))}
      </div>
    )
  }

  const doubled = [...events, ...events]
  return (
    <div
      className="overflow-hidden"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
      onFocusCapture={() => (pausedRef.current = true)}
      onBlurCapture={() => (pausedRef.current = false)}
    >
      <m.div ref={trackRef} style={{ x }} className="flex w-max gap-4 pb-2">
        {doubled.map((e, i) => (
          // Second copy is decorative/duplicated, so it's hidden from the a11y
          // tree — a screen reader shouldn't hear every event twice.
          <div key={i} className="w-64 flex-shrink-0" aria-hidden={i >= events.length}>
            <PreviewCard event={e} />
          </div>
        ))}
      </m.div>
    </div>
  )
}

/* --------------------------------------------------------------------------
   AnimatedSearchHint — an overlay that crossfades through SEARCH_HINTS to
   suggest what you can type. Shown only while the input is empty and unfocused;
   the real <input> keeps an empty placeholder so the two never double up.
-------------------------------------------------------------------------- */
function AnimatedSearchHint({ show }) {
  const [i, setI] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (!show || reduce) return
    const id = setInterval(() => setI((n) => (n + 1) % SEARCH_HINTS.length), 2800)
    return () => clearInterval(id)
  }, [show, reduce])

  if (!show) return null
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center overflow-hidden text-sm text-placeholder">
      <span className="flex-shrink-0">Try&nbsp;‘</span>
      <span className="relative min-w-0 flex-1">
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={reduce ? 0 : i}
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex items-center truncate"
          >
            {SEARCH_HINTS[reduce ? 0 : i]}
          </m.span>
        </AnimatePresence>
      </span>
      <span className="flex-shrink-0">’</span>
    </span>
  )
}

/* --------------------------------------------------------------------------
   StatCounter — counts up from 0 to `value` once it scrolls into view. Numbers
   are real (derived from the fetched feed below), so this reads as social proof
   rather than decoration. Honors reduce-motion by snapping to the final value.
-------------------------------------------------------------------------- */
function StatCounter({ value, suffix = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const reduce = useReducedMotion()
  const mv = useMotionValue(0)
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return
    // Subscribe first, then animate — the display always updates through the
    // motion value (no direct setState in the effect body). Reduce-motion snaps
    // by animating with zero duration.
    const unsub = mv.on('change', (v) => setDisplay(Math.round(v)))
    const controls = animate(mv, value, {
      duration: reduce ? 0 : 1.1,
      ease: [0.22, 1, 0.36, 1],
    })
    return () => {
      controls.stop()
      unsub()
    }
  }, [inView, value, reduce, mv])

  return (
    <span ref={ref}>
      {formatCount(display)}
      {suffix}
    </span>
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
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const navigate = useNavigate()
  const reduce = useReducedMotion()

  useEffect(() => {
    api.events({ sort: 'popular' }).then((rows) => setEvents(rows ?? []))
  }, [])

  const loading = events === null
  const preview = (events ?? []).slice(0, 3)
  const carousel = (events ?? []).slice(0, 8)

  // Real social-proof figures pulled from the fetched feed. Gated below so the
  // band only shows once there's a meaningful amount to boast about (never a
  // lonely "0 going").
  const goingTotal = (events ?? []).reduce((s, e) => s + (e.goingCount || 0), 0)
  const categoryCount = new Set((events ?? []).map((e) => e.category).filter(Boolean)).size
  const showStats = !loading && (events?.length ?? 0) >= 3 && goingTotal > 0

  // Scroll-linked parallax: the blurred hero backdrop drifts slower than the
  // foreground as the hero scrolls away. Disabled under reduce-motion.
  const heroRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const posterY = useTransform(scrollYProgress, [0, 1], ['-6%', '16%'])

  const showHint = q === '' && !focused
  const goSearch = () =>
    navigate(`/discover${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)

  return (
    <div className="min-h-screen bg-white">
      {/* dark hero */}
      <div ref={heroRef} className="relative overflow-hidden bg-ink">
        {/* blurred bg image (parallax) */}
        {events?.[0] && (
          <m.img
            src={events[0].poster}
            alt=""
            style={{ y: reduce ? 0 : posterY }}
            className="pointer-events-none absolute inset-x-0 -top-[10%] h-[120%] w-full scale-110 object-cover opacity-20 blur-md"
          />
        )}
        {/* living aurora glow behind the content (pure CSS, compositor-only) */}
        <div className="loop-aurora" aria-hidden="true" />

        <div className="relative">
          <LandingNav />

          {/* Hero content cascades in on load: badge → headline → subtitle →
              CTAs → search → preview grid, each rising on the shared spring. */}
          <m.div
            variants={heroStagger}
            initial="hidden"
            animate="show"
            className="mx-auto max-w-[1440px] px-5 pb-10 pt-8 text-center sm:pb-14 sm:pt-10 md:pt-16"
          >
            <m.span
              variants={heroRise}
              className="inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-3 py-1 text-xs font-medium text-white/80"
            >
              <Sparkles size={13} /> AI-powered local discovery
            </m.span>

            {/* Headline — each word slides up out of a clip mask, accent words
                last, so "night out." lands with a little punch. */}
            <m.h1
              variants={wordParent}
              className="mx-auto mt-5 flex max-w-4xl flex-wrap justify-center gap-x-[0.28em] gap-y-1 font-display text-4xl font-bold leading-[1.05] text-white sm:text-5xl md:text-[88px]"
            >
              {HEADLINE.map((w, i) => (
                <span key={i} className="inline-block overflow-hidden pb-[0.08em]">
                  <m.span
                    variants={wordChild}
                    className={`inline-block ${w.accent ? 'text-primary' : ''}`}
                  >
                    {w.text}
                  </m.span>
                </span>
              ))}
            </m.h1>

            <m.p
              variants={heroRise}
              className="mx-auto mt-5 max-w-xl text-base text-white/60 md:text-lg"
            >
              The events near you, ranked by what you actually love. Parties, pickup runs, food
              markets and more.
            </m.p>

            {/* CTAs */}
            <m.div
              variants={heroRise}
              className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <MotionLink
                to="/auth?mode=signup"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                transition={springSnappy}
                className="rounded-button bg-accent px-6 py-3.5 text-sm font-semibold text-white"
              >
                Get started
              </MotionLink>
              <MotionLink
                to="/feed"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                transition={springSnappy}
                className="rounded-button border border-white/20 px-6 py-3.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Explore the feed
              </MotionLink>
            </m.div>

            {/* mini search bar with cycling hint */}
            <m.div
              variants={heroRise}
              className="mx-auto mt-9 flex max-w-lg items-center gap-2 rounded-input bg-white px-4 py-3 shadow-hero"
            >
              <Search size={18} className="flex-shrink-0 text-text-muted" />
              <div className="relative flex-1">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => e.key === 'Enter' && goSearch()}
                  placeholder=""
                  aria-label="Search events"
                  className="w-full bg-transparent text-sm text-text-primary outline-none"
                />
                <AnimatedSearchHint show={showHint} />
              </div>
              <m.button
                type="button"
                onClick={goSearch}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                transition={springSnappy}
                className="flex-shrink-0 rounded-button bg-primary px-3.5 py-1.5 text-xs font-semibold text-white"
              >
                Search
              </m.button>
            </m.div>

            {/* 3 event preview cards */}
            <m.div
              variants={heroRise}
              className="mx-auto mt-6 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3"
            >
              {loading
                ? Array.from({ length: 3 }).map((_, i) => <PreviewCardSkeleton key={i} />)
                : preview.map((e) => <PreviewCard key={e.id} event={e} />)}
            </m.div>
          </m.div>

          {/* horizontal auto-scrolling carousel */}
          <m.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto max-w-[1440px] px-5 pb-16"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/55">
              Happening near you
            </p>
            {loading ? (
              <div className="scrollbar-hide flex snap-x snap-proximity gap-4 overflow-x-auto pb-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="w-64 flex-shrink-0 snap-start">
                    <PreviewCardSkeleton />
                  </div>
                ))}
              </div>
            ) : (
              <Marquee events={carousel} />
            )}
          </m.div>
        </div>
      </div>

      {/* gradient seam */}
      <div className="h-20 bg-gradient-to-b from-ink to-white" />

      {/* real-numbers social proof — counts up when scrolled into view */}
      {showStats && (
        <section className="mx-auto -mt-6 max-w-[1140px] px-5">
          <div className="grid grid-cols-3 gap-4 rounded-card border border-border-light bg-white p-6 text-center shadow-card sm:p-8">
            <div>
              <p className="font-display text-3xl font-bold text-primary sm:text-4xl">
                <StatCounter value={events.length} suffix="+" />
              </p>
              <p className="mt-1 text-xs font-medium text-text-secondary sm:text-sm">
                Events near you
              </p>
            </div>
            <div>
              <p className="font-display text-3xl font-bold text-primary sm:text-4xl">
                <StatCounter value={goingTotal} suffix="+" />
              </p>
              <p className="mt-1 text-xs font-medium text-text-secondary sm:text-sm">
                People going
              </p>
            </div>
            <div>
              <p className="font-display text-3xl font-bold text-primary sm:text-4xl">
                <StatCounter value={categoryCount} />
              </p>
              <p className="mt-1 text-xs font-medium text-text-secondary sm:text-sm">Categories</p>
            </div>
          </div>
        </section>
      )}

      {/* value props — reveal in a gentle stagger as they scroll into view */}
      <section className="mx-auto max-w-[1140px] px-5 pb-16 pt-16">
        <m.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 gap-6 md:grid-cols-3"
        >
          {VALUE_PROPS.map((v) => (
            <m.div
              key={v.title}
              variants={fadeUp}
              className="rounded-card border border-border-light bg-white p-6 shadow-card"
            >
              <span className="grid h-11 w-11 place-items-center rounded-button bg-primary-light text-primary">
                <v.icon size={22} />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-ink">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{v.body}</p>
            </m.div>
          ))}
        </m.div>

        {/* single CTA */}
        <m.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-12 text-center"
        >
          <h2 className="font-display text-3xl font-bold text-ink sm:text-4xl">
            Your city is happening. Don’t miss it.
          </h2>
          <MotionLink
            to="/auth?mode=signup"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="mt-6 inline-block rounded-button bg-accent px-7 py-3.5 text-sm font-semibold text-white"
          >
            Join Loop
          </MotionLink>
        </m.div>
      </section>
    </div>
  )
}

/* The landing page renders its own transparent nav over the dark hero. It
   fades down on load, just ahead of the hero cascade. */
function LandingNav() {
  return (
    <m.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="border-b border-white/10"
    >
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5">
        <Link to="/" className="flex items-center">
          <img src="/logo.png" alt="Loop" className="h-7 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <MotionLink
            to="/auth?mode=login"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="rounded-button px-4 py-2 text-sm font-semibold text-white/80 hover:text-white"
          >
            Log in
          </MotionLink>
          <MotionLink
            to="/auth?mode=signup"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="rounded-button bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Sign up
          </MotionLink>
        </div>
      </div>
    </m.div>
  )
}
