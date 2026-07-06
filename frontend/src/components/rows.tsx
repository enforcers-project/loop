import { Mic, MapPin, Search } from 'lucide-react'
import { cn } from '../lib/utils'
import type { Category } from '../lib/types'

/* Single selected-state standard across the app: filled #6D5EFC + white text. */
const pillBase =
  'flex-shrink-0 whitespace-nowrap rounded-pill px-4 py-2 text-sm font-medium transition-colors border'
const pillSelected = 'bg-primary text-white border-primary'
const pillUnselected = 'bg-white text-text-secondary border-border-light hover:border-text-muted'

/* --------------------------------------------------------------------------
   CatRow — horizontal scrollable category chip row
-------------------------------------------------------------------------- */
const CATS: (Category | 'All')[] = [
  'All',
  'Music',
  'Nightlife',
  'Sports',
  'Networking',
  'Food',
  'Campus',
]

export function CatRow({
  active,
  onChange,
}: {
  active: Category | 'All'
  onChange: (c: Category | 'All') => void
}) {
  return (
    <div className="scrollbar-hide -mx-5 flex gap-2 overflow-x-auto px-5 py-1">
      {CATS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={cn(pillBase, active === c ? pillSelected : pillUnselected)}
        >
          {c}
        </button>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------------------
   FilterBar — horizontal scrollable filter pills (multi-select)
-------------------------------------------------------------------------- */
export interface Filters {
  free: boolean
  today: boolean
  weekend: boolean
  sports: boolean
  nearby: boolean
}
const FILTER_DEFS: { key: keyof Filters; label: string }[] = [
  { key: 'free', label: 'Free' },
  { key: 'today', label: 'Today' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'sports', label: 'Pickup runs' },
  { key: 'nearby', label: 'Nearby' },
]

export function FilterBar({
  filters,
  onToggle,
}: {
  filters: Filters
  onToggle: (k: keyof Filters) => void
}) {
  return (
    <div className="scrollbar-hide -mx-5 flex gap-2 overflow-x-auto px-5 py-1">
      {FILTER_DEFS.map((f) => (
        <button
          key={f.key}
          onClick={() => onToggle(f.key)}
          className={cn(pillBase, filters[f.key] ? pillSelected : pillUnselected)}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------------------
   SearchBar — NL placeholder, optional mic + location icons
-------------------------------------------------------------------------- */
export function SearchBar({
  value,
  onChange,
  onSubmit,
  showMic = true,
  showLocation = true,
  city = 'Oakland',
  placeholder = "Try 'free Afrobeats party this weekend'",
}: {
  value: string
  onChange: (v: string) => void
  onSubmit?: () => void
  showMic?: boolean
  showLocation?: boolean
  city?: string
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-input border border-border-light bg-white px-4 py-3 shadow-card focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
      <Search size={18} className="flex-shrink-0 text-text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-placeholder"
      />
      {showLocation && (
        <button className="hidden items-center gap-1 rounded-pill bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary sm:flex">
          <MapPin size={13} />
          {city}
        </button>
      )}
      {showMic && (
        <button className="flex-shrink-0 text-text-muted hover:text-primary" aria-label="Voice search">
          <Mic size={18} />
        </button>
      )}
    </div>
  )
}
