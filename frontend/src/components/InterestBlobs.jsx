// InterestBlobs — a one-page picker that keeps every category world on-screen
// at once. Tapping a category blob "bursts" it into a cluster of smaller
// interest blobs (staggered spring pop-in); tapping the header again re-forms
// the world. Multiple worlds can be open simultaneously and any interest
// picked feeds the shared `picked` Set the parent commits via
// PUT /users/:id/interests → UserInterest → the preference vector builder.
//
// Design intent:
// - Six category worlds sit in a grid. When collapsed, a world is a single
//   organic blob with the category glyph and a "N picked" chip; when expanded,
//   the same card holds a cluster of small blobs in the world's hue.
// - Each expansion is inline — no navigation, no back button. You can open
//   Music AND Sports AND Food at the same time and pick from all three.
// - Motion is deliberate: an ambient drift on the big blob at rest, a
//   spring-based burst on expand where the small blobs cascade out with
//   stagger. Reduce-motion is honored globally via MotionConfig in App.jsx.
// - Selected interests fill with the world's gradient and glow; unselected
//   interests are soft cards tinted in the world's hue so the cluster reads
//   as one family rather than a wall of pills.

import { useMemo, useState } from 'react'
import {
  Check,
  Music2,
  Moon,
  Trophy,
  Users,
  UtensilsCrossed,
  GraduationCap,
  Minus,
  Plus,
  Sparkles,
} from 'lucide-react'
import { m, AnimatePresence } from 'motion/react'
import { cn } from '../lib/utils'

// Per-category visual treatment. Colors mirror the Figma category tokens (see
// src/index.css `@theme` + backend seed CATEGORIES). Each entry has:
//   Icon:     the lucide icon rendered inside the collapsed blob
//   from/to:  the two hex stops that build the CSS radial-gradient — the
//             lighter shade wraps the darker one so the blob has depth
//   accent:   the deeper shade used for the selected interest fill
//   soft:     an rgba tint used on unselected interest blobs so the cluster
//             still visually belongs to this world without shouting
//   blob:     an asymmetric border-radius string that makes the blob organic
const CATEGORY_META = {
  Music: {
    Icon: Music2,
    from: '#B7AEFF',
    to: '#6D5EFC',
    accent: '#5949E8',
    soft: 'rgba(109, 94, 252, 0.10)',
    blob: '62% 38% 58% 42% / 45% 55% 45% 55%',
  },
  Nightlife: {
    Icon: Moon,
    from: '#FF9DBE',
    to: '#FF2E74',
    accent: '#E01A5F',
    soft: 'rgba(255, 46, 116, 0.10)',
    blob: '55% 45% 65% 35% / 50% 40% 60% 50%',
  },
  Sports: {
    Icon: Trophy,
    from: '#8BE8C4',
    to: '#16C784',
    accent: '#0FA36A',
    soft: 'rgba(22, 199, 132, 0.11)',
    blob: '60% 40% 55% 45% / 55% 45% 55% 45%',
  },
  Networking: {
    Icon: Users,
    from: '#9ECBFF',
    to: '#2D8CFF',
    accent: '#1E6FD9',
    soft: 'rgba(45, 140, 255, 0.10)',
    blob: '52% 48% 60% 40% / 50% 50% 50% 50%',
  },
  Food: {
    Icon: UtensilsCrossed,
    from: '#FFD98A',
    to: '#FFB020',
    accent: '#E89400',
    soft: 'rgba(255, 176, 32, 0.14)',
    blob: '55% 45% 50% 50% / 60% 40% 60% 40%',
  },
  Campus: {
    Icon: GraduationCap,
    from: '#FFB59A',
    to: '#FF7A45',
    accent: '#E56428',
    soft: 'rgba(255, 122, 69, 0.12)',
    blob: '58% 42% 55% 45% / 45% 55% 45% 55%',
  },
}

const FALLBACK_META = {
  Icon: Sparkles,
  from: '#D0D0DA',
  to: '#71717A',
  accent: '#4B4B55',
  soft: 'rgba(113, 113, 122, 0.10)',
  blob: '55% 45% 60% 40% / 50% 50% 50% 50%',
}

