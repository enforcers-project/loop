import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { cn } from '../lib/utils'

// Compact "3m / 2h / 5d" relative time for the feed. Falls back to a date once
// the notification is over a week old.
function relativeTime(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const secs = Math.max(0, (Date.now() - then) / 1000)
  if (secs < 60) return 'now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * TopNav notification bell (work-plan #27). Polls the caller's bell feed via
 * React Query, shows an unread dot driven by the server's unread_count, and
 * opens a dropdown of notifications. Clicking a followed-organizer item marks
 * it read and routes to the event. Only rendered for a logged-in user.
 */
export function NotificationBell() {
  const { isLoggedIn } = useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // Seeded with the empty envelope so the dot/list never render undefined.
  // Refetches on window focus (bell is the one place a stale count matters) and
  // on a light interval so a freshly published event surfaces without a reload.
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list({ limit: 20 }),
    enabled: isLoggedIn,
    initialData: { data: [], nextCursor: null, unread_count: 0 },
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
  })

  const items = data?.data ?? []
  const unread = data?.unread_count ?? 0

  const markRead = useMutation({
    mutationFn: (id) => api.notifications.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const markAll = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  // Close the dropdown on an outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!isLoggedIn) return null

  const onItemClick = (n) => {
    if (!n.is_read) markRead.mutate(n.id)
    setOpen(false)
    if (n.event_id) navigate(`/event/${n.event_id}`)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-10 w-10 place-items-center rounded-button text-text-secondary transition-colors hover:bg-surface hover:text-ink"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-border-light bg-white shadow-card-hover">
          <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-text-muted">No notifications yet.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onItemClick(n)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface',
                    !n.is_read && 'bg-primary/5',
                  )}
                >
                  <img
                    src={n.actor?.avatar_url || 'https://i.pravatar.cc/150?img=12'}
                    alt=""
                    className="mt-0.5 h-8 w-8 flex-shrink-0 rounded-full border border-border-light bg-surface object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink">{n.title}</span>
                    {n.body && (
                      <span className="block truncate text-xs text-text-secondary">{n.body}</span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-text-muted">
                      {relativeTime(n.created_at)}
                    </span>
                  </span>
                  {!n.is_read && (
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-accent" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
