import { useEffect, useRef, useState } from 'react'
import {
  Sparkles,
  Bookmark,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Share2,
  Camera,
  Images,
} from 'lucide-react'
import { m, AnimatePresence } from 'motion/react'
import { cn, formatCount, ROLE_STYLE } from '../lib/utils'
import { backdrop, sheet, springSnappy } from '../lib/motion'

/* --------------------------------------------------------------------------
   FormField — label (13px Inter 500 #6B6B76) above child
-------------------------------------------------------------------------- */
export function FormField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  )
}

/* Shared input styling (Figma inputSpec). */
export const inputClass =
  'loop-input w-full rounded-input border border-border-light bg-white px-4 py-3 text-sm text-text-primary placeholder:text-placeholder transition-colors'

/* --------------------------------------------------------------------------
   ImageSourcePicker — a trigger button that lets the user either take a photo
   with their camera or pick an existing image, feeding both to one
   `onFile(file)` callback. The caller styles the button via `className` and
   supplies its content as children:

     <ImageSourcePicker accept={ACCEPT_IMAGE} onFile={onPickFile} className="…">
       <ImagePlus size={28} />
       <span>Add a photo</span>
     </ImageSourcePicker>

   The camera comes from the HTML `capture` attribute on a hidden file input,
   which only opens a live camera on phones/tablets. So on those devices the
   button presents a small sheet — "Take a photo" vs "Choose from library" —
   while on desktop (where `capture` is ignored and would just re-open the file
   dialog) it skips the sheet and opens the library picker directly. Desktop
   behavior is therefore unchanged; only mobile gains the camera option.
-------------------------------------------------------------------------- */

// True on devices where the `capture` attribute opens a real camera — i.e.
// touch devices with no hover (phones/tablets). Desktops (incl. touchscreen
// laptops that still have a mouse) report a fine pointer + hover, so they get
// the plain file dialog. Device class is stable per session, so we read it
// once via the useState initializer (client-only SPA — window is always here).
function detectCameraCapture() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return (
    window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(hover: none)').matches
  )
}

