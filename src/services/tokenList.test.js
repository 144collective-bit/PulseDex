import { describe, it, expect } from 'vitest'
import {
  tokensFromPairs,
  mergeWithCurated,
  matchScore,
  rankTokens,
  isWrappedNative,
} from './tokenList'
import { NATIVE_PLS, WPLS } from '../config/dex'

/*
 * What the token picker is allowed to offer.
 *
 * It offered eleven tokens and nothing else: anything beyond the curated list
 * had to have its contract address pasted in, so the picker could only help
 * someone who already knew exactly what they wanted. Folding the market in is
 * most of the fix, and ranking it is the rest - a list of several hundred
 * tokens in the wrong order is not obviously better than a list of eleven.
 */

const pair = ({ base, quote = { address: WPLS, symbol: 'WPLS', name: 'Wrapped Pulse' }, liq = 10_000, price = '1.5', image } = {}) => ({
  baseToken: base,
  quoteToken: quote,
  liquidity: { usd: liq },
  priceUsd: price,
  info: image ? { imageUrl: image } : undefined,
})

const T = (address, symbol, name = symbol) => ({ address, symbol, name })
const AAA = T('0xaaa0000000000000000000000000000000000001', 'AAA')
const BBB = T('0xbbb0000000000000000000000000000000000002', 'BBB')
const DAI = T('0xdai0000000000000000000000000000000000003', 'DAI', 'Dai Stablecoin')

describe('isWrappedNative', () => {
  it('recognises WPLS whatever the casing', () => {
    // Native PLS stands in for it. Offering both means picking the wrapped one
    // produces a trade the panel then has to unwrap back.
    expect(isWrappedNative(WPLS)).toBe(true)
    expect(isWrappedNative(WPLS.toLowerCase())).toBe(true)
    expect(isWrappedNative(AAA.address)).toBe(false)
    expect(isWrappedNative(null)).toBe(false)
  })
})

describe('tokensFromPairs', () => {
  it('lists a token that only ever appears as the quote side', () => {
    /*
     * The stables mostly. A list built from base tokens alone would be missing
     * exactly the assets people most want to trade into.
     */
    const tokens = tokensFromPairs([pair({ base: AAA, quote: DAI })])
    expect(tokens.map((t) => t.symbol).sort()).toEqual(['AAA', 'DAI'])
  })

  it('leaves WPLS out, because native PLS represents it', () => {
    const tokens = tokensFromPairs([pair({ base: AAA })])
    expect(tokens.map((t) => t.symbol)).toEqual(['AAA'])
  })

  it('keeps one entry per token, at its deepest pool', () => {
    const tokens = tokensFromPairs([
      pair({ base: AAA, liq: 1_000 }),
      pair({ base: AAA, liq: 90_000 }),
    ])
    expect(tokens).toHaveLength(1)
    expect(tokens[0].liquidityUsd).toBe(90_000)
  })

  it('keeps a price and a logo found in a shallower pool', () => {
    // A token's deepest pool is often the one where it is the quote asset,
    // which carries neither - so the fields are merged rather than replaced.
    const tokens = tokensFromPairs([
      pair({ base: AAA, liq: 1_000, price: '2.5', image: 'https://img/aaa.png' }),
      pair({ base: BBB, quote: AAA, liq: 90_000 }),
    ])
    const aaa = tokens.find((t) => t.symbol === 'AAA')
    expect(aaa.liquidityUsd).toBe(90_000)
    expect(aaa.priceUsd).toBe(2.5)
    expect(aaa.logo).toBe('https://img/aaa.png')
  })

  it('does not price a token from a pool where it is the quote side', () => {
    // priceUsd on a pair belongs to the base token. Reading it for the quote
    // would put another token's price on this row.
    const tokens = tokensFromPairs([pair({ base: BBB, quote: AAA, price: '7' })])
    expect(tokens.find((t) => t.symbol === 'AAA').priceUsd).toBeNull()
    expect(tokens.find((t) => t.symbol === 'BBB').priceUsd).toBe(7)
  })

  it('drops pools too shallow to be a market', () => {
    expect(tokensFromPairs([pair({ base: AAA, liq: 10 })])).toEqual([])
  })

  it('survives a malformed feed', () => {
    expect(tokensFromPairs(null)).toEqual([])
    expect(tokensFromPairs([{}, { baseToken: {} }, pair({ base: AAA })])).toHaveLength(1)
  })
})

