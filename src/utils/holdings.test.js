import { describe, expect, it } from 'vitest'
import { DUST_USD, MAX_HOLDINGS, hiddenHoldingsLabel, visibleHoldings } from './holdings'

const token = (over = {}) => ({
  address: '0x' + '1'.repeat(40),
  symbol: 'TKN',
  balance: 100,
  valueUsd: 500,
  isSpam: false,
  isNative: false,
  ...over,
})

describe('visibleHoldings', () => {
  it('shows a real position and totals it', () => {
    const { shown, totalUsd, hiddenCount } = visibleHoldings([token()])
    expect(shown).toHaveLength(1)
    expect(totalUsd).toBe(500)
    expect(hiddenCount).toBe(0)
  })

  it('survives every shape that is not a list of tokens', () => {
    for (const input of [null, undefined, 'tokens', 42, {}]) {
      const result = visibleHoldings(input)
      expect(result.shown).toEqual([])
      expect(result.totalUsd).toBe(0)
    }
    expect(visibleHoldings([null, undefined, 'nope', 7]).shown).toEqual([])
  })

  it('drops airdropped spam and counts it as spam', () => {
    const { shown, hidden } = visibleHoldings([token(), token({ isSpam: true, symbol: 'SCAM' })])
    expect(shown).toHaveLength(1)
    expect(hidden.spam).toBe(1)
  })

  /*
   * A spam token's price is invented, so counting it would make the total a
   * lie in the other direction - a wallet "worth" a million dollars of
   * something nobody can sell.
   */
  it('keeps spam out of the total', () => {
    const { totalUsd } = visibleHoldings([
      token({ valueUsd: 10 }),
      token({ isSpam: true, valueUsd: 1_000_000 }),
    ])
    expect(totalUsd).toBe(10)
  })

  it('counts a held token with no market separately from a worthless one', () => {
    const { shown, hidden } = visibleHoldings([
      token(),
      token({ valueUsd: 0, balance: 5_000, symbol: 'NOMARKET' }),
    ])
    expect(shown).toHaveLength(1)
    expect(hidden.unpriced).toBe(1)
    expect(hidden.dust).toBe(0)
  })

  it('ignores an unpriced token nobody holds any of', () => {
    const { hidden, hiddenCount } = visibleHoldings([token({ valueUsd: 0, balance: 0 })])
    expect(hidden.unpriced).toBe(0)
    expect(hiddenCount).toBe(0)
  })

  it('drops dust and counts it', () => {
    const { shown, hidden } = visibleHoldings([token(), token({ valueUsd: DUST_USD - 0.01 })])
    expect(shown).toHaveLength(1)
    expect(hidden.dust).toBe(1)
  })

  it('counts dust toward the total, because the wallet does hold it', () => {
    const { totalUsd } = visibleHoldings([token({ valueUsd: 10 }), token({ valueUsd: 0.5 })])
    expect(totalUsd).toBe(10.5)
  })

  /*
   * Every address on the chain has some PLS. A holdings panel that omits it
   * because the balance is small reads as a lookup that failed rather than as
   * a wallet with fifty cents in it.
   */
  it('shows the native token however small the balance', () => {
    const { shown, hidden } = visibleHoldings([
      token({ isNative: true, symbol: 'PLS', valueUsd: 0.02, balance: 1000 }),
    ])
    expect(shown).toHaveLength(1)
    expect(shown[0].symbol).toBe('PLS')
    expect(hidden.dust).toBe(0)
  })

  it('omits the native token when the balance really is nothing', () => {
    const { shown } = visibleHoldings([
      token({ isNative: true, symbol: 'PLS', valueUsd: 0, balance: 0 }),
    ])
    expect(shown).toEqual([])
  })

  it('caps the list and says how many it did not draw', () => {
    const many = Array.from({ length: MAX_HOLDINGS + 5 }, (_, i) => token({ valueUsd: 100 + i }))
    const { shown, hidden } = visibleHoldings(many)
    expect(shown).toHaveLength(MAX_HOLDINGS)
    expect(hidden.overflow).toBe(5)
  })

  it('keeps the biggest positions when it caps', () => {
    const many = Array.from({ length: MAX_HOLDINGS + 2 }, (_, i) =>
      token({ valueUsd: i + 1, symbol: `T${i}` }),
    )
    const { shown } = visibleHoldings(many)
    expect(shown[0].valueUsd).toBe(MAX_HOLDINGS + 2)
  })

  // Not trusted from upstream: fetchWalletPortfolio does sort, and depending
  // on that would make this output hinge on a detail nothing holds in place.
  it('sorts by value regardless of the order it was given', () => {
    const { shown } = visibleHoldings([token({ valueUsd: 5 }), token({ valueUsd: 50 })])
    expect(shown.map((t) => t.valueUsd)).toEqual([50, 5])
  })

  it('draws nothing when max is zero', () => {
    const { shown, hidden } = visibleHoldings([token()], { max: 0 })
    expect(shown).toEqual([])
    expect(hidden.overflow).toBe(1)
  })

  it('treats a non-numeric value as unpriced rather than as a number', () => {
    const { shown, hidden, totalUsd } = visibleHoldings([token({ valueUsd: 'lots' })])
    expect(shown).toEqual([])
    expect(hidden.unpriced).toBe(1)
    expect(totalUsd).toBe(0)
  })
})

describe('hiddenHoldingsLabel', () => {
  it('is null when nothing was left out', () => {
    expect(hiddenHoldingsLabel({ spam: 0, unpriced: 0, dust: 0, overflow: 0 })).toBeNull()
  })

  it('is null for anything that is not a count', () => {
    expect(hiddenHoldingsLabel(null)).toBeNull()
    expect(hiddenHoldingsLabel('two')).toBeNull()
  })

  // Spam is named as spam. A reader judging somebody by their holdings should
  // not have forty scam airdrops counted into an unexplained "hidden".
  it('names each reason that applies', () => {
    const label = hiddenHoldingsLabel({ spam: 40, unpriced: 2, dust: 3, overflow: 1 })
    expect(label).toContain('1 smaller')
    expect(label).toContain('3 under a dollar')
    expect(label).toContain('2 with no market')
    expect(label).toContain('40 airdropped')
  })

  it('names only the reasons that apply', () => {
    const label = hiddenHoldingsLabel({ spam: 5, unpriced: 0, dust: 0, overflow: 0 })
    expect(label).toBe('Not shown: 5 airdropped.')
  })
})
