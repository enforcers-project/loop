import { useState } from 'react'
import { Sparkles, Bookmark, Eye, EyeOff, Check, AlertCircle, Share2 } from 'lucide-react'
import { cn, formatCount, ROLE_STYLE } from '../lib/utils'

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
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-button font-semibold transition-transform active:scale-95',
        // consistent control height: 44px standard, 40px compact (card footers)
        sm ? 'h-10 px-4 text-sm' : 'h-11 px-6 text-sm',
        variant === 'filled'
          ? 'bg-accent text-white shadow-sm hover:opacity-90'
          : 'border border-accent bg-white text-accent hover:bg-accent/5',
      )}
    >
      {children}
    </button>
  )
}

/* --------------------------------------------------------------------------
   SaveBtn — bookmark toggle, filled violet when saved
-------------------------------------------------------------------------- */
export function SaveBtn({ saved, onToggle, sm = false }) {
  return (
    <button
      onClick={onToggle}
      aria-label={saved ? 'Remove bookmark' : 'Bookmark event'}
      aria-pressed={saved}
      className={cn(
        'grid flex-shrink-0 place-items-center rounded-button border transition-colors',
        // square control that matches RSVP height: 40px compact / 44px standard
        sm ? 'h-10 w-10' : 'h-11 w-11',
        saved
          ? 'border-primary bg-primary-light text-primary'
          : 'border-border-light bg-white text-text-secondary hover:border-primary hover:text-primary',
      )}
    >
      <Bookmark size={18} className={saved ? 'fill-primary' : ''} />
    </button>
  )
}

/* --------------------------------------------------------------------------
   FollowBtn — violet fill when not following, bordered gray when following
-------------------------------------------------------------------------- */
export function FollowBtn({ following = false, onToggle, sm = false }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={following}
      className={cn(
        'inline-flex items-center justify-center rounded-button font-semibold transition-colors',
        sm ? 'h-9 min-w-[84px] px-4 text-sm' : 'h-11 min-w-[100px] px-5 text-sm',
        following
          ? 'border border-border-light bg-white text-text-secondary hover:border-text-muted'
          : 'bg-primary text-white hover:opacity-90',
      )}
    >
      {following ? 'Following' : 'Follow'}
    </button>
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
export function GoingStack({ count, avatars = [], size = 'sm' }) {
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
      <span className="text-xs font-medium text-text-secondary">{formatCount(count)} going</span>
    </div>
  )
}

/* --------------------------------------------------------------------------
   Spinner — the app's canonical loading indicator. Ten brand-violet bars
   fanned around a center, each pulsing outward on a staggered delay (see
   `.loop-spinner` in index.css). Sized in px so it drops into buttons (sm),
   section placeholders (md), or full-screen loaders (lg) without extra math.
-------------------------------------------------------------------------- */
export function Spinner({ size = 'md', className, label = 'Loading' }) {
  // Container box; the 10 bars orbit outside it, so visual footprint is ~6.5× px.
  const px = size === 'sm' ? 2.5 : size === 'lg' ? 6 : 4
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('loop-spinner', className)}
      style={{ width: px, height: px }}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} style={{ '--rotation': (i + 1) * 36, '--delay': (i + 1) / 10 }} />
      ))}
    </span>
  )
}

/* --------------------------------------------------------------------------
   PageLoader — full-viewport-height centered spinner for screens waiting on
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