export function ImageSourcePicker({
  accept = 'image/*',
  cameraFacing = 'environment',
  onFile,
  disabled = false,
  className,
  children,
  ...buttonProps
}) {
  const libraryRef = useRef(null)
  const cameraRef = useRef(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [canCamera] = useState(detectCameraCapture)

  const handleChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // let re-picking the same file fire onChange again
    setSheetOpen(false)
    if (file) onFile?.(file)
  }

  const open = () => {
    if (disabled) return
    // Mobile: offer camera vs library. Desktop: straight to the file dialog.
    if (canCamera) setSheetOpen(true)
    else libraryRef.current?.click()
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        className={className}
        {...buttonProps}
      >
        {children}
      </button>
      {/* Two hidden inputs feed the same handler: one plain (gallery/files),
          one with `capture` (camera). Always mounted so their refs are
          click-able the instant the user chooses. */}
      <input
        ref={libraryRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
      <input
        ref={cameraRef}
        type="file"
        accept={accept}
        capture={cameraFacing}
        className="hidden"
        onChange={handleChange}
      />
      <AnimatePresence>
        {sheetOpen && (
          <ImageSourceSheet
            onClose={() => setSheetOpen(false)}
            onCamera={() => cameraRef.current?.click()}
            onLibrary={() => libraryRef.current?.click()}
          />
        )}
      </AnimatePresence>
    </>
  )
}

/* The mobile chooser sheet: Take a photo / Choose from library. Renders above
   any parent modal (z-[60] > the z-50 Composer/Avatar sheets it opens from) and
   stops click propagation so dismissing it never also closes that parent. */
function ImageSourceSheet({ onClose, onCamera, onLibrary }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const action =
    'flex w-full items-center gap-3 rounded-input px-4 py-3.5 text-left text-sm font-medium text-ink transition-colors hover:bg-surface'
  const icon =
    'grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-primary-light text-primary'

  return (
    <m.div
      variants={backdrop}
      initial="hidden"
      animate="show"
      exit="exit"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <m.div
        variants={sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Add a photo"
        onClick={(e) => e.stopPropagation()}
        className="w-full overflow-hidden rounded-t-card bg-white p-2 shadow-hero sm:max-w-xs sm:rounded-card"
      >
        <button type="button" onClick={onCamera} className={action}>
          <span className={icon}>
            <Camera size={20} />
          </span>
          Take a photo
        </button>
        <button type="button" onClick={onLibrary} className={action}>
          <span className={icon}>
            <Images size={20} />
          </span>
          Choose from library
        </button>
      </m.div>
    </m.div>
  )
}

/* --------------------------------------------------------------------------
   PasswordField — text input with show/hide eye toggle
-------------------------------------------------------------------------- */
export function PasswordField({ value, onChange, placeholder = '••••••••', ...rest }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        className={cn(inputClass, 'pr-11')}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

/* --------------------------------------------------------------------------
   VerifiedBadge — 16px violet circle with white checkmark
-------------------------------------------------------------------------- */
export function VerifiedBadge({ size = 16 }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-primary text-white"
      style={{ width: size, height: size }}
      aria-label="Verified"
    >
      <Check size={size * 0.62} strokeWidth={3} />
    </span>
  )
}

/* --------------------------------------------------------------------------
   RoleBadge — pill with role-specific tinted bg + text
-------------------------------------------------------------------------- */
export function RoleBadge({ role }) {
  if (!role) return null
  // Backend roles are lowercase ('organizer', 'attendee'); the ROLE_STYLE map
  // keys off Title Case display labels. Try the raw value first, then the
  // Title Case form, then fall back to the neutral Attendee tint so an unknown
  // role never crashes the render.
  const label = String(role)
  const key =
    ROLE_STYLE[label] != null ? label : label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()
  const s = ROLE_STYLE[key] ?? ROLE_STYLE.Attendee
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {key}
    </span>
  )
}

/* --------------------------------------------------------------------------
   RSVPBtn — hot-pink CTA button
-------------------------------------------------------------------------- */
export function RSVPBtn({ variant = 'filled', sm = false, children = 'RSVP', onClick }) {
  return (
    <m.button
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={springSnappy}
      className={cn(
        'inline-flex items-center justify-center rounded-button font-semibold',
        // consistent control height: 44px standard, 40px compact (card footers)
        sm ? 'h-10 px-4 text-sm' : 'h-11 px-6 text-sm',
        variant === 'filled'
          ? 'bg-accent text-white shadow-sm hover:opacity-90'
          : 'border border-accent bg-white text-accent hover:bg-accent/5',
      )}
    >
      {children}
    </m.button>
  )
}

/* --------------------------------------------------------------------------
   SaveBtn — bookmark toggle, filled violet when saved
-------------------------------------------------------------------------- */
export function SaveBtn({ saved, onToggle, sm = false }) {
  return (
    <m.button
      onClick={onToggle}
      aria-label={saved ? 'Remove bookmark' : 'Bookmark event'}
      aria-pressed={saved}
      whileTap={{ scale: 0.9 }}
      transition={springSnappy}
      className={cn(
        'grid flex-shrink-0 place-items-center rounded-button border transition-colors',
        // square control that matches RSVP height: 40px compact / 44px standard
        sm ? 'h-10 w-10' : 'h-11 w-11',
        saved
          ? 'border-primary bg-primary-light text-primary'
          : 'border-border-light bg-white text-text-secondary hover:border-primary hover:text-primary',
      )}
    >
      {/* Icon "pops" when the event becomes saved: a quick overshoot keyed on
          `saved` so toggling on feels rewarding. */}
      <m.span animate={{ scale: saved ? [1, 1.3, 1] : 1 }} transition={springSnappy}>
        <Bookmark size={18} className={saved ? 'fill-primary' : ''} />
      </m.span>
    </m.button>
  )
}

/* --------------------------------------------------------------------------
   FollowBtn — violet fill when not following, bordered gray when following
-------------------------------------------------------------------------- */
export function FollowBtn({ following = false, onToggle, sm = false }) {
  return (
    <m.button
      onClick={onToggle}
      aria-pressed={following}
      whileTap={{ scale: 0.95 }}
      transition={springSnappy}
      className={cn(
        'inline-flex items-center justify-center overflow-hidden rounded-button font-semibold transition-colors',
        sm ? 'h-10 min-w-[84px] px-4 text-sm' : 'h-11 min-w-[100px] px-5 text-sm',
        following
          ? 'border border-border-light bg-white text-text-secondary hover:border-text-muted'
          : 'bg-primary text-white hover:opacity-90',
      )}
    >
      {/* Label crossfades on toggle so Follow→Following doesn't snap. */}
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={following ? 'following' : 'follow'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {following ? 'Following' : 'Follow'}
        </m.span>
      </AnimatePresence>
    </m.button>
  )
}

/* --------------------------------------------------------------------------
   AIChip — violet recommendation pill, Sparkles icon + short intentional
   label. Text is kept short upstream (recommendationLabel) so it never
   truncates or overflows; whitespace-nowrap keeps it on a single line.
-------------------------------------------------------------------------- */
export function AIChip({ text }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-pill bg-primary px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm">
      <Sparkles size={12} className="flex-shrink-0" />
      <span>{text}</span>
    </span>
  )
}

/* --------------------------------------------------------------------------
   AlmostFullBadge — hot-pink pill, flex-shrink-0, whitespace-nowrap
-------------------------------------------------------------------------- */
export function AlmostFullBadge({ label = 'Almost full' }) {
  return (
    <span className="flex-shrink-0 whitespace-nowrap rounded-pill bg-accent px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
      {label}
    </span>
  )
}

/* --------------------------------------------------------------------------
   GoingStack — 3 overlapping avatars + "N going". Displays the true attendee
   count (no "+" prefix) so the number reads as social proof, not a delta.
-------------------------------------------------------------------------- */
export function GoingStack({ count, avatars = [], size = 'sm', labelClassName }) {
  const px = size === 'sm' ? 24 : 32
  const shown = avatars.slice(0, 3)
  return (
    <div className="flex items-center gap-2">
      {shown.length > 0 && (
        <div className="flex -space-x-2">
          {shown.map((a, i) => (
            <img
              key={i}
              src={a}
              alt=""
              className="rounded-full border-2 border-white object-cover"
              style={{ width: px, height: px }}
            />
          ))}
        </div>
      )}
      <span className={cn('text-xs font-medium text-text-secondary', labelClassName)}>
        {formatCount(count)} going
      </span>
    </div>
  )
}

/* --------------------------------------------------------------------------
   Spinner — the app's canonical loading indicator: the Loop infinity (∞) mark,
   drawn as a single SVG stroke, with a bright "comet" segment racing around the
   figure-8 forever (a faint full ∞ sits underneath as the track). Both strokes
   use the Loop brand pink (--color-loop).

   The ∞ geometry + the running animation live in `.loop-infinity` (index.css);
   here we just size the box. Reduced-motion swaps the race for a gentle
   breathing pulse (also in CSS). Sized in px via the `size` prop so it drops
   into buttons (sm), section placeholders (md), or full-screen (lg).
-------------------------------------------------------------------------- */
export function Spinner({ size = 'md', className, label = 'Loading' }) {
  // Rendered box width in px; the ∞ keeps a 2:1 aspect (viewBox 100×50).
  const w = size === 'sm' ? 34 : size === 'lg' ? 88 : 58
  // Lemniscate-style figure-8 path (cubic béziers) centered in a 100×50 box.
  const d =
    'M 22 25 C 22 10, 45 10, 50 25 C 55 40, 78 40, 78 25 C 78 10, 55 10, 50 25 C 45 40, 22 40, 22 25 Z'
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('loop-infinity', className)}
      style={{ width: w }}
    >
      <svg viewBox="0 0 100 50" fill="none" aria-hidden="true">
        {/* faint full ∞ track */}
        <path className="loop-infinity-track" d={d} />
        {/* Bright comet segment racing around the same path. pathLength="100"
            normalizes the path to 100 units so the dash math below is exact and
            browser-independent (actual geometry ≈158 units, and it varies per
            engine) — the comet then loops with no seam at the ∞ crossover. */}
        <path className="loop-infinity-comet" d={d} pathLength="100" />
      </svg>
    </span>
  )
}

