import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, MapPin, MessageSquare, ShieldCheck, Share2 } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { CATEGORY_COLOR } from '../lib/utils'
import {
  FollowBtn,
  GoingStack,
  IconButton,
  PageLoader,
  RSVPBtn,
  SaveBtn,
  StickyRsvpBar,
  VerifiedBadge,
} from '../components/primitives'
import { EventCard } from '../components/EventCard'
import { EventMap } from '../components/EventMap'
import { OrganizerFooterCard } from '../components/OrganizerFooterCard'

// Format an ISO instant into "9:00 PM" so the hero can pair date + time on one
// line ("Sun, Jul 19 · 9:00 PM"). Guards missing / unparseable values so the
// row falls back to the pure date string instead of showing "Invalid Date".
function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function EventDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { savedIds, goingIds, followingIds, toggleSaved, toggleGoing, toggleFollow } = useApp()
  const toast = useToast()
  const [event, setEvent] = useState(null)
  const [related, setRelated] = useState([])
  // Local "going" count so the header + GoingStack update immediately on RSVP;
  // seeded from the event's denormalized rsvp_count (see OrganizerProfile's
  // follower-count pattern).
  const [goingCount, setGoingCount] = useState(0)

  // Whether to show the floating StickyRsvpBar. Hidden while the hero CTA is
  // still on screen (redundant control), revealed once it scrolls off so the
  // user never loses the RSVP action on a long page.
  const [pillVisible, setPillVisible] = useState(false)
  const heroCtaRef = useRef(null)

  useEffect(() => {
    if (!id) return
    api.event(id).then((e) => {
      setEvent(e)
      setGoingCount(e?.rsvpCount ?? 0)
    })
    api.related(id).then(setRelated)
  }, [id])

  // Reveal the sticky pill only after the hero CTA scrolls out of view. Skips
  // when the hero CTA hasn't mounted yet (initial load) so the pill doesn't
  // flash in before the page paints.
  useEffect(() => {
    const el = heroCtaRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setPillVisible(!entry.isIntersecting), {
      rootMargin: '0px 0px -40px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [event])

  // Share the event using the platform's native share sheet when available
  // (mobile + secure contexts on Chrome/Edge/Safari); fall back to copying the
  // link and toasting so desktop users still get something to send friends.
  // Nightlife/social events grow through invites, so Share is a first-class
  // action alongside Save and RSVP.
  const onShare = useCallback(async () => {
    if (!event) return
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const payload = {
      title: event.title,
      text: `Come with me to ${event.title}${event.date ? ` — ${event.date}` : ''}`,
      url,
    }
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(payload)
        return
      } catch {
        // User cancelled or a permissions issue — fall through to copy so the
        // click never becomes a no-op.
      }
    }
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url)
        toast.success('Link copied.')
        return
      } catch {
        // Silent — the toast below still fires as a last resort.
      }
    }
    toast.info(`Share this link: ${url}`)
  }, [event, toast])

  if (!event) return <PageLoader label="Loading event" />

  const saved = savedIds.has(event.id)
  const going = goingIds.has(event.id)
  const following = event.organizer ? followingIds.has(event.organizer.id) : false
  const hasAbout = Boolean(event.description?.trim())
  const timeStr = formatTime(event.isoDate)
  // Prefer "{event.date} · {time}" when both exist; the mock seed's date field
  // already includes time so we detect that and skip the double-print.
  const dateHasTime = event.date && /\d{1,2}(:\d{2})?\s*[AP]M/i.test(event.date)
  const dateLine = timeStr && !dateHasTime ? `${event.date} · ${timeStr}` : event.date

  // RSVP, then keep the local count in step with the action we just took. The
  // backend moves rsvp_count only on going-transitions, so mirror that here.
  // toggleGoing returns the resulting state (null if login-gated, or the prior
  // state on failure/rollback) — only adjust when the state actually changed.
  const onRsvp = async () => {
    const wasGoing = goingIds.has(event.id)
    const result = await toggleGoing(event.id)
    if (result === null || result === wasGoing) return
    setGoingCount((c) => Math.max(0, c + (result ? 1 : -1)))
  }

  return (
    <main id="main" className="pb-24 md:pb-24">
      {/* dark immersive header */}
      <div className="relative overflow-hidden bg-ink">
        <img
          src={event.poster}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-md"
        />
        <div className="relative mx-auto max-w-[1140px] px-5 py-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-6 flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
          >
            <ArrowLeft size={18} /> Back
          </button>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-[440px_1fr]">
            {/* poster */}
            <img
              src={event.poster}
              alt={event.title}
              className="h-80 w-full rounded-card object-cover shadow-hero md:h-[520px]"
            />

            {/* info */}
            <div className="text-white">
              {/* Category chip — translucent on dark so the pink CATEGORY_COLOR
                  never competes with the RSVP button. The colored dot preserves
                  the category identity signal at a fraction of the visual weight. */}
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLOR[event.category] }}
                  aria-hidden="true"
                />
                {event.category}
              </span>
              <h1 className="mt-4 font-display text-3xl font-bold leading-tight md:text-5xl">
                {event.title}
              </h1>

              {/* organizer + follow */}
              {event.organizer && (
                <div className="mt-5 flex items-center gap-3">
                  <Link to={`/organizer/${event.organizer.id}`} className="flex items-center gap-2">
                    <img
                      src={event.organizer.avatar}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                    <span className="flex items-center gap-1 font-semibold">
                      {event.organizer.name}
                      {event.organizer.verified && <VerifiedBadge size={16} />}
                    </span>
                  </Link>
                  <FollowBtn
                    following={following}
                    onToggle={() => toggleFollow(event.organizer.id)}
                    sm
                  />
                </div>
              )}

              {/* meta rows — trimmed to two lines (date+time / venue) plus an
                  optional age row when the event enforces it. The About section
                  no longer duplicates these, so this is now the canonical read
                  above the fold. */}
              <div className="mt-6 space-y-3 text-sm text-white/85">
                <div className="flex items-center gap-2.5">
                  <Calendar size={18} className="text-white/60" /> {dateLine}
                </div>
                <div className="flex items-center gap-2.5">
                  <MapPin size={18} className="text-white/60" /> {event.venueName}, {event.city}
                </div>
                {event.ageRestriction && (
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck size={18} className="text-white/60" /> {event.ageRestriction}
                  </div>
                )}
              </div>

              {/* Social-proof + scarcity card — GoingStack on the left carries
                  the "who's going" signal, right side pairs spots-left with the
                  price so the two most decision-critical numbers sit together. */}
              <div className="mt-6 flex items-center justify-between rounded-card bg-white/10 p-4 backdrop-blur-sm">
                <GoingStack count={goingCount} avatars={event.goingAvatars} size="md" />
                <div className="flex flex-col items-end">
                  <span className="text-xl font-bold">{event.isFree ? 'Free' : event.price}</span>
                  {event.capacity != null && (
                    <span className="text-xs text-white/70">
                      {Math.max(0, event.capacity - goingCount)} spots left
                    </span>
                  )}
                </div>
              </div>

              {/* CTAs — ref anchors the sticky-pill IntersectionObserver */}
              <div ref={heroCtaRef} className="mt-4 flex items-center gap-3">
                <RSVPBtn variant={going ? 'outline' : 'filled'} onClick={onRsvp}>
                  {going ? "You're going ✓" : 'RSVP now'}
                </RSVPBtn>
                <SaveBtn saved={saved} onToggle={() => toggleSaved(event.id)} />
                <IconButton onClick={onShare} label="Share event">
                  <Share2 size={18} />
                </IconButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* light body — single column so the map + organizer card get real
          width; About/Comments stay capped narrow for readability. */}
      <div className="mx-auto max-w-[1140px] space-y-8 px-5 py-10">
        {/* About — only renders when the organizer wrote copy. All structured
            facts (date/venue/price/age/capacity) now live in the hero, so this
            section no longer duplicates them; the tag row is the only extra
            signal below the paragraph. */}
        {(hasAbout || event.tags?.length > 0) && (
          <section className="mx-auto max-w-[860px]">
            {hasAbout && (
              <>
                <h2 className="font-display text-2xl font-bold text-ink">About this event</h2>
                <p className="mt-3 leading-relaxed text-text-secondary">{event.description}</p>
              </>
            )}
            {event.tags?.length > 0 && (
              <div className={hasAbout ? 'mt-6 flex flex-wrap gap-2' : 'flex flex-wrap gap-2'}>
                {event.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-pill border border-border-light bg-white px-3 py-1 text-xs font-medium text-text-secondary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Full-width map — real interactive Google Maps embed, replacing the
            broken static-OSM tile + floating pin fallback. */}
        <EventMap
          lat={event.lat}
          lng={event.lng}
          venueName={event.venueName}
          city={event.city}
          address={event.address}
        />

        {/* Comments — real posts only. Empty state invites the first commenter
            instead of faking activity with hardcoded demo authors that appear
            on every event including 0-going ones. Post is disabled until the
            backend endpoint lands so the button never fires a lying toast. */}
        <section className="mx-auto max-w-[860px]">
          <h2 className="font-display text-2xl font-bold text-ink">Comments</h2>
          <div className="mt-4 flex flex-col items-center gap-2 rounded-card border border-dashed border-border-light bg-surface px-6 py-10 text-center">
            <MessageSquare size={24} className="text-text-muted" aria-hidden="true" />
            <p className="text-sm font-semibold text-ink">Be the first to say something</p>
            <p className="max-w-sm text-xs text-text-muted">
              Comments are coming soon — check back once RSVPs pick up.
            </p>
          </div>
        </section>

        {/* Organizer footer — hosted-by module with follow + link to profile.
            eventCount is intentionally omitted until the backend surfaces a
            real count on the organizer; a fabricated related.length+1 is worse
            than showing nothing. */}
        <OrganizerFooterCard organizer={event.organizer} />

        {/* Related events — full-width discovery moment. Heading matches peer
            sections (h2) for consistent typography and a11y outline. */}
        {related.length > 0 && (
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-bold text-ink">
                {event.organizer ? `More from ${event.organizer.name}` : 'More events'}
              </h2>
              {event.organizer && (
                <Link
                  to={`/organizer/${event.organizer.id}`}
                  className="text-sm font-semibold text-primary hover:opacity-80"
                >
                  See all →
                </Link>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.slice(0, 3).map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Sticky pill CTA — floats in only after the hero CTA scrolls off so
          it's never redundant with the primary button. */}
      <StickyRsvpBar
        title={event.title}
        poster={event.poster}
        price={event.price}
        isFree={event.isFree}
        going={going}
        saved={saved}
        onRsvp={onRsvp}
        onSave={() => toggleSaved(event.id)}
        onShare={onShare}
        visible={pillVisible}
      />
    </main>
  )
}
