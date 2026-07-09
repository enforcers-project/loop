import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '../lib/utils'

// Toasts for mutation success/error and the offline-fallback notice (see
// frontend_inventory.md §"Toast context"). Auto-dismiss after 4s; manual close.

const ToastContext = createContext(null)

const VARIANTS = {
  success: { icon: CheckCircle2, accent: 'text-success', ring: 'ring-success/20' },
  error: { icon: AlertCircle, accent: 'text-accent', ring: 'ring-accent/20' },
  info: { icon: Info, accent: 'text-primary', ring: 'ring-primary/20' },
}

const AUTO_DISMISS_MS = 4000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  // Monotonic id counter — Date.now()/Math.random() are avoided so ids stay
  // deterministic and collision-free even for toasts fired in the same tick.
  const nextId = useRef(0)
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (message, variant = 'info') => {
      const id = nextId.current++
      setToasts((prev) => [...prev, { id, message, variant }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      )
      return id
    },
    [dismiss],
  )

  // Convenience helpers so callers write toast.success('Saved!') etc.
  const toast = {
    show,
    dismiss,
    success: useCallback((m) => show(m, 'success'), [show]),
    error: useCallback((m) => show(m, 'error'), [show]),
    info: useCallback((m) => show(m, 'info'), [show]),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {/* Stack, bottom-center on mobile / bottom-right on desktop, above the AI FAB. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const { icon: Icon, accent, ring } = VARIANTS[t.variant] ?? VARIANTS.info
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card bg-white px-4 py-3 shadow-card-hover ring-1',
                ring,
              )}
            >
              <Icon size={20} className={cn('mt-0.5 flex-shrink-0', accent)} />
              <p className="flex-1 text-sm font-medium text-text-primary">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="flex-shrink-0 text-text-muted transition-colors hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
