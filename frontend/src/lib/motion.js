// Shared Motion (framer-motion) variants + transitions, defined once so every
// screen animates with the same rhythm. Motion honors the OS "reduce motion"
// setting globally via <MotionConfig reducedMotion="user"> in App.jsx, so these
// don't need per-use accessibility guards.

// A calm, natural spring for physical UI (button presses, sheet slides). Tuned
// to settle quickly without an over-bouncy feel.
export const spring = { type: 'spring', stiffness: 400, damping: 30 }

// Snappier spring for small tactile toggles (Save/Follow "pop").
export const springSnappy = { type: 'spring', stiffness: 500, damping: 18 }

// Fade-up: the standard entrance for cards and list items.
export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
}

// Stagger container: children (fadeUp) reveal in sequence. Used by EventGrid.
export const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
}

// Backdrop fade for modal overlays.
export const backdrop = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

// Bottom-sheet: slides up from the bottom on mobile, springs in. The panel keeps
// its own responsive classes; this only drives the enter/exit transform.
export const sheet = {
  hidden: { y: '100%', opacity: 1 },
  show: { y: 0, transition: spring },
  exit: { y: '100%', transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } },
}

// Centered dialog scale-in (desktop-style modals that aren't bottom-sheets).
export const dialog = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.15 } },
}