// Six asymmetric radii the interest blobs sample from — combined with the
// stagger this gives every blob in the cluster its own silhouette without
// hand-picking one per interest.
const INTEREST_SHAPES = [
  '58% 42% 55% 45% / 45% 55% 45% 55%',
  '62% 38% 48% 52% / 55% 45% 55% 45%',
  '50% 50% 65% 35% / 60% 40% 60% 40%',
  '55% 45% 58% 42% / 45% 55% 45% 55%',
  '65% 35% 50% 50% / 50% 60% 40% 50%',
  '48% 52% 62% 38% / 55% 45% 55% 45%',
]

// A sibling shape for each INTEREST_SHAPES entry — used as the hover-morph
// target so a small blob squishes into a distinctly different silhouette.
const INTEREST_HOVER_SHAPES = [
  '42% 58% 45% 55% / 55% 45% 55% 45%',
  '38% 62% 55% 45% / 45% 55% 45% 55%',
  '65% 35% 50% 50% / 40% 60% 40% 60%',
  '45% 55% 42% 58% / 55% 45% 55% 45%',
  '35% 65% 55% 45% / 60% 40% 60% 40%',
  '55% 45% 38% 62% / 45% 55% 45% 55%',
]

// A four-frame morph cycle for the big category blob so it visibly shape-shifts
// like a lava-lamp bubble rather than just floating up and down. Combining
// this with the y/rotate keyframes gives the "gelatinous" feel — every phase
// of the loop lands on a different silhouette.
const CATEGORY_MORPH_CYCLE = [
  '62% 38% 58% 42% / 45% 55% 45% 55%',
  '48% 52% 62% 38% / 60% 40% 55% 45%',
  '55% 45% 45% 55% / 50% 50% 60% 40%',
  '65% 35% 50% 50% / 40% 60% 45% 55%',
]

// The "recoil" silhouettes each category snaps to when the cursor enters —
// stubbier / squished so the blob visually flinches from your finger.
const CATEGORY_RECOIL_SHAPE = {
  Music: '48% 52% 42% 58% / 60% 40% 60% 40%',
  Nightlife: '42% 58% 55% 45% / 65% 35% 55% 45%',
  Sports: '45% 55% 40% 60% / 55% 45% 60% 40%',
  Networking: '55% 45% 45% 55% / 60% 40% 55% 45%',
  Food: '40% 60% 50% 50% / 55% 45% 65% 35%',
  Campus: '52% 48% 45% 55% / 55% 45% 60% 40%',
}

// Ambient drift for a collapsed world — a slow, phased float so the group
// breathes together without syncing. Each world's index seeds its delay AND
// which frame of the morph cycle it starts on, so no two blobs are on the
// same beat.
function driftFor(idx) {
  const shift = idx % CATEGORY_MORPH_CYCLE.length
  const cycle = [
    ...CATEGORY_MORPH_CYCLE.slice(shift),
    ...CATEGORY_MORPH_CYCLE.slice(0, shift),
    CATEGORY_MORPH_CYCLE[shift],
  ]
  return {
    y: [0, -6, 0, 4, 0],
    x: [0, idx % 2 === 0 ? 2 : -2, 0, idx % 2 === 0 ? -2 : 2, 0],
    rotate: [0, 1.2, 0, -1.5, 0],
    borderRadius: cycle,
    transition: {
      duration: 7,
      repeat: Infinity,
      ease: 'easeInOut',
      delay: (idx * 0.35) % 2,
    },
  }
}

// Burst container stagger — each interest child springs in in sequence.
const clusterParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.06 } },
  exit: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
}
const clusterChild = {
  hidden: { opacity: 0, scale: 0.3, y: 12 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 340, damping: 20 },
  },
  exit: {
    opacity: 0,
    scale: 0.4,
    transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
  },
}

// Build the soft radial gradient that fills a blob. The lighter stop sits
// off-centre so the blob catches a highlight and reads as three-dimensional.
function blobGradient(meta) {
  return `radial-gradient(circle at 30% 25%, ${meta.from} 0%, ${meta.to} 65%, ${meta.accent} 100%)`
}

function pickedInCategory(items, picked) {
  let n = 0
  for (const i of items) if (picked.has(i.id)) n += 1
  return n
}

/**
 * @param interests  all interests ({ id, label, category, … })
 * @param picked     Set<string> of currently selected interest ids
 * @param onToggle   (id) => void — toggles the interest in `picked`
 * @param minPicks   badge threshold — shown on the picked-count chip
 */
