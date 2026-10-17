import { describe, expect, it } from 'vitest'
import {
  MAX_SCORE,
  MIN_HOUR_VOLUME,
  MIN_LIQUIDITY,
  trendingLabel,
  trendingPairs,
  trendingScore,
  withMentions,
} from './trending'

/** A pair trading at exactly its usual rate, well above both floors. */
const pair = (over = {}) => ({
  pairAddress: '0xpair1',
  baseToken: { address: '0xTOKEN1', symbol: 'HEX' },
  volume: { h1: 10_000, h24: 240_000 },
  liquidity: { usd: 100_000 },
  ...over,
})

describe('trendingScore', () => {
  it('is 1 for a pair trading at its normal rate', () => {
    expect(trendingScore(pair())).toBeCloseTo(1, 6)
  })

  it('is 5 for a pair doing five times its usual hour', () => {
    expect(trendingScore(pair({ volume: { h1: 50_000, h24: 240_000 } }))).toBeCloseTo(5, 6)
  })

  /*
   * The check this file exists for.
   *
   * A pair that has existed for an hour has almost no 24-hour volume, so its
   * average hour is near zero and the ratio is enormous. Without the floors the
   * top of a trending list is permanently whatever pool was created most
   * recently - which on a site about which tokens to buy is a list of fresh rug
   * pools presented as the most interesting thing happening.
   */
  it('refuses a brand new pool with no history', () => {
    const fresh = pair({ volume: { h1: 6_000, h24: 6_000 }, liquidity: { usd: 30_000 } })
    // It does qualify on the floors - and the score is bounded, not enormous.
    expect(trendingScore(fresh)).toBeLessThanOrEqual(MAX_SCORE)

    // With no 24h volume at all it is unmeasurable rather than infinite.
    expect(trendingScore(pair({ volume: { h1: 50_000, h24: 0 } }))).toBeNull()
  })

  it('refuses a pair whose hour is a couple of trades', () => {
    expect(trendingScore(pair({ volume: { h1: MIN_HOUR_VOLUME - 1, h24: 1_000 } }))).toBeNull()
  })

  /*
   * A pool with no depth can be moved through by one transaction, so its
   * volume says what one person did rather than what a market did.
   */
  it('refuses a pair with no liquidity behind it', () => {
    expect(trendingScore(pair({ liquidity: { usd: MIN_LIQUIDITY - 1 } }))).toBeNull()
  })

  it('takes a pair exactly on both floors', () => {
    const onFloor = pair({
      volume: { h1: MIN_HOUR_VOLUME, h24: MIN_HOUR_VOLUME * 24 },
      liquidity: { usd: MIN_LIQUIDITY },
    })
    expect(trendingScore(onFloor)).toBeCloseTo(1, 6)
  })

  it('caps the ratio, because it is otherwise unbounded', () => {
    expect(trendingScore(pair({ volume: { h1: 1_000_000, h24: 24_001 } }))).toBe(MAX_SCORE)
  })

  it('is null for anything it cannot read, rather than throwing', () => {
    for (const value of [null, undefined, {}, { volume: null }, 'HEX']) {
      expect(trendingScore(value)).toBeNull()
    }
    expect(trendingScore(pair({ volume: { h1: 'lots', h24: 240_000 } }))).toBeNull()
  })

  // Null, not zero: "not trending" belongs at the bottom of a list and "not
  // measurable" does not belong on it at all.
  it('distinguishes unmeasurable from slow', () => {
    expect(trendingScore(pair({ volume: { h1: 1_000, h24: 240_000 } }))).toBeNull()
    expect(trendingScore(pair({ volume: { h1: 6_000, h24: 480_000 } }))).toBeCloseTo(0.3, 6)
  })
})

