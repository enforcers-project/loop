import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, Clock, MapPin, Users } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { CATEGORY_COLOR } from '../lib/utils'
import { FollowBtn, GoingStack, RSVPBtn, SaveBtn, VerifiedBadge } from '../components/primitives'
import { EventCard } from '../components/EventCard'

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

  if (!event) {
    return <div className="py-24 text-center text-text-muted">Loading…</div>
  }

  const saved = savedIds.has(event.id)
  const going = goingIds.has(event.id)
  const following = event.organizer ? followingIds.has(event.organizer.id) : false

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
    <div className="pb-24 md:pb-10">
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

              {/* CTAs */}
              <div className="mt-4 flex items-center gap-3">
                <RSVPBtn variant={going ? 'outline' : 'filled'} onClick={onRsvp}>
                  {going ? "You're going ✓" : 'RSVP now'}
                </RSVPBtn>
                <SaveBtn saved={saved} onToggle={() => toggleSaved(event.id)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* light body */}
      <div className="mx-auto max-w-[1140px] px-5 py-10">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px]">
          {/* main */}
          <div>
            <h2 className="font-display text-xl font-bold text-ink">About this event</h2>
            <p className="mt-3 leading-relaxed text-text-secondary">{event.description}</p>

            {/* tags */}
            <div className="mt-4 flex flex-wrap gap-2">
              {event.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-pill bg-surface px-3 py-1 text-xs font-medium text-text-secondary"
                >
                  {t}
                </span>
              ))}
            </div>

            {/* comments */}
            <h2 className="mt-10 font-display text-xl font-bold text-ink">
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
          </div>

          {/* sidebar */}
          <aside className="space-y-6">
            {/* map card */}
            <div className="overflow-hidden rounded-card border border-border-light shadow-card">
              <div className="relative h-44 bg-surface">
                <img
                  src={`https://staticmap.openstreetmap.de/staticmap.php?center=${event.lat},${event.lng}&zoom=14&size=400x200&markers=${event.lat},${event.lng},red-pushpin`}
                  alt="Map"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
                <div className="absolute inset-0 grid place-items-center">
                  <MapPin size={28} className="text-accent" />
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm font-semibold text-ink">{event.venueName}</p>
                <p className="text-xs text-text-secondary">{event.city}</p>
              </div>
            </div>

            {/* more events */}
            {related.length > 0 && (
              <div>
                <h3 className="mb-3 font-display text-base font-bold text-ink">More events</h3>
                <div className="space-y-4">
                  {related.slice(0, 2).map((e) => (
                    <EventCard key={e.id} event={e} />
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