export function InterestBlobs({ interests, picked, onToggle, minPicks = 3 }) {
  // Which worlds are currently "burst". Any number can be open at once — the
  // whole point of the redesign is that picking from multiple worlds never
  // costs a screen change.
  const [expanded, setExpanded] = useState(() => new Set())

  // Preserve the seed's category order (its arrays are already grouped).
  const worlds = useMemo(() => {
    const map = new Map()
    for (const i of interests) {
      if (!map.has(i.category)) map.set(i.category, [])
      map.get(i.category).push(i)
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }))
  }, [interests])

  const toggleWorld = (name) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  return (
    <div>
      {/* picked-count chip — pinned above the grid so it's always visible */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold transition-colors',
            picked.size >= minPicks
              ? 'bg-success/15 text-success'
              : 'bg-surface text-text-secondary',
          )}
        >
          <Check size={12} className={picked.size >= minPicks ? 'opacity-100' : 'opacity-40'} />
          {picked.size} selected
        </span>
        <p className="text-xs text-text-muted">
          Tap a world to open it. Open as many worlds as you want — every pick tunes your feed.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {worlds.map(({ name, items }, idx) => {
          const meta = CATEGORY_META[name] ?? FALLBACK_META
          const isOpen = expanded.has(name)
          const pickedHere = pickedInCategory(items, picked)
          return (
            <World
              key={name}
              name={name}
              items={items}
              idx={idx}
              meta={meta}
              isOpen={isOpen}
              pickedHere={pickedHere}
              picked={picked}
              onToggleWorld={() => toggleWorld(name)}
              onToggleInterest={onToggle}
            />
          )
        })}
      </div>
    </div>
  )
}

// A single category card. Collapsed = the big blob. Expanded = a header row
// with the world's name + collapse button, and the cluster of interest blobs
// beneath it. The card's own height grows to fit whichever state it's in;
// worlds beside it stay untouched.
function World({
  name,
  items,
  idx,
  meta,
  isOpen,
  pickedHere,
  picked,
  onToggleWorld,
  onToggleInterest,
}) {
  return (
    <div
      className={cn(
        'relative rounded-card border transition-colors',
        isOpen ? 'border-border-light bg-card-bg shadow-card' : 'border-transparent bg-transparent',
      )}
      style={isOpen ? { boxShadow: `0 12px 32px -20px ${meta.accent}` } : undefined}
    >
      <AnimatePresence mode="wait" initial={false}>
        {!isOpen ? (
          <CollapsedWorld
            name={name}
            idx={idx}
            meta={meta}
            pickedHere={pickedHere}
            onClick={onToggleWorld}
          />
        ) : (
          <m.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.18 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="flex flex-col px-5 py-5"
          >
            {/* header row — small blob glyph + world name + collapse button */}
            <div className="mb-3 flex items-center gap-2.5">
              <m.span
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                style={{
                  borderRadius: meta.blob,
                  background: blobGradient(meta),
                }}
                className="grid h-9 w-9 flex-shrink-0 place-items-center text-white shadow-[0_6px_14px_-6px_rgba(0,0,0,0.35)]"
              >
                <meta.Icon size={16} strokeWidth={2.4} />
              </m.span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold leading-none text-ink">{name}</p>
                <p className="mt-1 text-[11px] text-text-muted">
                  {pickedHere > 0
                    ? `${pickedHere} of ${items.length} picked`
                    : `${items.length} to explore`}
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleWorld}
                aria-label={`Close ${name}`}
                aria-expanded="true"
                className="grid h-7 w-7 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <Minus size={14} strokeWidth={2.5} />
              </button>
            </div>

            {/* burst cluster — small blobs pop out with a staggered spring.
                2-col grid inside each world card so each interest tile is
                large enough for two-word labels ("Rooftop Parties",
                "Silent Disco") to sit inside without wrapping into a stack
                of one-letter lines. */}
            <m.div
              variants={clusterParent}
              initial="hidden"
              animate="show"
              exit="exit"
              className="grid grid-cols-2 gap-3"
            >
              {items.map((interest, i) => {
                const on = picked.has(interest.id)
                const shape = INTEREST_SHAPES[i % INTEREST_SHAPES.length]
                const hoverShape = INTEREST_HOVER_SHAPES[i % INTEREST_HOVER_SHAPES.length]
                return (
                  <m.button
                    key={interest.id}
                    type="button"
                    variants={clusterChild}
                    onClick={() => onToggleInterest(interest.id)}
                    // Hover recoil: the blob squishes into a new silhouette and
                    // scales up ~7%. Tap collapses it hard so the touch reads.
                    whileHover={{
                      scale: 1.07,
                      borderRadius: hoverShape,
                      y: -3,
                      transition: { type: 'spring', stiffness: 320, damping: 14 },
                    }}
                    whileTap={{
                      scale: 0.88,
                      borderRadius: '50% 50% 50% 50% / 50% 50% 50% 50%',
                      transition: { type: 'spring', stiffness: 500, damping: 18 },
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                    style={{
                      borderRadius: shape,
                      background: on ? blobGradient(meta) : meta.soft,
                      boxShadow: on
                        ? `0 10px 22px -12px ${meta.accent}`
                        : `inset 0 0 0 1px ${meta.soft}`,
                    }}
                    className={cn(
                      'relative flex aspect-square w-full items-center justify-center overflow-hidden px-3 py-2 text-center text-[13px] font-semibold leading-tight transition-colors',
                      on ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.25)]' : 'text-ink',
                    )}
                    aria-pressed={on}
                  >
                    {/* Cap the content to the blob's inner width and clamp long
                        labels — without this a multi-word interest wraps past
                        the round outline and collides with the neighbouring
                        blob. `break-words` splits an over-long single word;
                        `line-clamp-3` keeps the stack inside the square. */}
                    <span className="relative flex max-w-full flex-col items-center gap-1.5">
                      {on && (
                        <m.span
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                          className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white/30"
                        >
                          <Check size={10} strokeWidth={3} />
                        </m.span>
                      )}
                      <span className="line-clamp-3 break-words px-1 leading-snug">
                        {interest.label}
                      </span>
                    </span>
                  </m.button>
                )
              })}
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* When collapsed and any picks exist, hint the world can be re-opened —
          the top-right plus button provides an obvious re-entry without needing
          to hit the big blob again. */}
      {!isOpen && pickedHere === 0 && (
        <span className="pointer-events-none absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-white/85 text-text-secondary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          <Plus size={12} strokeWidth={2.4} />
        </span>
      )}
    </div>
  )
}

