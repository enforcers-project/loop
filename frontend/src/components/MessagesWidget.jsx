import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { m, AnimatePresence } from 'motion/react'
import { Maximize2, MessageCircle, PenSquare, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useThreads, useUnreadCount } from '../lib/messages'
import { ThreadList, ThreadView, NewMessagePicker } from './messages'

/* MessagesWidget — Instagram-style floating messenger. Three states:
   1. Collapsed blob (bottom-right pill with avatars + unread badge)
   2. Compact docked panel with the conversation list, drills into a thread
   3. Fullscreen → navigates to /messages, carrying any selected thread id

   Persists across every logged-in route (mounted in App shell). Hidden on
   the `/messages*` routes so it doesn't overlap the fullscreen view, and on
   `bare` routes (landing/auth/onboarding) — the shell already gates that. */
export function MessagesWidget() {
  const { user } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const threads = useThreads(user?.id)
  const unread = useUnreadCount(user?.id)

  // Panel state — 'blob' | 'panel'. Selected thread id (when non-null we're
  // in the mini chat view inside the panel).
  const [mode, setMode] = useState('blob')
  const [selectedId, setSelectedId] = useState(null)
  const [composerOpen, setComposerOpen] = useState(false)

  // Collapse to blob whenever the route changes — IG's docked panel doesn't
  // follow you across pages, only the collapsed pill does. Render-time reset
  // keyed on pathname, so we don't need an effect that setState's on mount.
  const [routeKey, setRouteKey] = useState(location.pathname)
  if (routeKey !== location.pathname) {
    setRouteKey(location.pathname)
    if (mode !== 'blob') setMode('blob')
    if (selectedId) setSelectedId(null)
    if (composerOpen) setComposerOpen(false)
  }

  // Hide on the fullscreen messages route (State 3) so it doesn't cover the
  // page's own list column.
  const onMessagesRoute = location.pathname.startsWith('/messages')

  // Esc closes the panel, or collapses the mini chat to the list first.
  useEffect(() => {
    if (mode !== 'panel') return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (composerOpen) return
      if (selectedId) setSelectedId(null)
      else setMode('blob')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, selectedId, composerOpen])

  if (!user?.id || onMessagesRoute) return null

  const previewAvatars = threads.slice(0, 3)
  const openPanel = () => setMode('panel')
  const closePanel = () => {
    setMode('blob')
    setSelectedId(null)
  }
  const expandToFullscreen = () => {
    const href = selectedId ? `/messages/${encodeURIComponent(selectedId)}` : '/messages'
    setMode('blob')
    setSelectedId(null)
    navigate(href)
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end px-3 pb-[calc(env(safe-area-inset-bottom)+64px)] sm:px-6 sm:pb-6 md:pb-6">
        <AnimatePresence initial={false} mode="wait">
          {mode === 'blob' ? (
            <m.button
              key="blob"
              type="button"
              onClick={openPanel}
              aria-label={`Open messages${unread ? `, ${unread} unread` : ''}`}
              initial={{ opacity: 0, scale: 0.85, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 12 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-card-hover transition-shadow hover:shadow-hero sm:w-auto sm:justify-start sm:gap-2.5 sm:pl-3.5 sm:pr-4"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15">
                <MessageCircle size={20} />
              </span>
              <span className="hidden pr-1 text-sm font-semibold sm:inline">Messages</span>
              {previewAvatars.length > 0 && (
                <span className="hidden items-center -space-x-2 sm:flex">
                  {previewAvatars.map((t) => (
                    <img
                      key={t.id}
                      src={t.partner?.avatar}
                      alt=""
                      className="h-7 w-7 rounded-full border-2 border-primary bg-surface object-cover"
                    />
                  ))}
                </span>
              )}
              {unread > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 grid h-6 min-w-[24px] place-items-center rounded-full border-2 border-white bg-accent px-1 text-[11px] font-bold text-white"
                >
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </m.button>
          ) : (
            <m.div
              key="panel"
              role="dialog"
              aria-modal="false"
              aria-label="Messages"
              initial={{ opacity: 0, scale: 0.9, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 24 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              style={{ transformOrigin: 'bottom right' }}
              className="pointer-events-auto flex h-[min(600px,calc(100vh-6rem))] w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-card border border-border-light bg-card-bg shadow-hero"
            >
              {/* header */}
              <div className="flex items-center justify-between border-b border-border-light bg-card-bg px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-base font-bold text-ink">
                    {selectedId ? '' : 'Messages'}
                  </h2>
                  {!selectedId && unread > 0 && (
                    <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!selectedId && (
                    <button
                      type="button"
                      onClick={() => setComposerOpen(true)}
                      aria-label="New message"
                      className="grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors hover:bg-surface hover:text-ink"
                    >
                      <PenSquare size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={expandToFullscreen}
                    aria-label="Expand to fullscreen"
                    className="grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors hover:bg-surface hover:text-ink"
                  >
                    <Maximize2 size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={closePanel}
                    aria-label="Close messages"
                    className="grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors hover:bg-surface hover:text-ink"
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>

              {/* body — either the thread list or a single-thread mini view */}
              {selectedId ? (
                <ThreadView
                  threadId={selectedId}
                  showBack
                  compact
                  onBack={() => setSelectedId(null)}
                />
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <ThreadList
                    threads={threads}
                    onSelect={(t) => setSelectedId(t.id)}
                    onCompose={() => setComposerOpen(true)}
                    dense
                  />
                </div>
              )}
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {composerOpen && (
        <NewMessagePicker
          onPick={(threadId) => {
            setComposerOpen(false)
            setSelectedId(threadId)
          }}
          onClose={() => setComposerOpen(false)}
        />
      )}
    </>
  )
}