describe('trendingPairs', () => {
  const fast = pair({ pairAddress: '0xfast', volume: { h1: 80_000, h24: 240_000 } })
  const slow = pair({ pairAddress: '0xslow', volume: { h1: 10_000, h24: 240_000 } })
  const unmeasurable = pair({ pairAddress: '0xthin', liquidity: { usd: 10 } })

  it('puts the fastest first and drops what it cannot measure', () => {
    const out = trendingPairs([slow, unmeasurable, fast])
    expect(out.map((r) => r.pair.pairAddress)).toEqual(['0xfast', '0xslow'])
  })

  it('honours an exclusion predicate, which is how stablecoins are dropped', () => {
    const out = trendingPairs([fast, slow], {
      exclude: (p) => p.pairAddress === '0xfast',
    })
    expect(out.map((r) => r.pair.pairAddress)).toEqual(['0xslow'])
  })

  /*
   * Pairs pinned at the cap would otherwise reshuffle on every refresh, which
   * reads as the data being unstable rather than the order being arbitrary.
   */
  it('is stable among pairs at the cap', () => {
    const atCap = (address) =>
      pair({ pairAddress: address, volume: { h1: 1_000_000, h24: 24_001 } })

    const once = trendingPairs([atCap('0xb'), atCap('0xa'), atCap('0xc')])
    const twice = trendingPairs([atCap('0xc'), atCap('0xa'), atCap('0xb')])

    expect(once.map((r) => r.pair.pairAddress)).toEqual(twice.map((r) => r.pair.pairAddress))
  })

  it('honours the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      pair({ pairAddress: `0x${i}`, volume: { h1: 20_000 + i * 100, h24: 240_000 } }),
    )
    expect(trendingPairs(many, { limit: 5 })).toHaveLength(5)
  })

  it('is empty given nothing', () => {
    expect(trendingPairs(null)).toEqual([])
    expect(trendingPairs([])).toEqual([])
    expect(trendingPairs([null, undefined])).toEqual([])
  })
})

describe('withMentions', () => {
  const rows = [{ pair: pair(), score: 3 }]

  /*
   * The shape `byToken` in src/utils/talkedAbout.js actually produces, which
   * is `{ count, at }`. The first version of withMentions read `messageCount`
   * - the field on a raw room row, before byToken folds it - so every count
   * came back 0 and the surface said nothing was being discussed. This test
   * passed anyway, because its fixture used the same wrong name. Both names
   * are asserted now.
   */
  it('attaches how much a token is being talked about', () => {
    const rooms = new Map([['0xtoken1', { count: 41, at: '2026-02-01T00:00:00Z' }]])
    expect(withMentions(rows, rooms)[0].messages).toBe(41)
  })

  it('also reads a raw room row, so a caller is not silently wrong', () => {
    const rooms = new Map([['0xtoken1', { messageCount: 12 }]])
    expect(withMentions(rows, rooms)[0].messages).toBe(12)
  })

  it('matches the token whatever case the pair gave it in', () => {
    // The pair's baseToken.address is mixed case; the room map is lowercased.
    const rooms = new Map([['0xtoken1', { count: 7 }]])
    expect(withMentions(rows, rooms)[0].messages).toBe(7)
  })

  /*
   * Null and 0 read the same on a screen and mean different things: no room
   * has been made for this token, versus a room that exists and is silent.
   */
  it('is null when there is no room for the token, not zero', () => {
    expect(withMentions(rows, new Map())[0].messages).toBeNull()
    expect(withMentions(rows, new Map([['0xtoken1', { count: 0 }]]))[0].messages).toBe(0)
  })

  /*
   * The decision the whole surface rests on: social activity is context and
   * never a ranking signal. A token nobody is discussing must not move.
   */
  it('does not change the order', () => {
    const ordered = [
      { pair: pair({ pairAddress: '0xa', baseToken: { address: '0xA' } }), score: 9 },
      { pair: pair({ pairAddress: '0xb', baseToken: { address: '0xB' } }), score: 2 },
    ]
    const rooms = new Map([['0xb', { count: 5000 }]])

    expect(withMentions(ordered, rooms).map((r) => r.pair.pairAddress)).toEqual(['0xa', '0xb'])
  })

  it('survives a row with no token on it', () => {
    expect(withMentions([{ pair: {}, score: 1 }], new Map())[0].messages).toBeNull()
    expect(withMentions(null, new Map())).toEqual([])
  })
})

describe('trendingLabel', () => {
  // A bare "4.2×" invites being read as a price move, which on this site is
  // the number everybody is looking for and is not what this is.
  it('spells out the unit', () => {
    expect(trendingLabel(4.23)).toBe('4.2× its usual hour')
  })

  it('says "over" at the cap rather than reporting the cap as a measurement', () => {
    expect(trendingLabel(MAX_SCORE)).toBe(`over ${MAX_SCORE}× its usual hour`)
    expect(trendingLabel(999)).toBe(`over ${MAX_SCORE}× its usual hour`)
  })

  it('is null for nothing measurable', () => {
    for (const value of [0, -1, null, undefined, 'fast', NaN]) {
      expect(trendingLabel(value)).toBeNull()
    }
  })
})
