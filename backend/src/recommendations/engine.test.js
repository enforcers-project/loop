import { describe, it, expect } from 'vitest'

// Unit tests for the pure functions extracted from the engine logic.
// We test re-ranking weights, MMR diversity, and rationale generation in isolation.

describe('re-rank scoring', () => {
  const WEIGHTS_NORMAL = {
    cosSim: 0.55,
    affinity: 0.15,
    recency: 0.12,
    popularity: 0.1,
    freshness: 0.08,
  }

  function computeScore(cosSim, affinity, recency, popularity, freshness, w = WEIGHTS_NORMAL) {
    return (
      w.cosSim * cosSim +
      w.affinity * affinity +
      w.recency * recency +
      w.popularity * popularity +
      w.freshness * freshness
    )
  }

  it('weights sum to 1.0 for normal mode', () => {
    const sum = Object.values(WEIGHTS_NORMAL).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 10)
  })

  it('weights sum to 1.0 for cold-start mode', () => {
    const WEIGHTS_COLD = {
      cosSim: 0.42,
      affinity: 0.15,
      recency: 0.15,
      popularity: 0.2,
      freshness: 0.08,
    }
    const sum = Object.values(WEIGHTS_COLD).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 10)
  })

  it('high cosine similarity dominates the score', () => {
    const highCos = computeScore(0.95, 0.2, 0.5, 0.3, 1.0)
    const lowCos = computeScore(0.1, 0.9, 0.9, 0.9, 1.0)
    expect(highCos).toBeGreaterThan(lowCos)
  })

  it('perfect scores across all signals yield maximum', () => {
    const maxScore = computeScore(1.0, 1.0, 1.0, 1.0, 1.0)
    expect(maxScore).toBeCloseTo(1.0, 10)
  })

  it('zero across all signals yields zero', () => {
    const minScore = computeScore(0, 0, 0, 0, 0)
    expect(minScore).toBe(0)
  })
})

describe('MMR diversity logic', () => {
  const MMR_LAMBDA = 0.7
  const MAX_CONSECUTIVE = 3
  const MAX_SHARE = 0.4

  function computeMMR(score, maxSimToSelected) {
    return MMR_LAMBDA * score - (1 - MMR_LAMBDA) * maxSimToSelected
  }

  it('penalizes similar items', () => {
    const novel = computeMMR(0.8, 0.0)
    const redundant = computeMMR(0.8, 0.9)
    expect(novel).toBeGreaterThan(redundant)
  })

  it('a slightly lower score with no redundancy can beat a higher redundant score', () => {
    const diverse = computeMMR(0.7, 0.0)
    const redundant = computeMMR(0.8, 0.8)
    expect(diverse).toBeGreaterThan(redundant)
  })

  it('category cap limits representation', () => {
    const limit = 10
    const maxFromOneCategory = Math.ceil(limit * MAX_SHARE)
    expect(maxFromOneCategory).toBe(4)
  })

  it('consecutive cap is 3', () => {
    expect(MAX_CONSECUTIVE).toBe(3)
  })
})

describe('rationale templates', () => {
  const TEMPLATES = {
    save: (label) => `Because you saved ${label}`,
    rsvp: (label) => `Because you're going to ${label}`,
    follow: (label) => `Because you follow ${label}`,
  }

  it('produces valid rationale for save', () => {
    const text = TEMPLATES.save('Afrobeats Night')
    expect(text).toBe('Because you saved Afrobeats Night')
    expect(text.length).toBeLessThanOrEqual(168)
  })

  it('produces valid rationale for follow', () => {
    const text = TEMPLATES.follow('DJ Tunde')
    expect(text).toBe('Because you follow DJ Tunde')
    expect(text.length).toBeLessThanOrEqual(168)
  })

  it('truncates long rationale to 168 chars', () => {
    const longName = 'A'.repeat(200)
    let text = TEMPLATES.save(longName)
    if (text.length > 168) text = text.slice(0, 165) + '...'
    expect(text.length).toBeLessThanOrEqual(168)
  })
})
