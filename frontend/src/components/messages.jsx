import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCheck,
  MapPin,
  PenSquare,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import {
  describeThread,
  ensureGroupThread,
  ensureMessagesLoaded,
  ensureThread,
  markThreadRead,
  notifyTyping,
  participantOf,
  sendEventShare,
  sendMessage,
  statusFor,
  toggleReaction,
  useThread,
  useThreads,
  useTyping,
} from '../lib/messages'
import { VerifiedBadge } from './primitives'
import { cn, timeAgo } from '../lib/utils'

/* Shared messaging UI pieces used by both the docked widget panel and the
   fullscreen /messages page. Two-consumer surface — anything here needs to
   render at 380px docked AND at ~600px in the fullscreen right pane, so the
   sizing bases on flex/min-h rather than fixed viewport math. */

/* --------------------------------------------------------------------------
   AvatarStack — one round avatar for DMs, up to three overlapping ones for
   groups. `size` and `border` let the row and thread header render the same
   composition at different scales.
-------------------------------------------------------------------------- */
function AvatarStack({ avatars, size, border = 'border-white' }) {
  if (!avatars.length) {
    return (
      <div
        className={cn('grid place-items-center rounded-full bg-primary-light text-primary')}
        style={{ width: size, height: size }}
      >
        <Users size={Math.round(size * 0.5)} />
      </div>
    )
  }
  if (avatars.length === 1) {
    return (
      <img
        src={avatars[0]}
        alt=""
        className="flex-shrink-0 rounded-full bg-surface object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  // Groups: 2–3 avatars stacked into a rough circle. First is largest, others
  // tuck around it so a 44px slot still reads as one identity.
  const inner = Math.round(size * 0.68)
  return (
    <div
      className="relative flex-shrink-0 rounded-full bg-surface"
      style={{ width: size, height: size }}
    >
      <img
        src={avatars[0]}
        alt=""
        className={cn(
          'absolute left-0 top-0 rounded-full border-2 bg-surface object-cover',
          border,
        )}
        style={{ width: inner, height: inner }}
      />
      <img
        src={avatars[1]}
        alt=""
        className={cn(
          'absolute bottom-0 right-0 rounded-full border-2 bg-surface object-cover',
          border,
        )}
        style={{ width: inner, height: inner }}
      />
      {avatars[2] && (
        <img
          src={avatars[2]}
          alt=""
          className={cn(
            'absolute right-0 top-0 rounded-full border-2 bg-surface object-cover',
            border,
          )}
          style={{ width: Math.round(size * 0.4), height: Math.round(size * 0.4) }}
        />
      )}
    </div>
  )
}

/* --------------------------------------------------------------------------
   ThreadList — scrollable list of conversations for `userId`. Rendered
   inside a flex parent that provides height; the list itself does the
   overflow. `activeThreadId` highlights the currently-open row.
-------------------------------------------------------------------------- */
export function ThreadList({ threads, activeThreadId, onSelect, onCompose, dense = false }) {
  if (!threads.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-light text-primary">
          <PenSquare size={22} />
        </span>
        <h3 className="mt-4 font-display text-base font-bold text-ink">No messages yet</h3>
        <p className="mt-1 max-w-[24ch] text-sm leading-relaxed text-text-secondary">
          Say hi to someone. Their reply lands right here.
        </p>
        <button
          type="button"
          onClick={onCompose}
          className="mt-5 inline-flex h-10 items-center rounded-button bg-primary px-5 text-sm font-semibold text-white transition-transform active:scale-95 hover:opacity-90"
        >
          Start a chat
        </button>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border-light">
      {threads.map((t) => {
        const active = t.id === activeThreadId
        const desc = describeThread(t)
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect?.(t)}
              className={cn(
                'flex w-full items-center gap-3 px-4 text-left transition-colors hover:bg-surface',
                dense ? 'py-2.5' : 'py-3.5',
                active && 'bg-primary/5 hover:bg-primary/5',
              )}
            >
              <div className="relative flex-shrink-0">
                <AvatarStack avatars={desc.avatars} size={dense ? 44 : 48} />
                {t.unread && (
                  <span
                    aria-label="Unread"
                    className="absolute -right-0 top-0 h-3 w-3 rounded-full border-2 border-white bg-primary"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'truncate text-sm text-ink',
                      t.unread ? 'font-bold' : 'font-semibold',
                    )}
                  >
                    {desc.title}
                  </span>
                  {desc.verified && <VerifiedBadge size={13} />}
                </div>
                <p
                  className={cn(
                    'mt-0.5 truncate text-sm',
                    t.unread ? 'text-ink font-medium' : 'text-text-secondary',
                  )}
                >
                  {previewOf(t)}
                </p>
              </div>
              <span className="flex-shrink-0 text-xs text-text-muted">{timeAgo(t.updatedAt)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function previewOf(thread) {
  const last = thread.messages[thread.messages.length - 1]
  // Heart notification wins the preview line — same behavior as Instagram's
  // "❤️ liked your message" row when a heart is the most recent thread event.
  // `unread` is set by the store based on lastReactionAt vs my lastReadAt, so
  // we only need to check whether the flag is on and the last message is mine.
  if (thread.unread && thread.lastReactionAt && last?.from === 'me') {
    return '❤️ Liked your message'
  }
  if (!last) return 'Say hi 👋'
  // Event shares: describe the share so the row summarises the attachment
  // instead of an empty text field. If there's a note we still show it, with
  // the shared event title tacked on afterwards.
  const body = last.event
    ? last.text
      ? `${last.text} · shared ${last.event.title}`
      : `Shared ${last.event.title}`
    : last.text
  if (!body) return 'Say hi 👋'
  // Groups: prefix with the sender's first name so "Yeah — see you Friday"
  // reads as "Kelly: Yeah — see you Friday". DMs stay compact.
  if (thread.kind === 'group') {
    if (last.from === 'me') return `You: ${body}`
    const sender = participantOf(thread, last.senderId)
    const first = (sender?.name || '').split(' ')[0]
    return first ? `${first}: ${body}` : body
  }
  const prefix = last.from === 'me' ? 'You: ' : ''
  return prefix + body
}

/* --------------------------------------------------------------------------
   ThreadView — one conversation's header + message list + composer. Fills
   its flex parent; caller controls whether a back arrow is shown (docked
   panel yes, fullscreen right pane no since the list is always visible).
-------------------------------------------------------------------------- */
export function ThreadView({ threadId, onBack, showBack = false, compact = false }) {
  const navigate = useNavigate()
  const { user } = useApp()
  const toast = useToast()
  const thread = useThread(user?.id, threadId)
  const typingList = useTyping(threadId)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef(null)

  // Fetch past messages once on open (idempotent — the store no-ops the second
  // call). Runs once the temp/optimistic thread reconciles to a serverId.
  useEffect(() => {
    if (!user?.id || !threadId) return
    ensureMessagesLoaded(user.id, threadId).catch(() => {})
  }, [user?.id, threadId, thread?.serverId])

  // Mark read on open and again whenever a new partner message arrives while
  // the view is mounted (docked panel is open → the user is "in" the thread).
  useEffect(() => {
    if (!user?.id || !threadId) return
    markThreadRead(user.id, threadId)
  }, [user?.id, threadId, thread?.updatedAt])

  const messageCount = thread?.messages.length ?? 0
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messageCount, typingList.length])

  const send = () => {
    const text = draft.trim()
    if (!text || !user?.id || !threadId) return
    sendMessage(user.id, threadId, text, {
      onError: (err) => toast.error(err.message),
    })
    setDraft('')
  }

  const onDraftChange = (e) => {
    setDraft(e.target.value)
    if (user?.id && threadId) notifyTyping(threadId)
  }

  const groups = useMemo(() => groupBySender(thread?.messages ?? []), [thread?.messages])
  // Id of the last "me" message so the status tail renders once, on the most
  // recent outbound bubble only (Instagram parity). Derived by id (not index)
  // so the render pass stays pure.
  const latestMineId = useMemo(() => {
    const msgs = thread?.messages ?? []
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].from === 'me') return msgs[i].id
    }
    return null
  }, [thread?.messages])

  if (!thread) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
        <p className="text-sm text-text-secondary">This conversation isn&apos;t around anymore.</p>
      </div>
    )
  }

  const desc = describeThread(thread)
  // DM header links to the partner's profile; group header is not a link
  // (there's no "group profile" surface yet).
  const dmProfileHref =
    !desc.isGroup && thread.partner?.id ? `/organizer/${thread.partner.id}` : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* header */}
      <div className="flex items-center gap-2.5 border-b border-border-light bg-white px-3 py-2.5">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to messages"
            className="grid h-9 w-9 place-items-center rounded-full text-text-secondary transition-colors hover:bg-surface"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        {dmProfileHref ? (
          <Link
            to={dmProfileHref}
            className="group flex min-w-0 flex-1 items-center gap-2.5"
            aria-label={`Open ${desc.title}'s profile`}
          >
            <AvatarStack avatars={desc.avatars} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink group-hover:text-primary">
                  {desc.title}
                </span>
                {desc.verified && <VerifiedBadge size={13} />}
              </div>
              {desc.subtitle && !compact && (
                <p className="truncate text-xs text-text-muted">{desc.subtitle}</p>
              )}
            </div>
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <AvatarStack avatars={desc.avatars} size={36} />
            <div className="min-w-0">
              <span className="truncate text-sm font-semibold text-ink">{desc.title}</span>
              {desc.subtitle && <p className="truncate text-xs text-text-muted">{desc.subtitle}</p>}
            </div>
          </div>
        )}
      </div>

      {/* scrollable message list */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface/40 px-3 py-4"
      >
        {groups.length === 0 && (
          <p className="py-10 text-center text-sm text-text-muted">No messages yet. Say hi 👋</p>
        )}
        {groups.map((g, i) => {
          const sender = g.from === 'them' ? participantOf(thread, g.senderId) : null
          const showSenderName = desc.isGroup && g.from === 'them'
          return (
            <div
              key={i}
              className={cn('flex gap-2', g.from === 'me' ? 'justify-end' : 'justify-start')}
            >
              {g.from === 'them' && (
                <img
                  src={sender?.avatar || desc.avatars[0]}
                  alt=""
                  className="h-7 w-7 flex-shrink-0 self-end rounded-full bg-surface object-cover"
                />
              )}
              <div
                className={cn(
                  'flex max-w-[78%] flex-col gap-1',
                  g.from === 'me' ? 'items-end' : 'items-start',
                )}
              >
                {showSenderName && sender?.name && (
                  <span className="pl-1 text-xs font-semibold text-text-secondary">
                    {sender.name}
                  </span>
                )}
                {g.messages.map((msg) => {
                  // Latest-mine flag is derived from the message id, not a
                  // walking counter, so the render stays pure across re-runs.
                  const isLatestMine = g.from === 'me' && msg.id === latestMineId
                  const status = statusFor(msg, thread, user?.id, { isLatestMine })
                  const onDoubleTap = () => {
                    if (!user?.id) return
                    // Optimistic bubble id is a client_id until the server
                    // echo lands; disallow reacting until we have a real id.
                    if (!msg.id || String(msg.id).startsWith('c-')) return
                    toggleReaction(user.id, threadId, msg.id)
                  }
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex flex-col gap-0.5',
                        g.from === 'me' ? 'items-end' : 'items-start',
                      )}
                    >
                      <TappableBubble onDoubleTap={onDoubleTap}>
                        <MessageBubble
                          message={msg}
                          mine={g.from === 'me'}
                          onOpenEvent={(evt) => {
                            if (!evt?.id) return
                            navigate(evt.isSports ? `/sports/${evt.id}` : `/event/${evt.id}`)
                          }}
                        />
                      </TappableBubble>
                      <ReactionsBadge
                        message={msg}
                        meId={user?.id}
                        onToggle={() => toggleReaction(user?.id, threadId, msg.id)}
                      />
                      {status && <StatusTail status={status} isGroup={!!desc.isGroup} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {typingList.length > 0 && <TypingBubble typing={typingList} desc={desc} thread={thread} />}
      </div>

      {/* composer — Enter to send, Shift+Enter for newline */}
      <div className="border-t border-border-light bg-white px-2.5 py-2.5">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={onDraftChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder="Message…"
            className="min-h-[40px] flex-1 resize-none rounded-input border border-border-light bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-placeholder focus:border-primary"
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            aria-label="Send message"
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-primary text-white transition-opacity active:scale-95 disabled:opacity-40"
          >
            <Send size={17} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
   TappableBubble — wraps a message bubble with a double-tap gesture that
   works on mouse and touch. Two taps within 350ms fires onDoubleTap; a single
   tap is a no-op so links/buttons inside the bubble (event card) still work.
   Also flashes a big heart briefly for visual feedback on every fire.

   NOTE: uses only the manual click detector — do NOT layer onDoubleClick on
   top: the browser fires BOTH `click`+`click`+`dblclick`, which would toggle
   twice and cancel out (that's the "sometimes it doesn't work" bug).
   A short lockout after firing swallows any stray synthetic event.
-------------------------------------------------------------------------- */
function TappableBubble({ children, onDoubleTap }) {
  const lastTapRef = useRef(0)
  const lockedUntilRef = useRef(0)
  const [flash, setFlash] = useState(0)
  const trigger = () => {
    const now = Date.now()
    if (now < lockedUntilRef.current) return
    lockedUntilRef.current = now + 500
    setFlash((n) => n + 1)
    onDoubleTap?.()
  }
  const handleTap = () => {
    const now = Date.now()
    if (now < lockedUntilRef.current) return
    if (now - lastTapRef.current < 350) {
      lastTapRef.current = 0
      trigger()
    } else {
      lastTapRef.current = now
    }
  }
  return (
    <div onClick={handleTap} className="relative cursor-pointer select-none">
      {children}
      {flash > 0 && (
        <span
          key={flash}
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-4xl"
          style={{ animation: 'loopHeartPop 600ms ease-out forwards' }}
        >
          ❤️
        </span>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------------
   ReactionsBadge — small pill under the bubble showing every distinct emoji
   with its count. Tapping toggles the current viewer's own heart. Renders
   nothing when there are no reactions.
-------------------------------------------------------------------------- */
function ReactionsBadge({ message, meId, onToggle }) {
  const reactions = Array.isArray(message?.reactions) ? message.reactions : []
  if (reactions.length === 0) return null
  // Aggregate by emoji: { emoji, count, mine }
  const byEmoji = new Map()
  for (const r of reactions) {
    const bucket = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false }
    bucket.count += 1
    if (r.userId === meId) bucket.mine = true
    byEmoji.set(r.emoji, bucket)
  }
  const groups = [...byEmoji.values()]
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle?.()
      }}
      aria-label={groups[0]?.mine ? 'Remove reaction' : 'Add reaction'}
      className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-border-light bg-white px-2 py-0.5 text-xs shadow-card transition-transform active:scale-95"
    >
      {groups.map((g) => (
        <span key={g.emoji} className="inline-flex items-center gap-1">
          <span
            className={cn(g.mine && 'drop-shadow-[0_0_0_1px_var(--tw-shadow-color)]')}
            aria-hidden
          >
            {g.emoji}
          </span>
          {g.count > 1 && (
            <span className="text-[11px] font-semibold text-text-secondary">{g.count}</span>
          )}
        </span>
      ))}
    </button>
  )
}

/* --------------------------------------------------------------------------
   MessageBubble — picks the right visual for one message: a text bubble, an
   attached event mini-card, or (when both are present on a share) a mini-card
   with the sender's note tucked below it.
-------------------------------------------------------------------------- */
function MessageBubble({ message, mine, onOpenEvent }) {
  if (message.event) {
    return (
      <div className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
        <SharedEventCard event={message.event} mine={mine} onOpen={onOpenEvent} />
        {message.text && (
          <span
            className={cn(
              'rounded-2xl px-3 py-2 text-sm leading-relaxed',
              mine ? 'bg-primary text-white' : 'bg-white text-text-primary shadow-card',
            )}
          >
            {message.text}
          </span>
        )}
      </div>
    )
  }
  return (
    <span
      className={cn(
        'rounded-2xl px-3 py-2 text-sm leading-relaxed',
        mine ? 'bg-primary text-white' : 'bg-white text-text-primary shadow-card',
      )}
    >
      {message.text}
    </span>
  )
}

/* --------------------------------------------------------------------------
   SharedEventCard — the Instagram-style attachment. Renders a tappable card
   with the poster, title, date, venue and a price/CTA row. Colored to sit on
   either side of the thread (primary tint for "me", white for "them") so the
   card still reads as owned by the sender.
-------------------------------------------------------------------------- */
function SharedEventCard({ event, mine, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(event)}
      className={cn(
        'group flex w-[240px] flex-col overflow-hidden rounded-2xl text-left transition-transform active:scale-[0.98]',
        mine
          ? 'bg-primary text-white shadow-card'
          : 'border border-border-light bg-white text-text-primary shadow-card',
      )}
    >
      {event.poster && (
        <img src={event.poster} alt="" className="h-32 w-full flex-shrink-0 object-cover" />
      )}
      <div className="flex flex-col gap-1 px-3 py-2.5">
        <span
          className={cn('line-clamp-2 text-sm font-semibold', mine ? 'text-white' : 'text-ink')}
        >
          {event.title}
        </span>
        {event.date && (
          <span
            className={cn(
              'flex items-center gap-1.5 text-xs',
              mine ? 'text-white/85' : 'text-text-secondary',
            )}
          >
            <Calendar size={12} /> {event.date}
          </span>
        )}
        {(event.venueName || event.city) && (
          <span
            className={cn(
              'flex items-center gap-1.5 truncate text-xs',
              mine ? 'text-white/85' : 'text-text-secondary',
            )}
          >
            <MapPin size={12} /> {[event.venueName, event.city].filter(Boolean).join(', ')}
          </span>
        )}
        <div className="mt-1 flex items-center justify-between">
          <span className={cn('text-xs font-semibold', mine ? 'text-white' : 'text-primary')}>
            {event.isFree ? 'Free' : event.price || 'View event'}
          </span>
          <span
            className={cn(
              'rounded-pill px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
              mine ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary',
            )}
          >
            Open
          </span>
        </div>
      </div>
    </button>
  )
}

/* --------------------------------------------------------------------------
   TypingBubble — Instagram-style animated dots bubble on the "them" side.
   Rendered when the SSE typing store shows ≥1 other participant active. The
   three dots use Tailwind's animate-bounce with staggered delays so they
   pulse in sequence rather than in unison.
-------------------------------------------------------------------------- */
function TypingBubble({ typing, desc, thread }) {
  if (!typing || typing.length === 0) return null
  const first = typing[0]
  const partner = first && thread ? participantOf(thread, first.userId) : null
  const avatar = partner?.avatar || desc?.avatars?.[0] || ''
  return (
    <div className="flex justify-start gap-2">
      {avatar ? (
        <img
          src={avatar}
          alt=""
          className="h-7 w-7 flex-shrink-0 self-end rounded-full bg-surface object-cover"
        />
      ) : (
        <span className="h-7 w-7 flex-shrink-0" aria-hidden />
      )}
      <div className="flex items-center gap-1 rounded-2xl bg-white px-3 py-2.5 shadow-card">
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
   StatusTail — the "Sending / Delivered / Read" tail beneath the sender's
   most recent outbound bubble. Uses the same iconography Instagram does:
   single check for delivered, double check (in primary) for read.
-------------------------------------------------------------------------- */
function StatusTail({ status, isGroup }) {
  if (status === 'sending') {
    return <span className="pr-1 text-[11px] text-text-muted">Sending…</span>
  }
  if (status === 'failed') {
    return (
      <span className="pr-1 text-[11px] font-medium text-accent">Not delivered · tap to retry</span>
    )
  }
  if (status === 'read') {
    return (
      <span className="flex items-center gap-1 pr-1 text-[11px] font-medium text-primary">
        <CheckCheck size={12} />
        {isGroup ? 'Seen' : 'Read'}
      </span>
    )
  }
  // delivered
  return (
    <span className="flex items-center gap-1 pr-1 text-[11px] text-text-muted">
      <Check size={12} />
      Delivered
    </span>
  )
}

function groupBySender(messages) {
  const groups = []
  for (const m of messages) {
    const last = groups[groups.length - 1]
    // Two consecutive messages from the same actor collapse into one bubble
    // group. For groups we also need the senderId to match — two different
    // participants' `them` lines shouldn't fuse.
    if (last && last.from === m.from && (m.from === 'me' || last.senderId === m.senderId)) {
      last.messages.push(m)
    } else {
      groups.push({ from: m.from, senderId: m.senderId ?? null, messages: [m] })
    }
  }
  return groups
}

/* --------------------------------------------------------------------------
   NewMessagePicker — modal that live-searches real users and either starts
   a DM (one pick) or creates a group thread (two or more picks). Returns
   the created thread's id via `onPick`.

   Search is debounced against api.searchUsers (backend when reachable,
   mock organizers otherwise) so a user typing "kel" doesn't fire a request
   per keystroke.
-------------------------------------------------------------------------- */
export function NewMessagePicker({ onPick, onClose }) {
  const { user } = useApp()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [picks, setPicks] = useState([]) // array of partner objects
  const [groupName, setGroupName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Debounced search — a 250ms idle window is enough that "africana" doesn't
  // fire eight requests, but still feels reactive. Empty-query reset lives in
  // the render body (guarded on inequality) so we don't cascade renders from
  // an effect.
  const term = q.trim()
  if (term === '' && results.length !== 0) setResults([])
  if (term === '' && searching) setSearching(false)

  useEffect(() => {
    if (!term) return
    let cancelled = false
    const handle = setTimeout(async () => {
      if (cancelled) return
      setSearching(true)
      try {
        const found = await api.searchUsers(term)
        if (!cancelled) setResults(found ?? [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [term])

  const pickedIds = useMemo(() => new Set(picks.map((p) => p.id)), [picks])
  const visibleResults = results.filter((p) => p.id !== user?.id && !pickedIds.has(p.id))

  const togglePick = (person) => {
    setError('')
    setPicks((prev) => {
      if (prev.some((p) => p.id === person.id)) {
        return prev.filter((p) => p.id !== person.id)
      }
      return [...prev, person]
    })
    setQ('')
  }
  const removePick = (id) => setPicks((prev) => prev.filter((p) => p.id !== id))

  const isGroup = picks.length >= 2
  const canStart = picks.length >= 1 && !!user?.id

  const startChat = () => {
    if (!canStart) return
    if (isGroup) {
      const id = ensureGroupThread(user.id, picks, groupName)
      if (id) {
        onPick?.(id, { kind: 'group', partners: picks, name: groupName || null })
      } else {
        setError('Could not create the group. Please try again.')
      }
      return
    }
    const id = ensureThread(user.id, picks[0])
    if (id) onPick?.(id, { kind: 'dm', partner: picks[0] })
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New message"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-card bg-white shadow-hero sm:max-w-md sm:rounded-card"
      >
        <div className="border-b border-border-light px-5 py-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">
              {isGroup ? 'New group chat' : 'New message'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors hover:bg-surface hover:text-ink"
            >
              <X size={17} />
            </button>
          </div>

          {isGroup && (
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name (optional)"
              maxLength={60}
              className="mt-3 w-full rounded-input border border-border-light bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-placeholder focus:border-primary"
            />
          )}

          {/* selected chips + search input, all in one row so it reads like an
              email To: field. Backspace on empty search pops the last chip. */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-input border border-border-light bg-surface px-2 py-1.5">
            <Search size={16} className="ml-1 text-text-muted" />
            {picks.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-1 pr-2 text-xs font-semibold text-primary"
              >
                <img
                  src={p.avatar}
                  alt=""
                  className="h-5 w-5 rounded-full bg-surface object-cover"
                />
                {p.name}
                <button
                  type="button"
                  onClick={() => removePick(p.id)}
                  aria-label={`Remove ${p.name}`}
                  className="grid h-4 w-4 place-items-center rounded-full text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !q && picks.length) {
                  removePick(picks[picks.length - 1].id)
                }
              }}
              placeholder={picks.length ? 'Add another…' : 'Search by name or handle…'}
              className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-text-primary outline-none placeholder:text-placeholder"
            />
          </div>

          {picks.length > 0 && (
            <p className="mt-2 text-xs text-text-muted">
              {isGroup
                ? `${picks.length + 1} people in this chat`
                : 'Add another person to make it a group'}
            </p>
          )}
          {error && <p className="mt-2 text-xs text-accent">{error}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {q.trim() === '' ? (
            <p className="px-5 py-10 text-center text-sm text-text-muted">
              Start typing to search for people.
            </p>
          ) : searching && visibleResults.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-text-muted">Searching…</p>
          ) : visibleResults.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-text-muted">No people found.</p>
          ) : (
            <ul className="divide-y divide-border-light">
              {visibleResults.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => togglePick(p)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
                  >
                    <img
                      src={p.avatar}
                      alt=""
                      className="h-11 w-11 flex-shrink-0 rounded-full bg-surface object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-ink">{p.name}</span>
                        {p.verified && <VerifiedBadge size={13} />}
                      </div>
                      {p.handle && (
                        <p className="mt-0.5 truncate text-xs text-text-muted">@{p.handle}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border-light px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-button px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={startChat}
            disabled={!canStart}
            className="inline-flex h-10 items-center rounded-button bg-primary px-5 text-sm font-semibold text-white transition-transform active:scale-95 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isGroup ? 'Create group' : 'Start chat'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
   ShareEventSheet — Instagram-style "share this event to a DM/group" modal.
   Lists the caller's existing threads at the top and a live-search field for
   picking new people (which resolves to a fresh DM). Any number of targets
   can be selected in one shot; a single "Send" fires the share into each of
   them with an optional note attached.

   Targets are a mix of:
     - thread references (existing DMs and groups the caller already has)
     - person references (search hits — a DM thread is auto-created on send)
-------------------------------------------------------------------------- */
export function ShareEventSheet({ event, onClose, onSent }) {
  const { user } = useApp()
  const threads = useThreads(user?.id)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [note, setNote] = useState('')
  // Selected targets keyed by a stable string so we can survive re-renders /
  // switching between "existing chat" and "new person" without collisions.
  const [selected, setSelected] = useState({})
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const term = q.trim()
  if (term === '' && results.length !== 0) setResults([])
  if (term === '' && searching) setSearching(false)

  useEffect(() => {
    if (!term) return
    let cancelled = false
    const handle = setTimeout(async () => {
      if (cancelled) return
      setSearching(true)
      try {
        const found = await api.searchUsers(term)
        if (!cancelled) setResults(found ?? [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [term])

  const targetKey = (t) => (t.kind === 'thread' ? `t::${t.threadId}` : `p::${t.person.id}`)
  const isSelected = (t) => !!selected[targetKey(t)]
  const toggle = (t) => {
    setError('')
    setSelected((prev) => {
      const k = targetKey(t)
      if (prev[k]) {
        const next = { ...prev }
        delete next[k]
        return next
      }
      return { ...prev, [k]: t }
    })
  }
  const selectedList = Object.values(selected)

  // People to show as "start a new DM" search hits — hide anyone the caller
  // already has an active DM with (we surface that thread in the top list
  // instead so the user doesn't see a person twice).
  const existingDmPartnerIds = useMemo(() => {
    const s = new Set()
    for (const t of threads) {
      if (t.kind !== 'group' && t.partner?.id) s.add(t.partner.id)
    }
    return s
  }, [threads])
  const visibleResults = results.filter((p) => p.id !== user?.id && !existingDmPartnerIds.has(p.id))

  const send = async () => {
    if (!user?.id || !event?.id || selectedList.length === 0 || sending) return
    setSending(true)
    setError('')
    try {
      const threadIds = []
      for (const target of selectedList) {
        let threadId = null
        if (target.kind === 'thread') {
          threadId = target.threadId
        } else {
          threadId = ensureThread(user.id, target.person)
        }
        if (threadId) {
          sendEventShare(user.id, threadId, event, note)
          threadIds.push(threadId)
        }
      }
      if (threadIds.length === 0) {
        setError('Could not send. Please try again.')
        return
      }
      onSent?.(threadIds)
      onClose?.()
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share event"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-card bg-white shadow-hero sm:max-w-md sm:rounded-card"
      >
        <div className="border-b border-border-light px-5 py-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Share event</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors hover:bg-surface hover:text-ink"
            >
              <X size={17} />
            </button>
          </div>

          {/* Poster preview so the user always sees what they're forwarding. */}
          {event && (
            <div className="mt-3 flex items-center gap-3 rounded-input border border-border-light bg-surface px-3 py-2">
              {event.poster && (
                <img
                  src={event.poster}
                  alt=""
                  className="h-10 w-10 flex-shrink-0 rounded-md object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{event.title}</p>
                {event.date && <p className="truncate text-xs text-text-muted">{event.date}</p>}
              </div>
            </div>
          )}

          {/* Search field for pulling in people you don't have a chat with yet. */}
          <div className="mt-3 flex items-center gap-1.5 rounded-input border border-border-light bg-surface px-2 py-1.5">
            <Search size={16} className="ml-1 text-text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for people…"
              className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-text-primary outline-none placeholder:text-placeholder"
            />
          </div>
          {error && <p className="mt-2 text-xs text-accent">{error}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Existing chats section — always visible when there are any and
              nothing is being typed. When the caller types, we hide the list
              so the search results own the space. */}
          {term === '' && (
            <>
              {threads.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-text-muted">
                  No chats yet — search for someone to share with.
                </p>
              ) : (
                <ul className="divide-y divide-border-light">
                  {threads.map((t) => {
                    const desc = describeThread(t)
                    const target = { kind: 'thread', threadId: t.id }
                    const on = isSelected(target)
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => toggle(target)}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface',
                            on && 'bg-primary/5 hover:bg-primary/5',
                          )}
                        >
                          <AvatarStack avatars={desc.avatars} size={44} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold text-ink">
                                {desc.title}
                              </span>
                              {desc.verified && <VerifiedBadge size={13} />}
                            </div>
                            {desc.subtitle && (
                              <p className="mt-0.5 truncate text-xs text-text-muted">
                                {desc.subtitle}
                              </p>
                            )}
                          </div>
                          <SelectDot on={on} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}

          {term !== '' && (
            <>
              {searching && visibleResults.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-text-muted">Searching…</p>
              ) : visibleResults.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-text-muted">No people found.</p>
              ) : (
                <ul className="divide-y divide-border-light">
                  {visibleResults.map((p) => {
                    const target = { kind: 'person', person: p }
                    const on = isSelected(target)
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => toggle(target)}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface',
                            on && 'bg-primary/5 hover:bg-primary/5',
                          )}
                        >
                          <img
                            src={p.avatar}
                            alt=""
                            className="h-11 w-11 flex-shrink-0 rounded-full bg-surface object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold text-ink">
                                {p.name}
                              </span>
                              {p.verified && <VerifiedBadge size={13} />}
                            </div>
                            {p.handle && (
                              <p className="mt-0.5 truncate text-xs text-text-muted">@{p.handle}</p>
                            )}
                          </div>
                          <SelectDot on={on} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="border-t border-border-light bg-white px-4 py-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Write a message…"
            className="w-full resize-none rounded-input border border-border-light bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-placeholder focus:border-primary"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-text-muted">
              {selectedList.length === 0
                ? 'Pick one or more chats to share with'
                : `${selectedList.length} selected`}
            </span>
            <button
              type="button"
              onClick={send}
              disabled={selectedList.length === 0 || sending}
              className="inline-flex h-10 items-center gap-2 rounded-button bg-primary px-5 text-sm font-semibold text-white transition-transform active:scale-95 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={15} />
              {sending
                ? 'Sending…'
                : selectedList.length > 1
                  ? `Send to ${selectedList.length}`
                  : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* Small pill dot used as the "selected" indicator on ShareEventSheet rows. */
function SelectDot({ on }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border transition-colors',
        on ? 'border-primary bg-primary text-white' : 'border-border-light bg-white',
      )}
    >
      {on && <span className="h-2 w-2 rounded-full bg-white" />}
    </span>
  )
}
