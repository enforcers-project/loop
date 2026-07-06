import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X, Send } from 'lucide-react'
import { api } from '../lib/api'
import type { Event } from '../lib/types'
import { cn } from '../lib/utils'

interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  events?: Event[]
}

const SUGGESTIONS = [
  'Free events this weekend',
  'Afrobeats party near me',
  'Pickup soccer on Sunday',
]

/* Mini event result card rendered inline in the drawer. */
function MiniEventCard({ event, onClick }: { event: Event; onClick: () => void }) {
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
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      text: "Hey! I'm Loop AI. Tell me what you're in the mood for and I'll find events near you.",
    },
  ])

  const ask = async (q: string) => {
    const query = q.trim()
    if (!query) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: query }])
    setThinking(true)
    const res = await api.aiSearch(query)
    setThinking(false)
    setMessages((m) => [
      ...m,
      { role: 'assistant', text: res.reply, events: res.events },
    ])
  }

  return (
    <>
      {/* floating trigger — fixed bottom-right */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-white shadow-card-hover transition-transform hover:scale-105"
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
                {m.text}
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