describe('mergeWithCurated', () => {
  const curated = [
    { address: NATIVE_PLS, symbol: 'PLS', name: 'Pulse', decimals: 18 },
    { address: AAA.address, symbol: 'AAA', name: 'Curated AAA', decimals: 8 },
  ]

  it('keeps the curated entry when the market has the same token', () => {
    /*
     * Curated entries carry a checked address, a real logo and the decimals the
     * swap maths needs. The market copy has none of those, so it must not win.
     */
    const merged = mergeWithCurated([{ ...AAA, name: 'Market AAA', decimals: undefined, liquidityUsd: 5 }], curated)
    const aaa = merged.find((t) => t.symbol === 'AAA')
    expect(aaa.name).toBe('Curated AAA')
    expect(aaa.decimals).toBe(8)
    expect(aaa.verified).toBe(true)
  })

  it('lists a token once, not twice', () => {
    // The picker's own version of the bug the trending bar had.
    const merged = mergeWithCurated([{ ...AAA, liquidityUsd: 5 }], curated)
    expect(merged.filter((t) => t.symbol === 'AAA')).toHaveLength(1)
  })

  it('takes liquidity from the market, which curated entries have no source for', () => {
    const merged = mergeWithCurated([{ ...AAA, liquidityUsd: 42_000 }], curated)
    expect(merged.find((t) => t.symbol === 'AAA').liquidityUsd).toBe(42_000)
  })

  it('adds market tokens the curated list has never heard of', () => {
    const merged = mergeWithCurated([{ ...BBB, liquidityUsd: 100 }], curated)
    const bbb = merged.find((t) => t.symbol === 'BBB')
    expect(bbb).toBeDefined()
    expect(bbb.verified).toBeFalsy()
  })

  it('puts native PLS above everything, having no pool of its own', () => {
    const merged = mergeWithCurated([{ ...BBB, liquidityUsd: 10 ** 9 }], curated)
    const pls = merged.find((t) => t.symbol === 'PLS')
    expect(pls.liquidityUsd).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('matchScore', () => {
  it('puts an exact symbol above a name that merely contains it', () => {
    // Typing HEX should find HEX, not "HEXAGON FINANCE" with a deeper pool.
    const exact = matchScore({ symbol: 'HEX', name: 'HEX', address: '0x1' }, 'hex')
    const contains = matchScore({ symbol: 'HXG', name: 'Hexagon Finance', address: '0x2' }, 'hex')
    expect(exact).toBeGreaterThan(contains)
  })

  it('ranks a pasted address above everything', () => {
    expect(matchScore({ symbol: 'A', name: 'A', address: AAA.address }, AAA.address)).toBe(100)
  })

  it('is case-insensitive on both sides', () => {
    expect(matchScore({ symbol: 'DAI', name: 'Dai', address: '0x1' }, 'dai')).toBe(90)
    expect(matchScore({ symbol: 'dai', name: 'Dai', address: '0x1' }, 'DAI')).toBe(90)
  })

  it('returns null for a token that does not match', () => {
    expect(matchScore({ symbol: 'AAA', name: 'Alpha', address: '0x1' }, 'zzz')).toBeNull()
  })

  it('matches everything on an empty query', () => {
    expect(matchScore({ symbol: 'AAA', name: 'Alpha', address: '0x1' }, '')).toBe(0)
  })
})

describe('rankTokens', () => {
  const tokens = [
    { address: '0x1', symbol: 'DEEP', name: 'Deep pool', liquidityUsd: 10 ** 9, verified: false },
    { address: '0x2', symbol: 'SAFE', name: 'Curated', liquidityUsd: 10, verified: true },
    { address: '0x3', symbol: 'USDC', name: 'USD Coin', liquidityUsd: 5, verified: false },
  ]

  it('puts a verified token above a deeper unverified one', () => {
    /*
     * Depth is the last tiebreak on purpose. A checked token is worth more to
     * someone choosing what to trade than an unchecked one with a bigger pool -
     * which is the entire reason for keeping a curated list.
     */
    expect(rankTokens(tokens)[0].symbol).toBe('SAFE')
  })

  it('answers the query before anything else', () => {
    expect(rankTokens(tokens, { query: 'deep' })[0].symbol).toBe('DEEP')
  })

  it('drops the token already selected on the other side', () => {
    // Both sides of the same token is not a trade.
    const out = rankTokens(tokens, { excludeAddress: '0x2' })
    expect(out.find((t) => t.symbol === 'SAFE')).toBeUndefined()
  })

  it('excludes case-insensitively, since addresses arrive in both', () => {
    const out = rankTokens([{ address: '0xAbC', symbol: 'X', name: 'X', liquidityUsd: 1 }], {
      excludeAddress: '0xabc',
    })
    expect(out).toEqual([])
  })

  it('returns nothing rather than everything when nothing matches', () => {
    expect(rankTokens(tokens, { query: 'nonesuch' })).toEqual([])
  })

  it('caps the list', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      address: `0x${i}`, symbol: `T${i}`, name: `Token ${i}`, liquidityUsd: i, verified: false,
    }))
    expect(rankTokens(many, { limit: 25 })).toHaveLength(25)
  })

  it('survives a malformed list', () => {
    expect(rankTokens(null)).toEqual([])
  })
})
