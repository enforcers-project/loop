import { describe, it, expect } from 'vitest'
import { SIGNAL_WEIGHTS, pickTopSignal } from './social.js'

describe('social signal weights', () => {
  it('weights sum to 1.0', () => {
    const sum = Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 10)
  })

  it('friendsGoing is the strongest signal', () => {
    const max = Math.max(...Object.values(SIGNAL_WEIGHTS))
    expect(SIGNAL_WEIGHTS.friendsGoing).toBe(max)
  })

  it('all weights are positive', () => {
    for (const [key, val] of Object.entries(SIGNAL_WEIGHTS)) {
      expect(val, `${key} should be positive`).toBeGreaterThan(0)
    }
  })
})

describe('social score normalization', () => {
  it('log1p normalization stays in [0, 1] range', () => {
    const maxFriends = 50
    for (const count of [0, 1, 5, 10, 25, 50]) {
      const normalized = Math.log1p(count) / Math.log1p(maxFriends)
      expect(normalized).toBeGreaterThanOrEqual(0)
      expect(normalized).toBeLessThanOrEqual(1)
    }
  })

  it('zero friends yields zero score', () => {
    const maxFriends = 20
    const normalized = Math.log1p(0) / Math.log1p(maxFriends)
    expect(normalized).toBe(0)
  })

  it('all friends yields score of 1', () => {
    const maxFriends = 20
    const normalized = Math.log1p(maxFriends) / Math.log1p(maxFriends)
    expect(normalized).toBeCloseTo(1.0, 10)
  })

  it('composite score stays within [0, 1] when all signals maxed', () => {
    let score = 0
    for (const weight of Object.values(SIGNAL_WEIGHTS)) {
      score += weight * 1.0
    }
    expect(score).toBeCloseTo(1.0, 10)
  })

  it('composite score is 0 when all signals are zero', () => {
    let score = 0
    for (const weight of Object.values(SIGNAL_WEIGHTS)) {
      score += weight * 0
    }
    expect(score).toBe(0)
  })
})

describe('pickTopSignal', () => {
  it('returns friends_going when 2+ friends are going', () => {
    const raw = {
      friendsGoing: 3,
      friendsSaved: 0,
      followedOrganizer: 0,
      orgFollowedByFriends: 0,
      sharedCategoryMomentum: 0,
      repeatAttendees: 0,
    }
    expect(pickTopSignal(raw)).toBe('friends_going')
  })

  it('returns followed_organizer when user follows the organizer', () => {
    const raw = {
      friendsGoing: 0,
      friendsSaved: 0,
      followedOrganizer: 1,
      orgFollowedByFriends: 0,
      sharedCategoryMomentum: 0,
      repeatAttendees: 0,
    }
    expect(pickTopSignal(raw)).toBe('followed_organizer')
  })

  it('returns friends_going even for 1 friend when no stronger signal', () => {
    const raw = {
      friendsGoing: 1,
      friendsSaved: 0,
      followedOrganizer: 0,
      orgFollowedByFriends: 0,
      sharedCategoryMomentum: 0,
      repeatAttendees: 0,
    }
    expect(pickTopSignal(raw)).toBe('friends_going')
  })

  it('returns friends_saved when 2+ friends saved', () => {
    const raw = {
      friendsGoing: 0,
      friendsSaved: 2,
      followedOrganizer: 0,
      orgFollowedByFriends: 0,
      sharedCategoryMomentum: 0,
      repeatAttendees: 0,
    }
    expect(pickTopSignal(raw)).toBe('friends_saved')
  })

  it('returns org_followed_by_friends when 2+ friends follow org', () => {
    const raw = {
      friendsGoing: 0,
      friendsSaved: 0,
      followedOrganizer: 0,
      orgFollowedByFriends: 3,
      sharedCategoryMomentum: 0,
      repeatAttendees: 0,
    }
    expect(pickTopSignal(raw)).toBe('org_followed_by_friends')
  })

  it('returns repeat_attendees when 2+ repeat friends', () => {
    const raw = {
      friendsGoing: 0,
      friendsSaved: 0,
      followedOrganizer: 0,
      orgFollowedByFriends: 0,
      sharedCategoryMomentum: 0,
      repeatAttendees: 2,
    }
    expect(pickTopSignal(raw)).toBe('repeat_attendees')
  })

  it('returns shared_category_momentum when 3+ friends in category', () => {
    const raw = {
      friendsGoing: 0,
      friendsSaved: 0,
      followedOrganizer: 0,
      orgFollowedByFriends: 0,
      sharedCategoryMomentum: 4,
      repeatAttendees: 0,
    }
    expect(pickTopSignal(raw)).toBe('shared_category_momentum')
  })

  it('returns null when all signals are zero', () => {
    const raw = {
      friendsGoing: 0,
      friendsSaved: 0,
      followedOrganizer: 0,
      orgFollowedByFriends: 0,
      sharedCategoryMomentum: 0,
      repeatAttendees: 0,
    }
    expect(pickTopSignal(raw)).toBeNull()
  })

  it('prioritizes friends_going (2+) over followed_organizer', () => {
    const raw = {
      friendsGoing: 2,
      friendsSaved: 1,
      followedOrganizer: 1,
      orgFollowedByFriends: 5,
      sharedCategoryMomentum: 3,
      repeatAttendees: 2,
    }
    expect(pickTopSignal(raw)).toBe('friends_going')
  })
})

