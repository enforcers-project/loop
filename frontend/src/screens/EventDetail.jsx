import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { m } from 'motion/react'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  ShieldCheck,
  Share2,
  Pencil,
  Ban,
  AlertTriangle,
} from 'lucide-react'
import { spring } from '../lib/motion'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { useModal } from '../context/ModalContext'
import { CATEGORY_COLOR, pluralize } from '../lib/utils'
import {
  FollowBtn,
  GoingStack,
  IconButton,
  PageLoader,
  RSVPBtn,
  SaveBtn,
  StickyRsvpBar,
  TicketBtn,
} from '../components/primitives'
import { EventCard } from '../components/EventCard'
import { AttendeeStrip } from '../components/UserSearch'
import { EventPosses } from '../components/EventPosses'
import { EventComments } from '../components/EventComments'
import { EventMap } from '../components/EventMap'
import { OrganizerFooterCard } from '../components/OrganizerFooterCard'
import { ReminderPicker } from '../components/ReminderPicker'
import { ShareEventSheet } from '../components/messages'

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
  const { user, savedIds, goingIds, followingIds, toggleSaved, toggleGoing, toggleFollow } =
    useApp()
  const toast = useToast()
  const modal = useModal()
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
  // Instagram-style "share to DM / group" sheet — opens on the Share icon.
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    api.event(id).then((e) => {
      setEvent(e)
      setGoingCount(e?.rsvpCount ?? 0)
    })
    api.related(id).then(setRelated)
    // Log the page view for organizer analytics + the ranker. Fire-and-forget;
    // uses the event id directly so we don't wait on the fetch above.
    api.interactions([{ interaction_type: 'view', surface: 'event_detail', event_id: id }])
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

  // Share = open the in-app share sheet (Instagram-style). Sending the event
  // into a chat is the primary path here; the sheet handles thread selection,
  // search, and the optional note. We fire the share signal up-front so the
  // organizer analytics still reflect the intent even if the user cancels the
  // sheet — matches the semantics of the old "opened the share menu" event.
  const onShare = useCallback(() => {
    if (!event) return
    api.interactions([{ interaction_type: 'share', surface: 'event_detail', event_id: event.id }])
    setShareOpen(true)
  }, [event])

  const handleShareSent = useCallback(
    (threadIds) => {
      const n = threadIds?.length ?? 0
      if (!n) return
      toast.success(n > 1 ? `Shared to ${n} chats` : 'Shared')
    },
    [toast],
  )

  // Confirm + fire the organizer cancel action. Reason is optional and typed
  // into the confirm dialog via a plain prompt() — a proper reason textarea
  // is a later polish; for now we lean on the platform prompt so the flow is
  // discoverable without an extra modal variant.
  const onCancel = async () => {
    if (!event) return
    const ok = await modal.confirm({
      title: 'Cancel this event?',
      message:
        'Everyone who RSVPed will be notified. This can’t be undone — attendees will see a cancelled banner.',
      confirmLabel: 'Cancel event',
      cancelLabel: 'Keep event',
      danger: true,
    })
    if (!ok) return
    const reason =
      typeof window !== 'undefined'
        ? window.prompt('Optional: tell attendees why (leave blank to skip).') || ''
        : ''
    try {
      const updated = await api.cancelEvent(event.id, reason.trim() || undefined)
      setEvent(updated)
      toast.success('Event cancelled. Attendees have been notified.')
    } catch (err) {
      if (err?.status === 409) {
        toast.info('This event has already been cancelled.')
      } else {
        toast.error(err?.message || 'Could not cancel the event. Try again.')
      }
    }
  }

  if (!event) return <PageLoader label="Loading event" />

  const saved = savedIds.has(event.id)
  const going = goingIds.has(event.id)
  const following = event.organizer ? followingIds.has(event.organizer.id) : false
  const hasAbout = Boolean(event.description?.trim())
  const isCancelled = event.status === 'cancelled'
  // Events pulled from a partner API (Ticketmaster / SeatGeek) carry a ticket
  // page — surface a "Get tickets" link alongside RSVP so the user can buy from
  // the original seller (Loop can't reserve a partner's seat itself).
  const ticketUrl = event.source !== 'native' ? event.ticketUrl : null
  const isOrganizer = Boolean(user?.id && event.organizer?.id && user.id === event.organizer.id)
  const canEdit = isOrganizer && !isCancelled && event.status !== 'past'
  const timeStr = formatTime(event.isoDate)
  // Prefer "{event.date} · {time}" when both exist; the mock seed's date field
  // already includes time so we detect that and skip the double-print.
  const dateHasTime = event.date && /\d{1,2}(:\d{2})?\s*[AP]M/i.test(event.date)
  const dateLine = timeStr && !dateHasTime ? `${event.date} · ${timeStr}` : event.date

  // Bump the count synchronously so the header + GoingStack tick in the same
  // frame as the button flip, then roll back if the RSVP was login-gated
  // (result === null) or the backend rejected (result === wasGoing).
  const onRsvp = async () => {
    const wasGoing = goingIds.has(event.id)
    const willGo = !wasGoing
    setGoingCount((c) => Math.max(0, c + (willGo ? 1 : -1)))
    const result = await toggleGoing(event.id)
    if (result === null || result === wasGoing) {
      setGoingCount((c) => Math.max(0, c + (willGo ? -1 : 1)))
    }
  }

  return (
    <main id="main" className="pb-24 md:pb-24">
      {isCancelled && (
        <div
          role="alert"
          className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800"
        >
          <div className="mx-auto flex max-w-[1140px] items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">This event was cancelled by the organizer.</p>
              {event.cancelReason && <p className="mt-0.5 text-red-700">{event.cancelReason}</p>}
            </div>
          </div>
        </div>
      )}
      {/* dark immersive header. The backdrop fades up and the poster settles in
          from a slight scale on mount, so arriving from a Landing/feed preview
          card reads as a continuous "handoff" into the event rather than a hard
          cut. (Lightweight continuity — no cross-route layout morph.) */}
      <div className="relative overflow-hidden bg-ink">
        <m.img
          src={event.poster}
          alt=""
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-md"
        />
        <div className="relative mx-auto max-w-[1140px] px-5 py-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-6 flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
          >
            <ArrowLeft size={18} /> Back
          </button>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-[440px_1fr]">
            {/* Poster — object-contain so the full flyer is always visible.
                object-cover crops to fill, which chops the title off tall
                portrait AI flyers. The blurred hero backdrop already colors
                any letterbox gaps, so contain looks native. */}
            <m.img
              src={event.poster}
              alt={event.title}
              initial={{ opacity: 0, scale: 1.06, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={spring}
              className="h-64 w-full rounded-card bg-black/20 object-contain shadow-hero sm:h-80 md:h-[520px]"
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
              <h1 className="mt-4 font-display text-2xl font-bold leading-tight sm:text-3xl md:text-5xl">
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
                    <span className="text-xs text-white/60">
                      {event.ageRestricted ? '· required' : '· recommended'}
                    </span>
                  </div>
                )}
              </div>

              {/* Social-proof + scarcity card — GoingStack on the left carries
                  the "who's going" signal, right side pairs spots-left with the
                  price so the two most decision-critical numbers sit together. */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-card bg-white/10 p-4 backdrop-blur-sm">
                <GoingStack
                  count={goingCount}
                  avatars={event.goingAvatars}
                  size="md"
                  labelClassName="text-2xl font-bold text-white sm:text-3xl"
                />
                <div className="flex flex-col items-end">
                  <span className="text-2xl font-bold sm:text-3xl">
                    {event.isFree ? 'Free' : event.price}
                  </span>
                  {event.capacity != null && (
                    <span className="text-xs text-white/70">
                      {Math.max(0, event.capacity - goingCount)}{' '}
                      {pluralize(Math.max(0, event.capacity - goingCount), 'spot')} left
                    </span>
                  )}
                </div>
              </div>

              {/* CTAs — ref anchors the sticky-pill IntersectionObserver.
                  Cancelled events swap the RSVP button for a static badge so
                  the row still holds space without inviting a signup. */}
              <div ref={heroCtaRef} className="mt-4 flex items-center gap-3">
                {isCancelled ? (
                  <span className="inline-flex items-center gap-2 rounded-button bg-white/15 px-4 py-2 text-sm font-semibold text-white/85">
                    <Ban size={16} /> Cancelled
                  </span>
                ) : (
                  <>
                    <RSVPBtn variant={going || ticketUrl ? 'outline' : 'filled'} onClick={onRsvp}>
                      {going ? "You're going ✓" : 'RSVP now'}
                    </RSVPBtn>
                    {ticketUrl && <TicketBtn href={ticketUrl} />}
                  </>
                )}
                <SaveBtn saved={saved} onToggle={() => toggleSaved(event.id)} />
                <IconButton onClick={onShare} label="Share event">
                  <Share2 size={18} />
                </IconButton>
              </div>

              {/* Organizer action bar — edit + cancel. Only rendered for the
                  event's own organizer; hidden once the event is cancelled or
                  past. Attendees never see this row. */}
              {canEdit && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/90 backdrop-blur-sm">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Organizer
                  </span>
                  <Link
                    to={`/event/${event.id}/edit`}
                    className="inline-flex items-center gap-1.5 rounded-pill bg-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/25"
                  >
                    <Pencil size={13} /> Edit event
                  </Link>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex items-center gap-1.5 rounded-pill bg-red-500/80 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500"
                  >
                    <Ban size={13} /> Cancel event
                  </button>
                </div>
              )}

              {/* Reminder picker — surfaces once the user has committed (RSVP or
                  save), so we only offer a nudge for events they care about.
                  Suppressed on cancelled events so we never nudge someone
                  toward a run that isn't happening. */}
              {!isCancelled && (going || saved) && (
                <ReminderPicker eventId={event.id} startsAt={event.isoDate} />
              )}
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

        {/* Who's going — public attendee face-pile that opens the full list.
            Renders nothing until the event has at least one attendee. Sports
            runs surface their roster here too (claimed players). */}
        <section className="mx-auto max-w-[860px]">
          <AttendeeStrip eventId={event.id} />
        </section>

        {/* Posses — start or join a group heading to this event together.
            Hidden for logged-out viewers and cancelled/past events. */}
        {!isCancelled && event.status !== 'past' && (
          <EventPosses eventId={event.id} eventTitle={event.title} />
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

        {/* Comments — real threaded comments backed by /api/events/:id/comments
            (#30). The composer, list, and author/organizer delete all live in
            EventComments. */}
        <EventComments eventId={event.id} organizerId={event.organizer?.id} />

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
          it's never redundant with the primary button. Suppressed entirely
          on cancelled events since there's no action left to promote. */}
      {!isCancelled && (
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
          ticketUrl={ticketUrl}
          visible={pillVisible}
        />
      )}

      {/* Share-to-DM sheet — the Instagram-style flow. Only mounted while open
          so the sheet's useThreads subscription doesn't run on every event
          page view. */}
      {shareOpen && (
        <ShareEventSheet
          event={event}
          onClose={() => setShareOpen(false)}
          onSent={handleShareSent}
        />
      )}
    </main>
  )
}
