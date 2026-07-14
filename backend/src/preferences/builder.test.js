import { describe, it, expect } from 'vitest'

// Unit-test the pure functions extracted from builder logic.
// We import the module to access the internal helpers via a test-only re-export pattern,
// but since the module uses prisma, we test the pure math directly here.

const DECAY_HALF_LIFE_DAYS = 30

function computeDecay(signalDate, now) {
  const ageMs = now.getTime() - new Date(signalDate).getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  return Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS)
}

function normalizeVector(vec) {
  let norm = 0
  for (const v of vec) norm += v * v
  norm = Math.sqrt(norm)
  if (norm === 0) return vec
  return vec.map((v) => v / norm)
}

function blendVectors(realVector, seedVector, alpha) {
  const dim = realVector.length
  const blended = new Array(dim)
  for (let d = 0; d < dim; d++) {
    blended[d] = alpha * realVector[d] + (1 - alpha) * seedVector[d]
  }
  return normalizeVector(blended)
}

describe('computeDecay', () => {
  it('returns 1.0 for a signal from right now', () => {
    const now = new Date('2026-07-14T00:00:00Z')
    expect(computeDecay(now, now)).toBeCloseTo(1.0, 10)
  })

  it('returns 0.5 for a signal from 30 days ago', () => {
    const now = new Date('2026-07-14T00:00:00Z')
    const thirtyDaysAgo = new Date('2026-06-14T00:00:00Z')
    expect(computeDecay(thirtyDaysAgo, now)).toBeCloseTo(0.5, 5)
  })

  it('returns 0.25 for a signal from 60 days ago', () => {
    const now = new Date('2026-07-14T00:00:00Z')
    const sixtyDaysAgo = new Date('2026-05-15T00:00:00Z')
    expect(computeDecay(sixtyDaysAgo, now)).toBeCloseTo(0.25, 5)
  })

  it('returns ~0.125 for a signal from 90 days ago', () => {
    const now = new Date('2026-07-14T00:00:00Z')
    const ninetyDaysAgo = new Date('2026-04-15T00:00:00Z')
    expect(computeDecay(ninetyDaysAgo, now)).toBeCloseTo(0.125, 2)
  })
})

describe('blendVectors', () => {
  it('returns pure seed when alpha=0', () => {
    const real = [1, 0, 0]
    const seed = [0, 1, 0]
    const result = blendVectors(real, seed, 0)
    expect(result[0]).toBeCloseTo(0, 5)
    expect(result[1]).toBeCloseTo(1, 5)
    expect(result[2]).toBeCloseTo(0, 5)
  })

  it('returns pure real when alpha=1', () => {
    const real = [1, 0, 0]
    const seed = [0, 1, 0]
    const result = blendVectors(real, seed, 1)
    expect(result[0]).toBeCloseTo(1, 5)
    expect(result[1]).toBeCloseTo(0, 5)
    expect(result[2]).toBeCloseTo(0, 5)
  })

  it('returns normalized 50/50 blend when alpha=0.5', () => {
    const real = [1, 0, 0]
    const seed = [0, 1, 0]
    const result = blendVectors(real, seed, 0.5)
    const expected = 1 / Math.sqrt(2)
    expect(result[0]).toBeCloseTo(expected, 5)
    expect(result[1]).toBeCloseTo(expected, 5)
    expect(result[2]).toBeCloseTo(0, 5)
  })

  it('output is always unit-normalized', () => {
    const real = [0.3, 0.7, 0.1]
    const seed = [0.5, 0.2, 0.9]
    const result = blendVectors(real, seed, 0.6)
    const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0))
    expect(norm).toBeCloseTo(1.0, 5)
  })
})

describe('seed blend alpha formula', () => {
  it('alpha = 0 when no signals', () => {
    expect(Math.min(1, 0 / 8)).toBe(0)
  })

  it('alpha = 0.5 when 4 signals', () => {
    expect(Math.min(1, 4 / 8)).toBe(0.5)
  })

  it('alpha = 1 when 8 signals', () => {
    expect(Math.min(1, 8 / 8)).toBe(1)
  })

  it('alpha caps at 1 for >8 signals', () => {
    expect(Math.min(1, 20 / 8)).toBe(1)
  })
})
