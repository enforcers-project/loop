import { useState } from 'react'
import { Sparkles, Bookmark, Eye, EyeOff, Check } from 'lucide-react'
import { cn, ROLE_STYLE } from '../lib/utils'

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
  const s = ROLE_STYLE[role]
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {role}
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
   GoingStack — 3 overlapping avatars + "+N going"
-------------------------------------------------------------------------- */
export function GoingStack({ count, avatars, size = 'sm' }) {
  const px = size === 'sm' ? 24 : 32
  const shown = avatars.slice(0, 3)
  const extra = Math.max(0, count - shown.length)
  return (
    <div className="flex items-center gap-2">
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
      <span className="text-xs font-medium text-text-secondary">
        +{extra > 0 ? extra : count} going
      </span>
    </div>
  )
}
