import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, Clock, MapPin, Users } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { CATEGORY_COLOR } from '../lib/utils'
import {
  FollowBtn,
  GoingStack,
  PageLoader,
  RSVPBtn,
  SaveBtn,
  StickyRsvpBar,
  VerifiedBadge,
} from '../components/primitives'
import { EventCard } from '../components/EventCard'
import { EventMap } from '../components/EventMap'
import { OrganizerFooterCard } from '../components/OrganizerFooterCard'

const DEMO_COMMENTS = [
  {
    id: 'c1',
    author: 'dami_o',
    avatar: 'https://i.pravatar.cc/150?img=5',
    text: 'This is going to be huge 🔥 who’s coming?',
  },
  {
    id: 'c2',
    author: 'bay_kt',
    avatar: 'https://i.pravatar.cc/150?img=8',
    text: 'Bought my ticket, see you there!',
  },
]

// Format an ISO instant into "9:00 PM" for the spec sheet. Guards a missing /
// unparseable value so the row is skipped instead of showing "Invalid Date".
function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function EventDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { savedIds, goingIds, followingIds, toggleSaved, toggleGoing, toggleFollow, requireAuth } =
    useApp()
  const toast = useToast()
  const [event, setEvent] = useState(null)
  const [related, setRelated] = useState([])
  const [comment, setComment] = useState('')
  // Local "going" count so the header + GoingStack update immediately on RSVP;
  // seeded from the event's denormalized rsvp_count (see OrganizerProfile's
  // follower-count pattern).
  const [goingCount, setGoingCount] = useState(0)

  // Whether to show the floating StickyRsvpBar. Hidden while the hero CTA is
  // still on screen (redundant control), revealed once it scrolls off so the
  // user never loses the RSVP action on a long page.
  const [pillVisible, setPillVisible] = useState(false)
  const heroCtaRef = useRef(null)

  // Commenting is a member action: gate logged-out users to /auth first.
  const postComment = () => {
    if (!requireAuth()) return
    if (!comment.trim()) return
    // Persisting comments is a later issue; for now confirm the gated action
    // works end-to-end and clear the box.
    toast.success('Comment posted.')
    setComment('')
  }

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
    const io = new IntersectionObserver(
      ([entry]) => setPillVisible(!entry.isIntersecting),
      { rootMargin: '0px 0px -40px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [event])

  // Precompute spec-sheet rows: only fields the current event actually has.
  // Rendered as a dl below the About paragraph so a short-copy event still
  // reads as a complete detail page (Date / Time / Venue / Price / Age).
  const specs = useMemo(() => {
    if (!event) return []
    const rows = []
    if (event.date) rows.push({ label: 'Date', value: event.date })
    const time = formatTime(event.isoDate)
    if (time) rows.push({ label: 'Time', value: time })
    if (event.venueName) {
      rows.push({
        label: 'Venue',
        value: [event.venueName, event.city].filter(Boolean).join(', '),
      })
    }
    rows.push({ label: 'Price', value: event.isFree ? 'Free' : event.price || 'TBA' })
    if (event.ageRestriction) rows.push({ label: 'Age', value: event.ageRestriction })
    if (event.capacity != null) {
      rows.push({ label: 'Capacity', value: `${event.capacity} people` })
    }
    return rows
  }, [event])

  if (!event) return <PageLoader label="Loading event" />

  const saved = savedIds.has(event.id)
  const going = goingIds.has(event.id)
  const following = event.organizer ? followingIds.has(event.organizer.id) : false
  const hasAbout = Boolean(event.description?.trim())

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
    <div className="pb-24 md:pb-24">
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

          <div className="grid grid-cols-1 gap-8 md:grid-cols-[360px_1fr]">
            {/* poster */}
            <img
              src={event.poster}
              alt={event.title}
              className="h-80 w-full rounded-card object-cover shadow-hero md:h-[440px]"
            />

            {/* info */}
            <div className="text-white">
              <span
                className="inline-block rounded-pill px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: CATEGORY_COLOR[event.category] }}
              >
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

              {/* meta rows */}
              <div className="mt-6 space-y-3 text-sm text-white/85">
                <div className="flex items-center gap-2.5">
                  <Calendar size={18} className="text-white/60" /> {event.date}
                </div>
                <div className="flex items-center gap-2.5">
                  <MapPin size={18} className="text-white/60" /> {event.venueName}, {event.city}
                </div>
                <div className="flex items-center gap-2.5">
                  <Users size={18} className="text-white/60" />
                  {goingCount} going
                  {event.capacity != null &&
                    ` · ${Math.max(0, event.capacity - goingCount)} spots left`}
                </div>
                {event.ageRestriction && (
                  <div className="flex items-center gap-2.5">
                    <Clock size={18} className="text-white/60" /> {event.ageRestriction}
                  </div>
                )}
              </div>

              {/* GoingStack card */}
              <div className="mt-6 flex items-center justify-between rounded-card bg-white/10 p-4 backdrop-blur-sm">
                <GoingStack count={goingCount} avatars={event.goingAvatars} size="md" />
                <span className="text-xl font-bold">{event.isFree ? 'Free' : event.price}</span>
              </div>

              {/* CTAs — ref anchors the sticky-pill IntersectionObserver */}
              <div ref={heroCtaRef} className="mt-4 flex items-center gap-3">
                <RSVPBtn variant={going ? 'outline' : 'filled'} onClick={onRsvp}>
                  {going ? "You're going ✓" : 'RSVP now'}
                </RSVPBtn>
                <SaveBtn saved={saved} onToggle={() => toggleSaved(event.id)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* light body — single column so the map + organizer card get real
          width; About/Comments stay capped narrow for readability. */}
      <div className="mx-auto max-w-[1140px] space-y-8 px-5 py-10">
        {/* About + spec sheet — always renders because Date/Venue/Price
            guarantee ≥1 spec row, so the section never becomes an orphan
            heading. Long-copy events show the paragraph above the specs. */}
        <section className="mx-auto max-w-[860px]">
          <h2 className="font-display text-xl font-bold text-ink">About this event</h2>
          {hasAbout && (
            <p className="mt-3 leading-relaxed text-text-secondary">{event.description}</p>
          )}
          {specs.length > 0 && (
            <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {specs.map((row) => (
                <div key={row.label} className="border-b border-border-light py-2">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    {row.label}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {event.tags?.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
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

        {/* Full-width map — real interactive Google Maps embed, replacing the
            broken static-OSM tile + floating pin fallback. */}
        <EventMap
          lat={event.lat}
          lng={event.lng}
          venueName={event.venueName}
          city={event.city}
          address={event.address}
        />

        {/* Comments — capped narrow to match About */}
        <section className="mx-auto max-w-[860px]">
          <h2 className="font-display text-xl font-bold text-ink">
            Comments ({DEMO_COMMENTS.length})
          </h2>
          <div className="mt-4 space-y-4">
            {DEMO_COMMENTS.map((c) => (
              <div key={c.id} className="flex gap-3">
                <img src={c.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                <div>
                  <span className="text-sm font-semibold text-ink">{c.author}</span>
                  <p className="text-sm text-text-secondary">{c.text}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 rounded-input border border-border-light px-4 py-2.5">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && postComment()}
                placeholder="Add a comment…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-placeholder"
              />
              <button onClick={postComment} className="text-sm font-semibold text-primary">
                Post
              </button>
            </div>
          </div>
        </section>

        {/* Organizer footer — hosted-by module with follow + link to profile */}
        <OrganizerFooterCard organizer={event.organizer} eventCount={related.length + 1} />

        {/* Related events — moved out of the sidebar into a full-width row so
            the discovery moment is proportional to the event page. */}
        {related.length > 0 && (
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h3 className="font-display text-lg font-bold text-ink">More events</h3>
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
        poster={event.poster}
        price={event.price}
        isFree={event.isFree}
        going={going}
        saved={saved}
        onRsvp={onRsvp}
        onSave={() => toggleSaved(event.id)}
        visible={pillVisible}
      />
    </div>
  )
}
