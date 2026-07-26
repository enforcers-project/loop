import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PenSquare } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useThreads } from '../lib/messages'
import { ThreadList, ThreadView, NewMessagePicker } from '../components/messages'

/* Fullscreen /messages page — Instagram's two-pane view: conversation list
   on the left, the active thread on the right. Also serves /messages/:id
   for a direct link into a specific thread (state carried in from the
   docked panel's expand button). */
export function MessagesPage() {
  const { user } = useApp()
  const navigate = useNavigate()
  const { id: routeThreadId } = useParams()
  const threads = useThreads(user?.id)
  const [composerOpen, setComposerOpen] = useState(false)

  // Selection: prefer the URL param, fall back to nothing (empty state on
  // the right). Row taps push into the URL so back/forward feel right.
  const activeId = routeThreadId ?? null
  const openThread = (threadId) => {
    if (!threadId) return
    navigate(`/messages/${encodeURIComponent(threadId)}`)
  }

  const activeThread = activeId ? threads.find((t) => t.id === activeId) : null

  return (
    <div className="loop-container pb-24 pt-6 md:pb-12">
      <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-[1080px] overflow-hidden rounded-card border border-border-light bg-white shadow-card">
        {/* left pane — conversation list */}
        <aside
          className={`flex w-full flex-col border-r border-border-light md:w-[340px] md:flex-shrink-0 ${
            activeId ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="flex items-center justify-between border-b border-border-light px-4 py-3.5">
            <h1 className="font-display text-lg font-bold text-ink">Messages</h1>
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              aria-label="New message"
              className="grid h-9 w-9 place-items-center rounded-full text-text-secondary transition-colors hover:bg-surface hover:text-ink"
            >
              <PenSquare size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ThreadList
              threads={threads}
              activeThreadId={activeId}
              onSelect={(t) => openThread(t.id)}
              onCompose={() => setComposerOpen(true)}
            />
          </div>
        </aside>

        {/* right pane — active thread (or empty state) */}
        <section className={`flex min-h-0 flex-1 flex-col ${activeId ? 'flex' : 'hidden md:flex'}`}>
          {activeThread ? (
            <ThreadView
              threadId={activeThread.id}
              showBack
              onBack={() => navigate('/messages')}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full border-2 border-ink text-ink">
                <PenSquare size={26} />
              </span>
              <h2 className="mt-5 font-display text-lg font-bold text-ink">Your messages</h2>
              <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-text-secondary">
                Select a conversation on the left, or start a new one.
              </p>
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="mt-5 inline-flex h-10 items-center rounded-button bg-primary px-5 text-sm font-semibold text-white transition-transform active:scale-95 hover:opacity-90"
              >
                Send message
              </button>
            </div>
          )}
        </section>
      </div>

      {composerOpen && (
        <NewMessagePicker
          onPick={(threadId) => {
            setComposerOpen(false)
            openThread(threadId)
          }}
          onClose={() => setComposerOpen(false)}
        />
      )}
    </div>
  )
}
