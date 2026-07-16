import { Mic, MapPin, Search } from 'lucide-react'
import { cn } from '../lib/utils'

/* Single selected-state standard across the app: filled #6D5EFC + white text. */
const pillBase =
  'flex-shrink-0 whitespace-nowrap rounded-pill px-4 py-2 text-sm font-medium transition-colors border'
const pillSelected = 'bg-primary text-white border-primary'
const pillUnselected = 'bg-white text-text-secondary border-border-light hover:border-text-muted'

/* --------------------------------------------------------------------------
   CatRow — horizontal scrollable category chip row
-------------------------------------------------------------------------- */
const CATS = ['All', 'Music', 'Nightlife', 'Sports', 'Networking', 'Food', 'Campus']

export function CatRow({ active, onChange }) {
  return (
    <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 py-1 md:-mx-6 md:px-6">
      {CATS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          aria-pressed={active === c}
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
const FILTER_DEFS = [
  { key: 'free', label: 'Free' },
  { key: 'today', label: 'Today' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'sports', label: 'Pickup runs' },
  { key: 'nearby', label: 'Nearby' },
]

export function FilterBar({ filters, onToggle }) {
  return (
    <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 py-1 md:-mx-6 md:px-6">
      {FILTER_DEFS.map((f) => (
        <button
          key={f.key}
          onClick={() => onToggle(f.key)}
          aria-pressed={filters[f.key]}
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
  city,
  placeholder = "Try 'free Afrobeats party this weekend'",
}) {
  return (
    <div className="flex h-[52px] items-center gap-2 rounded-input border border-border-light bg-white px-4 shadow-card transition-shadow focus-within:border-primary focus-within:shadow-card-hover focus-within:ring-2 focus-within:ring-primary/15">
      <Search size={20} className="flex-shrink-0 text-text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
        placeholder={placeholder}
        aria-label="Search events"
        className="min-w-0 flex-1 bg-transparent text-[15px] text-text-primary outline-none placeholder:text-placeholder"
      />
      {showLocation && city && (
        <button
          className="hidden h-8 items-center gap-1 rounded-pill bg-surface px-3 text-xs font-semibold text-text-secondary transition-colors hover:text-ink sm:flex"
          aria-label={`Location: ${city}`}
        >
          <MapPin size={14} className="text-text-muted" />
          {city}
        </button>
      )}
      {showMic && (
        <button
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-primary"
          aria-label="Search by voice"
        >
          <Mic size={18} />
        </button>
      )}
    </div>
  )
}
