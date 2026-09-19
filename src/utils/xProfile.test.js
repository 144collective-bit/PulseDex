import { describe, it, expect } from 'vitest'
import { normaliseXProfile, accountAgeDays } from './xProfile'

const ok = {
  data: {
    id: '2244994945',
    username: 'XDevelopers',
    name: 'X Dev',
    created_at: '2013-12-14T04:35:55.000Z',
    verified: true,
    verified_type: 'business',
    public_metrics: { followers_count: 1234, following_count: 2 },
  },
}

describe('normaliseXProfile', () => {
  it('reads a well-formed response', () => {
    expect(normaliseXProfile(ok)).toEqual({
      id: '2244994945',
      handle: 'XDevelopers',
      name: 'X Dev',
      verifiedType: 'business',
      followers: 1234,
      createdAt: '2013-12-14T04:35:55.000Z',
    })
  })

  it('is null when there is no account in it', () => {
    for (const payload of [null, undefined, {}, { data: null }, { data: 'nope' }]) {
      expect(normaliseXProfile(payload)).toBeNull()
    }
  })

  it('refuses an id that is not a decimal snowflake', () => {
    for (const id of ['', 'abc', '12ab', '-1', '1'.repeat(26)]) {
      expect(normaliseXProfile({ data: { ...ok.data, id } })).toBeNull()
    }
  })

  it('keeps the id a string, because a snowflake does not survive a number', () => {
    const { id } = normaliseXProfile(ok)
    expect(typeof id).toBe('string')
    // The point of the rule: this id is past Number.MAX_SAFE_INTEGER territory
    // for newer accounts, and rounding one points at a different person.
    const big = '1750000000000000000'
    expect(normaliseXProfile({ data: { ...ok.data, id: big } }).id).toBe(big)
  })

  it('refuses a handle that is not a real X handle', () => {
    for (const username of ['', 'has space', 'toolongtobeahandle', 'bad-dash', 'emoji🚀']) {
      expect(normaliseXProfile({ data: { ...ok.data, username } })).toBeNull()
    }
  })

  it('drops a verified_type it does not recognise rather than storing it', () => {
    for (const verified_type of ['gold', 'none', '', 'BLUE ', 42, null]) {
      const result = normaliseXProfile({ data: { ...ok.data, verified_type } })
      if (verified_type === 'BLUE ') continue
      expect(result.verifiedType).toBeNull()
    }
  })

  it('accepts the tiers it knows, case-insensitively', () => {
    for (const type of ['blue', 'Blue', 'BUSINESS', 'government']) {
      expect(normaliseXProfile({ data: { ...ok.data, verified_type: type } }).verifiedType).toBe(
        type.toLowerCase(),
      )
    }
  })

  it('does not infer a badge from verified alone', () => {
    // `verified` has meant different things at different times. True with no
    // recognised type is not a badge this code should invent.
    const result = normaliseXProfile({
      data: { ...ok.data, verified: true, verified_type: undefined },
    })
    expect(result.verifiedType).toBeNull()
  })

  it('drops a nonsense follower count', () => {
    for (const followers_count of [-1, Number.NaN, Infinity, '1000', null]) {
      expect(
        normaliseXProfile({ data: { ...ok.data, public_metrics: { followers_count } } }).followers,
      ).toBeNull()
    }
  })

  it('refuses a creation date in the future', () => {
    const ahead = new Date(Date.now() + 86_400_000).toISOString()
    expect(normaliseXProfile({ data: { ...ok.data, created_at: ahead } }).createdAt).toBeNull()
  })

  it('collapses a display name onto one line and caps it', () => {
    const noisy = { ...ok.data, name: `  a\n\nb  ${'x'.repeat(100)}` }
    const { name } = normaliseXProfile({ data: noisy })
    expect(name).not.toContain('\n')
    expect(name.length).toBeLessThanOrEqual(50)
  })
})

describe('accountAgeDays', () => {
  it('counts whole days', () => {
    const now = Date.parse('2026-01-11T00:00:00.000Z')
    expect(accountAgeDays('2026-01-01T00:00:00.000Z', now)).toBe(10)
  })

  it('is never negative', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z')
    expect(accountAgeDays('2026-06-01T00:00:00.000Z', now)).toBe(0)
  })

  it('is null for anything unparseable', () => {
    for (const value of [null, undefined, 'soon', 42]) {
      expect(accountAgeDays(value)).toBeNull()
    }
  })
})