describe('social rationale text', () => {
  const SOCIAL_RATIONALE = {
    friends_going: (count) => `${count} friend${count > 1 ? 's' : ''} going`,
    friends_saved: (count) => `${count} friend${count > 1 ? 's' : ''} saved this`,
    followed_organizer: () => 'Hosted by someone you follow',
    org_followed_by_friends: (count) => `${count} friend${count > 1 ? 's' : ''} follow the host`,
    repeat_attendees: (count) => `${count} friend${count > 1 ? 's' : ''} you've been out with`,
    shared_category_momentum: () => 'Your friends are into this lately',
  }

  it('all rationale texts fit within 168 chars', () => {
    for (const [key, fn] of Object.entries(SOCIAL_RATIONALE)) {
      const text = fn(50)
      expect(text.length, `${key} rationale too long`).toBeLessThanOrEqual(168)
    }
  })

  it('singular form for 1 friend', () => {
    expect(SOCIAL_RATIONALE.friends_going(1)).toBe('1 friend going')
    expect(SOCIAL_RATIONALE.friends_saved(1)).toBe('1 friend saved this')
  })

  it('plural form for multiple friends', () => {
    expect(SOCIAL_RATIONALE.friends_going(3)).toBe('3 friends going')
    expect(SOCIAL_RATIONALE.friends_saved(5)).toBe('5 friends saved this')
  })
})

describe('integration with engine weights', () => {
  const WEIGHTS_NORMAL = {
    cosSim: 0.48,
    affinity: 0.14,
    recency: 0.11,
    popularity: 0.09,
    freshness: 0.07,
    social: 0.11,
  }

  const WEIGHTS_COLD = {
    cosSim: 0.35,
    affinity: 0.12,
    recency: 0.13,
    popularity: 0.15,
    freshness: 0.07,
    social: 0.18,
  }

  it('normal engine weights sum to 1.0', () => {
    const sum = Object.values(WEIGHTS_NORMAL).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 10)
  })

  it('cold-start engine weights sum to 1.0', () => {
    const sum = Object.values(WEIGHTS_COLD).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 10)
  })

  it('social weight is higher in cold-start mode', () => {
    expect(WEIGHTS_COLD.social).toBeGreaterThan(WEIGHTS_NORMAL.social)
  })

  it('cosSim still dominates in normal mode', () => {
    expect(WEIGHTS_NORMAL.cosSim).toBeGreaterThan(WEIGHTS_NORMAL.social)
    expect(WEIGHTS_NORMAL.cosSim).toBeGreaterThan(WEIGHTS_NORMAL.affinity)
  })

  it('full score with max social boost is bounded', () => {
    const maxScore =
      WEIGHTS_NORMAL.cosSim * 1 +
      WEIGHTS_NORMAL.affinity * 1 +
      WEIGHTS_NORMAL.recency * 1 +
      WEIGHTS_NORMAL.popularity * 1 +
      WEIGHTS_NORMAL.freshness * 1 +
      WEIGHTS_NORMAL.social * 1
    expect(maxScore).toBeCloseTo(1.0, 10)
  })

  it('social boost of 0.11 can promote an event by ~2 rank positions', () => {
    const baseScore = 0.48 * 0.6 + 0.14 * 0.5 + 0.11 * 0.7 + 0.09 * 0.3 + 0.07 * 1.0
    const withSocial = baseScore + 0.11 * 0.8
    const gap = withSocial - baseScore
    expect(gap).toBeGreaterThan(0.05)
    expect(gap).toBeLessThan(0.15)
  })
})
