import { describe, it, expect } from 'vitest'
import { haversine, proximityScore } from './proximity.js'

describe('haversine', () => {
  it('returns 0 for the same point', () => {
    expect(haversine(40.7128, -74.006, 40.7128, -74.006)).toBe(0)
  })

  it('calculates known distance: NYC to LA (~2,451 miles)', () => {
    const dist = haversine(40.7128, -74.006, 34.0522, -118.2437)
    expect(dist).toBeGreaterThan(2440)
    expect(dist).toBeLessThan(2460)
  })

  it('calculates short distance: ~1 mile apart', () => {
    // 1 degree of latitude ~ 69 miles, so 1/69 degree ~ 1 mile
    const dist = haversine(40.0, -74.0, 40.0 + 1 / 69, -74.0)
    expect(dist).toBeCloseTo(1.0, 0)
  })

  it('is symmetric: haversine(A, B) === haversine(B, A)', () => {
    const ab = haversine(51.5074, -0.1278, 48.8566, 2.3522)
    const ba = haversine(48.8566, 2.3522, 51.5074, -0.1278)
    expect(ab).toBeCloseTo(ba, 10)
  })

  it('handles equator crossing', () => {
    const dist = haversine(1.0, 0.0, -1.0, 0.0)
    expect(dist).toBeGreaterThan(137)
    expect(dist).toBeLessThan(139)
  })

  it('handles international date line crossing', () => {
    const dist = haversine(0.0, 179.0, 0.0, -179.0)
    expect(dist).toBeGreaterThan(137)
    expect(dist).toBeLessThan(139)
  })

  it('handles negative coordinates', () => {
    const dist = haversine(-33.8688, 151.2093, -37.8136, 144.9631)
    expect(dist).toBeGreaterThan(440)
    expect(dist).toBeLessThan(470)
  })
})

describe('proximityScore', () => {
  it('returns 1.0 for distance 0', () => {
    expect(proximityScore(0)).toBe(1.0)
  })

  it('returns 1.0 for negative distance (edge case)', () => {
    expect(proximityScore(-5)).toBe(1.0)
  })

  it('decays toward 0 for very large distances', () => {
    const score = proximityScore(100)
    expect(score).toBeLessThan(0.01)
  })

  it('is approximately 0.37 at exactly the decay radius (e^-1)', () => {
    const score = proximityScore(5, 5)
    expect(score).toBeCloseTo(Math.exp(-1), 5)
  })

  it('is approximately 0.135 at 2x the decay radius (e^-2)', () => {
    const score = proximityScore(10, 5)
    expect(score).toBeCloseTo(Math.exp(-2), 5)
  })

  it('closer events score higher than farther events', () => {
    const close = proximityScore(0.5)
    const medium = proximityScore(3)
    const far = proximityScore(10)
    expect(close).toBeGreaterThan(medium)
    expect(medium).toBeGreaterThan(far)
  })

  it('respects custom decay radius', () => {
    const tightDecay = proximityScore(5, 2)
    const looseDecay = proximityScore(5, 10)
    expect(looseDecay).toBeGreaterThan(tightDecay)
  })

  it('score is always between 0 and 1', () => {
    const distances = [0, 0.1, 0.5, 1, 2, 5, 10, 20, 50, 100]
    for (const d of distances) {
      const score = proximityScore(d)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }
  })

  it('half-mile event scores very high (~0.90)', () => {
    const score = proximityScore(0.5)
    expect(score).toBeGreaterThan(0.89)
    expect(score).toBeLessThan(0.92)
  })

  it('3-mile event scores moderately (~0.55)', () => {
    const score = proximityScore(3)
    expect(score).toBeGreaterThan(0.54)
    expect(score).toBeLessThan(0.56)
  })
})
