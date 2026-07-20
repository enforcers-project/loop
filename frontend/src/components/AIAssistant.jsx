import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X, Send } from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

const SUGGESTIONS = [
  'Free events this weekend',
  'Afrobeats party near me',
  'Pickup soccer on Sunday',
]

// Persist the thread id across drawer open/close and page refresh so a user's
// conversation history stays intact. Cleared on logout by AppContext.
const STORAGE_KEY = 'loop.assistantConversationId'

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: "Hey! I'm Loop AI. Tell me what you're in the mood for and I'll find events near you.",
}

/* Mini event result card rendered inline in the drawer. */
function MiniEventCard({ event, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border-light bg-white p-2 text-left transition-shadow hover:shadow-card"
    >
      <img src={event.poster} alt="" className="h-14 w-14 flex-shrink-0 rounded-xl object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{event.title}</p>
        <p className="truncate text-xs text-text-secondary">{event.date}</p>
        <p className="truncate text-xs text-text-muted">
          {event.venueName} · {event.isFree ? 'Free' : event.price}
        </p>
      </div>
    </button>
  )
}

export function AIAssistant() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const startedRef = useRef(false)

  // On first open, hydrate an existing thread if we have one in storage, else
  // start a fresh conversation. Guarded so a fast double-open only fires once.
  useEffect(() => {
    if (!open || startedRef.current) return
    startedRef.current = true
    let cancelled = false

    const stored = sessionStorage.getItem(STORAGE_KEY)
    const ensure = stored
      ? api.ai.getConversation(stored).then((conv) => {
          // A stale id (server-side deleted / different user) resolves to an
          // empty `messages` array with the same id — treat that as usable so
          // we don't spin up a duplicate thread on every open.
          if (conv?.id) return conv
          return api.ai.startConversation()
        })
      : api.ai.startConversation()

    ensure
      .then((conv) => {
        if (cancelled || !conv?.id) return
        setConversationId(conv.id)
        if (conv.id !== 'mock') sessionStorage.setItem(STORAGE_KEY, conv.id)
        if (Array.isArray(conv.messages) && conv.messages.length) {
          setMessages([
            WELCOME_MESSAGE,
            ...conv.messages.map((m) => ({
              role: m.role,
              content: m.content,
              // Legacy history has no attached events — the drawer just shows
              // the reply text.
            })),
          ])
        }
      })
      .catch(() => {
        // Non-fatal — the drawer still works via the legacy one-shot path.
      })

    return () => {
      cancelled = true
    }
  }, [open])

  const ask = async (q) => {
    const query = q.trim()
    if (!query || thinking) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: query }])
    setThinking(true)
    try {
      const res = await api.ai.sendMessage(conversationId, query)
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: res.reply, events: res.events ?? [] },
      ])
    } finally {
      setThinking(false)
    }
  }

  return (
    <>
      {/* floating trigger — fixed bottom-right */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          /* Sits above the mobile bottom bar + safe area on small screens,
             bottom-right on desktop. */
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-white shadow-card-hover transition-transform hover:scale-105 md:bottom-6 md:right-6"
          aria-label="Ask Loop AI"
        >
          <Sparkles size={24} />
        </button>
      )}

      {/* backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* right-side drawer */}
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-[320px] max-w-[90vw] flex-col bg-white shadow-card-hover transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* gradient header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-primary to-accent px-4 py-4 text-white">
          <span className="flex items-center gap-2 font-display text-lg font-bold">
            <Sparkles size={20} /> Ask Loop
          </span>
          <button onClick={() => setOpen(false)} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        {/* scrollable messages */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div key={i}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
                  m.role === 'user'
                    ? 'ml-auto bg-primary text-white'
                    : 'bg-surface text-text-primary',
                )}
              >
                {m.content}
              </div>
              {m.events && m.events.length > 0 && (
                <div className="mt-2 space-y-2">
                  {m.events.map((e) => (
                    <MiniEventCard
                      key={e.id}
                      event={e}
                      onClick={() => {
                        setOpen(false)
                        navigate(e.isSports ? `/sports/${e.id}` : `/event/${e.id}`)
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {thinking && (
            <div className="flex w-16 items-center gap-1 rounded-2xl bg-surface px-3.5 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="thinking-dot h-2 w-2 rounded-full bg-text-muted"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )}

          {messages.length === 1 && (
            <div className="space-y-2 pt-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="block w-full rounded-pill border border-border-light bg-white px-3 py-2 text-left text-sm text-text-secondary hover:border-primary hover:text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* input footer */}
        <div className="flex items-center gap-2 border-t border-border-light p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask(input)}
            placeholder="Ask about events…"
            className="loop-input flex-1 rounded-pill border border-border-light bg-white px-4 py-2.5 text-sm placeholder:text-placeholder"
          />
          <button
            onClick={() => ask(input)}
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-primary text-white"
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </aside>
    </>
  )
}
