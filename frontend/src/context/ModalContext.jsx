import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { cn } from '../lib/utils'

// Modal context for auth-gating (tapping RSVP/Save while logged out) and
// destructive confirms (see frontend_inventory.md §"Modal context").
//
// The API is promise-based so callers can `await`:
//   const ok = await modal.confirm({ title, message, confirmLabel, danger })
//   if (ok) doTheThing()
//   modal.authGate()  // opens a "log in to continue" dialog, routes to /auth

const ModalContext = createContext(null)

export function ModalProvider({ children }) {
  const navigate = useNavigate()
  const [dialog, setDialog] = useState(null)
  // Holds the resolver for the currently-open confirm() promise.
  const resolver = useRef(null)

  const close = useCallback((result) => {
    if (resolver.current) {
      resolver.current(result)
      resolver.current = null
    }
    setDialog(null)
  }, [])

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve
      setDialog({
        title: opts.title ?? 'Are you sure?',
        message: opts.message ?? '',
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        danger: opts.danger ?? false,
      })
    })
  }, [])

  // Auth-gate: a specialized confirm whose primary action sends you to /auth.
  const authGate = useCallback(
    (opts = {}) => {
      return confirm({
        title: opts.title ?? 'Log in to continue',
        message:
          opts.message ?? 'Create a free account to save events, RSVP, and follow organizers.',
        confirmLabel: 'Log in or sign up',
        cancelLabel: 'Not now',
      }).then((ok) => {
        if (ok) navigate('/auth?mode=login')
        return ok
      })
    },
    [confirm, navigate],
  )

  // Close on Escape while a dialog is open.
  useEffect(() => {
    if (!dialog) return
    const onKey = (e) => {
      if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, close])

  return (
    <ModalContext.Provider value={{ confirm, authGate }}>
      {children}

      {dialog && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* backdrop — click to cancel */}
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => close(false)}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-sm rounded-card bg-white p-6 shadow-hero">
            <button
              onClick={() => close(false)}
              aria-label="Close dialog"
              className="absolute right-4 top-4 text-text-muted transition-colors hover:text-ink"
            >
              <X size={18} />
            </button>

            <h2 id="modal-title" className="font-display text-lg font-bold text-ink">
              {dialog.title}
            </h2>
            {dialog.message && <p className="mt-2 text-sm text-text-secondary">{dialog.message}</p>}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => close(false)}
                className="flex-1 rounded-button border border-border-light bg-white py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface"
              >
                {dialog.cancelLabel}
              </button>
              <button
                onClick={() => close(true)}
                className={cn(
                  'flex-1 rounded-button py-2.5 text-sm font-semibold text-white transition-transform active:scale-95',
                  dialog.danger ? 'bg-accent hover:opacity-90' : 'bg-primary hover:opacity-90',
                )}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useModal() {
  const ctx = useContext(ModalContext)
  if (!ctx) throw new Error('useModal must be used within ModalProvider')
  return ctx
}