// The big collapsed blob. Split into its own component so it can own a local
// `hovered` state — motion's `animate` prop needs to swap between the ambient
// drift keyframes and a static "recoil" pose on hover, which can't be
// expressed via whileHover alone (whileHover overrides `animate` wholesale,
// losing the morphing borderRadius cycle we want on idle).
//
// The wrapper button owns the scale/press spring; the inner span owns the
// blob shape + drift so the two can animate independently without stomping
// on each other's transition specs.
function CollapsedWorld({ name, idx, meta, pickedHere, onClick }) {
  const [hovered, setHovered] = useState(false)
  const recoilShape = CATEGORY_RECOIL_SHAPE[name] ?? meta.blob

  const idleAnim = driftFor(idx)
  const hoverAnim = {
    y: -8,
    x: 0,
    rotate: [0, -6, 4, -3, 0],
    scale: 0.94,
    borderRadius: recoilShape,
    transition: {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
      rotate: { duration: 0.6, ease: 'easeInOut' },
    },
  }

  return (
    <m.button
      key="collapsed"
      type="button"
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      whileTap={{ scale: 0.92 }}
      className="group relative flex aspect-square w-full items-center justify-center overflow-visible focus:outline-none"
      aria-label={`Open ${name} interests`}
      aria-expanded="false"
    >
      {/* The blob itself. On hover it recoils inward and shifts to a stubby
          silhouette; on release it eases back into the ambient morph cycle. */}
      <m.span
        animate={hovered ? hoverAnim : idleAnim}
        style={{
          borderRadius: meta.blob,
          background: blobGradient(meta),
        }}
        className="absolute inset-2 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.35)]"
      />
      {/* Icon + label sit above the blob, with their own gentle nudge on
          hover so they don't feel welded to a rigid frame. */}
      <m.span
        animate={hovered ? { y: -4, scale: 0.96 } : { y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        className="relative flex flex-col items-center gap-1 text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
      >
        <meta.Icon size={30} strokeWidth={2} />
        <span className="text-sm font-bold tracking-tight">{name}</span>
        {pickedHere > 0 && (
          <span className="mt-0.5 rounded-pill bg-white/25 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {pickedHere} picked
          </span>
        )}
      </m.span>
    </m.button>
  )
}
