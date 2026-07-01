import { describe, it, expect } from 'vitest'
import { ROLES, SPECIAL_ROLES, rolePerks, roleReference, ROLE_REFERENCE } from './roles.js'

describe('ROLES', () => {
  it('contains exactly 6 roles', () => {
    expect(Object.keys(ROLES)).toHaveLength(6)
  })

  it('every role has a label and blurb', () => {
    for (const [key, value] of Object.entries(ROLES)) {
      expect(value.label, key).toBeTruthy()
      expect(value.blurb, key).toBeTruthy()
    }
  })
})

describe('SPECIAL_ROLES', () => {
  it('contains 5 entries (no civilian)', () => {
    expect(SPECIAL_ROLES).toHaveLength(5)
  })

  it('does not include civilian', () => {
    expect(SPECIAL_ROLES).not.toContain('civilian')
  })

  it('matches the keys of ROLES minus civilian', () => {
    const expected = Object.keys(ROLES).filter((r) => r !== 'civilian').sort()
    expect([...SPECIAL_ROLES].sort()).toEqual(expected)
  })
})

describe('rolePerks()', () => {
  it('returns civilian perks when called with no args', () => {
    const perks = rolePerks()
    expect(perks).toHaveLength(3)
    expect(perks[0]).toMatch(/суперсил/i)
  })

  it('returns civilian perks for unknown role', () => {
    const perks = rolePerks({ role: 'wizard' })
    expect(perks[0]).toMatch(/суперсил/i)
  })

  describe('prosecutor', () => {
    it('shows remaining charges correctly', () => {
      const perks = rolePerks({ role: 'prosecutor', double_vote_count: 1, double_vote_limit: 3 })
      expect(perks[0]).toContain('2/3')
    })

    it('shows 0 remaining when all charges used', () => {
      const perks = rolePerks({ role: 'prosecutor', double_vote_count: 3, double_vote_limit: 3 })
      expect(perks[0]).toContain('0/3')
    })

    it('defaults to limit=3 when metadata missing', () => {
      const perks = rolePerks({ role: 'prosecutor' })
      expect(perks[0]).toContain('3/3')
    })
  })

  describe('judge', () => {
    it('shows remaining super-verdicts', () => {
      const perks = rolePerks({ role: 'judge', super_verdict_remaining: 1 })
      expect(perks[0]).toContain('1/2')
    })

    it('shows 0 when charges exhausted', () => {
      const perks = rolePerks({ role: 'judge', super_verdict_remaining: 0 })
      expect(perks[0]).toContain('0/2')
    })
  })

  describe('ghost', () => {
    it('returns 3 perks', () => {
      expect(rolePerks({ role: 'ghost' })).toHaveLength(3)
    })

    it('mentions anonymity', () => {
      const perks = rolePerks({ role: 'ghost' })
      expect(perks[0]).toMatch(/анон/i)
    })
  })

  describe('oligarch', () => {
    it('shows cashback pct and reward counts', () => {
      const perks = rolePerks({
        role: 'oligarch',
        reward_create_count: 1,
        reward_limit: 3,
        cashback_pct: 25,
        pending_cashback: 7,
      })
      expect(perks[0]).toContain('25%')
      expect(perks[0]).toContain('1/3')
      expect(perks[1]).toContain('7')
    })

    it('caps used count at limit to avoid display overflow', () => {
      const perks = rolePerks({
        role: 'oligarch',
        reward_create_count: 5,
        reward_limit: 3,
        cashback_pct: 25,
        pending_cashback: 0,
      })
      expect(perks[0]).toContain('3/3')
    })

    it('defaults to 25% and limit 3 when metadata missing', () => {
      const perks = rolePerks({ role: 'oligarch' })
      expect(perks[0]).toContain('25%')
      expect(perks[0]).toContain('0/3')
    })
  })

  describe('detective', () => {
    it('shows remaining reveals', () => {
      const perks = rolePerks({ role: 'detective', reveals_remaining: 1, reveals_limit: 2 })
      expect(perks[0]).toContain('1/2')
    })

    it('defaults to 0 remaining when metadata missing', () => {
      const perks = rolePerks({ role: 'detective' })
      expect(perks[0]).toContain('0/2')
    })
  })
})

describe('roleReference()', () => {
  it('returns correct entry for each special role', () => {
    for (const role of SPECIAL_ROLES) {
      const entry = roleReference(role)
      expect(entry.role).toBe(role)
    }
  })

  it('returns civilian entry for unknown role', () => {
    expect(roleReference('wizard').role).toBe('civilian')
  })

  it('returns civilian entry when called without args', () => {
    expect(roleReference(undefined).role).toBe('civilian')
  })

  it('ROLE_REFERENCE has an entry for every key in ROLES', () => {
    const defined = ROLE_REFERENCE.map((e) => e.role).sort()
    const expected = Object.keys(ROLES).sort()
    expect(defined).toEqual(expected)
  })
})