/* --------------------------------------------------------------------------
   PageLoader — full-viewport-height centered ∞ loader for screens waiting on
   their initial data. Height matches the app shell so it fills the main area
   below the top nav (80px) without pushing the bottom bar off-screen.
-------------------------------------------------------------------------- */
export function PageLoader({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <Spinner size="lg" label={label} />
    </div>
  )
}

/* --------------------------------------------------------------------------
   IconButton — a round icon control for secondary hero actions (Share,
   overflow, socials, back). Sized to sit beside the RSVP/Save buttons so the
   CTA row stays evenly weighted. Keep it visual-only — semantic buttons
   should still carry an aria-label via the `label` prop.
-------------------------------------------------------------------------- */
export function IconButton({ onClick, label, sm = false, children, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'grid flex-shrink-0 place-items-center rounded-full border border-border-light bg-white text-text-secondary transition-colors hover:border-primary hover:text-primary',
        sm ? 'h-10 w-10' : 'h-11 w-11',
        className,
      )}
    >
      {children}
    </button>
  )
}

/* --------------------------------------------------------------------------
   StickyRsvpBar — a floating pill that keeps the RSVP + Save controls in
   reach after the hero CTA scrolls off. Shows the event's own title so the
   user always knows what they're committing to; the price folds onto the
   RSVP button so the number is inseparable from the action.

   Controlled visibility: parent passes `visible` (usually driven by an
   IntersectionObserver on the hero CTA), which fades + slides the pill in.
   While hidden, the whole row is aria-hidden + inert so keyboard/screen-
   reader users don't tab into invisible controls.
-------------------------------------------------------------------------- */
export function StickyRsvpBar({
  title,
  poster,
  price,
  isFree,
  going,
  saved,
  onRsvp,
  onSave,
  onShare,
  visible,
}) {
  const priceLabel = isFree ? 'Free' : price
  const rsvpLabel = going ? 'Going ✓' : priceLabel ? `RSVP · ${priceLabel}` : 'RSVP'
  return (
    <div
      aria-hidden={!visible}
      inert={!visible ? '' : undefined}
      className={cn(
        // Mobile: lift above the fixed BottomBar (h-16 + safe area) so the bar
        // never sits on top of the bottom nav. Desktop has no BottomBar, so it
        // drops back to a normal bottom-4 gutter.
        'fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-[min(calc(100vw-2rem),34rem)] -translate-x-1/2 transition-all duration-300 md:bottom-4',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
      )}
    >
      <div className="flex items-center gap-3 rounded-pill border border-border-light bg-white px-3 py-2 shadow-card-hover">
        <img
          src={poster}
          alt=""
          className="hidden h-10 w-10 flex-shrink-0 rounded-md object-cover sm:block"
        />
        <div className="min-w-0 flex-1 pr-1 leading-tight">
          <span className="block truncate text-sm font-semibold text-ink">{title}</span>
          {priceLabel && (
            <span className="block truncate text-xs text-text-muted">{priceLabel}</span>
          )}
        </div>
        {onShare && (
          <IconButton sm onClick={onShare} label="Share event">
            <Share2 size={16} />
          </IconButton>
        )}
        <SaveBtn sm saved={saved} onToggle={onSave} />
        <RSVPBtn sm variant={going ? 'outline' : 'filled'} onClick={onRsvp}>
          {rsvpLabel}
        </RSVPBtn>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
   InlineAlert — a contextual error/info message rendered right next to the
   form or button that produced it (instead of a bottom-of-screen toast), so
   the user sees the feedback where they're looking. Renders nothing when
   `message` is empty, so callers can render it unconditionally:

     <InlineAlert message={error} />

   `role="alert"` + aria-live announces it to screen readers on appearance.
-------------------------------------------------------------------------- */
export function InlineAlert({ message, variant = 'error', className }) {
  if (!message) return null
  const styles =
    variant === 'error'
      ? 'bg-accent/5 text-accent ring-accent/20'
      : variant === 'success'
        ? 'bg-success/5 text-success ring-success/20'
        : 'bg-primary/5 text-primary ring-primary/20'
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex items-start gap-2 rounded-button px-3 py-2.5 text-sm font-medium ring-1',
        styles,
        className,
      )}
    >
      <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
      <span className="flex-1">{message}</span>
    </div>
  )
}
