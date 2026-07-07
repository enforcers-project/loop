import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Navigation, Search } from 'lucide-react'
import { api } from '../lib/api'
import type { Interest } from '../lib/types'
import { useApp } from '../context/AppContext'
import { cn } from '../lib/utils'

const CITIES = [
  'Oakland, CA',
  'San Francisco, CA',
  'Berkeley, CA',
  'San Jose, CA',
  'New York, NY',
  'Atlanta, GA',
]

export function Onboarding() {
  const navigate = useNavigate()
  const { setInterests } = useApp()
  const [step, setStep] = useState<1 | 2>(1)
  const [interests, setInterestList] = useState<Interest[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [citySearch, setCitySearch] = useState('')
  const [city, setCity] = useState<string | null>(null)

  useEffect(() => {
    api.interests().then(setInterestList)
  }, [])

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const canContinue = picked.size >= 3
  const cities = CITIES.filter((c) => c.toLowerCase().includes(citySearch.toLowerCase()))

  const finish = () => {
    setInterests([...picked])
    navigate('/feed')
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10">
      {/* progress */}
      <div className="mb-8 flex items-center gap-2">
        {[1, 2].map((s) => (
          <span
            key={s}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              step >= s ? 'bg-primary' : 'bg-border-light',
            )}
          />
        ))}
      </div>

      {step === 1 ? (
        <div className="flex flex-1 flex-col">
          <h1 className="font-display text-3xl font-bold text-ink">What are you into?</h1>
          <div className="mt-2 flex items-center gap-3">
            <p className="text-sm text-text-secondary">Pick at least 3 — we’ll tune your feed.</p>
            <span
              className={cn(
                'rounded-pill px-2.5 py-1 text-xs font-semibold',
                canContinue ? 'bg-success/15 text-success' : 'bg-surface text-text-muted',
              )}
            >
              {picked.size} selected
            </span>
          </div>

          {/* chips flush below subhead */}
          <div className="mt-6 flex flex-wrap gap-2">
            {interests.map((i) => {
              const on = picked.has(i.id)
              return (
                <button
                  key={i.id}
                  onClick={() => toggle(i.id)}
                  className={cn(
                    'rounded-pill border px-4 py-2 text-sm font-medium transition-colors',
                    on
                      ? 'border-primary bg-primary text-white'
                      : 'border-border-light bg-white text-text-secondary hover:border-text-muted',
                  )}
                >
                  {i.label}
                </button>
              )
            })}
          </div>

          {/* CTA pushed to bottom */}
          <div className="mt-auto pt-10">
            <button
              disabled={!canContinue}
              onClick={() => setStep(2)}
              className={cn(
                'w-full rounded-button py-3.5 text-sm font-semibold transition-colors',
                canContinue
                  ? 'bg-accent text-white active:scale-95'
                  : 'cursor-not-allowed bg-surface text-text-muted',
              )}
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <h1 className="font-display text-3xl font-bold text-ink">Where are you?</h1>
          <p className="mt-2 text-sm text-text-secondary">
            We’ll show you events happening nearby.
          </p>

          {/* city search */}
          <div className="mt-6 flex items-center gap-2 rounded-input border border-border-light bg-white px-4 py-3 focus-within:border-primary">
            <Search size={18} className="text-text-muted" />
            <input
              value={citySearch}
              onChange={(e) => setCitySearch(e.target.value)}
              placeholder="Search your city"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-placeholder"
            />
          </div>

          {/* use my location */}
          <button
            onClick={() => setCity('Oakland, CA')}
            className="mt-3 flex w-full items-center gap-2 rounded-button border border-primary bg-primary-light px-4 py-3 text-sm font-semibold text-primary"
          >
            <Navigation size={16} /> Use my current location
          </button>

          {/* city options */}
          <div className="mt-4 space-y-1.5">
            {cities.map((c) => (
              <button
                key={c}
                onClick={() => setCity(c)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-button border px-4 py-3 text-left text-sm transition-colors',
                  city === c
                    ? 'border-primary bg-primary text-white'
                    : 'border-border-light bg-white text-text-primary hover:border-text-muted',
                )}
              >
                <MapPin size={16} className={city === c ? 'text-white' : 'text-text-muted'} />
                {c}
              </button>
            ))}
          </div>

          <div className="mt-auto pt-10">
            <button
              disabled={!city}
              onClick={finish}
              className={cn(
                'w-full rounded-button py-3.5 text-sm font-semibold transition-colors',
                city
                  ? 'bg-accent text-white active:scale-95'
                  : 'cursor-not-allowed bg-surface text-text-muted',
              )}
            >
              Finish — take me to my feed
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
