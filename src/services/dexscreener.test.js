import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { jsonResponse, errorResponse } from '../test/fixtures'

/*
 * The market data service, which every surface in the app reads through -
 * the home tiles, the screener, every dashboard module, the trenches board and
 * the portfolio. It was the largest untested file in the project.
 *
 * The parts pinned here are the ones that decide what a number means rather
 * than merely fetching it: which pool is treated as a token's real market,
 * which contract counts as the real asset, and what happens when the upstream
 * fails mid-way. Two live bugs came out of exactly this logic - eHEX and PLS
 * showing prices 9-12% wrong because a dead pool with parked balances won on
 * depth alone.
 */

vi.mock('../utils/http', () => ({
  fetchWithTimeout: vi.fn(),
  isTimeout: (e) => e?.name === 'TimeoutError',
}))

const { fetchWithTimeout } = await import('../utils/http')
const {
  isStablecoin,
  getCorePulseRank,
  deduplicatePairs,
  getPairsByTokens,
  searchPulsePairs,
  getPulsePair,
  getTopPulsePairs,
  __resetBoardCache,
  CORE_PULSE_CONTRACTS,
  BLOCKED_FAKE_ADDRESSES,
} = await import('./dexscreener')

/** Unique per test: the service caches by URL for 8s, and a hit skips the fetch. */
let n = 0
const nextAddress = () => `0x${String(n++).padStart(40, '0')}`

const pair = (over = {}) => ({
  chainId: 'pulsechain',
  pairAddress: nextAddress(),
  dexId: 'pulsex',
  baseToken: { address: nextAddress(), symbol: 'TKN', name: 'Token' },
  quoteToken: { address: CORE_PULSE_CONTRACTS.WPLS, symbol: 'WPLS' },
  liquidity: { usd: 50_000 },
  volume: { h24: 10_000 },
  ...over,
})

beforeEach(() => {
  fetchWithTimeout.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isStablecoin', () => {
  it('recognises the dollar tokens that trade on PulseChain', () => {
    for (const symbol of ['USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'LUSD']) {
      expect(isStablecoin(symbol)).toBe(true)
    }
  })

  it('ignores case and surrounding space', () => {
    expect(isStablecoin(' usdc ')).toBe(true)
  })

  it('does not treat a volatile asset as a stablecoin', () => {
    // This decides which side of a pool is the reference price. Calling HEX a
    // stablecoin would quote every HEX pair upside down.
    for (const symbol of ['HEX', 'PLSX', 'WPLS', 'INC']) {
      expect(isStablecoin(symbol)).toBe(false)
    }
  })

  it('says no rather than throwing on a missing symbol', () => {
    expect(isStablecoin(undefined)).toBe(false)
    expect(isStablecoin('')).toBe(false)
  })
})

describe('getCorePulseRank', () => {
  it('ranks by contract address, never by ticker', () => {
    // Symbols are not unique on PulseChain. Anyone can deploy a token called
    // WPLS; only one address is the real one.
    const impostor = pair({ baseToken: { address: nextAddress(), symbol: 'WPLS' } })

    expect(getCorePulseRank(impostor)).toBe(999)
  })

  it('puts the real WPLS first', () => {
    expect(getCorePulseRank(pair({ baseToken: { address: CORE_PULSE_CONTRACTS.WPLS } }))).toBe(1)
  })

  it('orders the core assets as the home page presents them', () => {
    const rankOf = (address) => getCorePulseRank(pair({ baseToken: { address } }))

    expect(rankOf(CORE_PULSE_CONTRACTS.WPLS)).toBeLessThan(rankOf(CORE_PULSE_CONTRACTS.PLSX_1))
    expect(rankOf(CORE_PULSE_CONTRACTS.PLSX_1)).toBeLessThan(rankOf(CORE_PULSE_CONTRACTS.HEX_PLS))
    expect(rankOf(CORE_PULSE_CONTRACTS.HEX_PLS)).toBeLessThan(rankOf(CORE_PULSE_CONTRACTS.INC_1))
  })

  it('accepts either contract for the assets that have two', () => {
    expect(getCorePulseRank(pair({ baseToken: { address: CORE_PULSE_CONTRACTS.HEX_ETH } }))).toBe(3)
    expect(getCorePulseRank(pair({ baseToken: { address: CORE_PULSE_CONTRACTS.INC_2 } }))).toBe(4)
  })

  it('refuses a known fake on either side of the pool', () => {
    const [fake] = [...BLOCKED_FAKE_ADDRESSES]
    if (!fake) return

    expect(getCorePulseRank(pair({ baseToken: { address: fake } }))).toBe(999)
    expect(
      getCorePulseRank(
        pair({ baseToken: { address: CORE_PULSE_CONTRACTS.WPLS }, quoteToken: { address: fake } }),
      ),
    ).toBe(999)
  })

  it('is case-insensitive about addresses, so checksummed input still ranks', () => {
    const checksummed = CORE_PULSE_CONTRACTS.WPLS.toUpperCase().replace('0X', '0x')
    expect(getCorePulseRank(pair({ baseToken: { address: checksummed } }))).toBe(1)
  })

  it('ranks nothing at all as last', () => {
    expect(getCorePulseRank(null)).toBe(999)
  })
})

describe('deduplicatePairs', () => {
  it('keeps one pool per token', () => {
    const shallow = pair({ baseToken: { address: '0xaaa', symbol: 'TKN' }, liquidity: { usd: 10 } })
    const deep = pair({ baseToken: { address: '0xaaa', symbol: 'TKN' }, liquidity: { usd: 900_000 } })

    const out = deduplicatePairs([shallow, deep])

    expect(out).toHaveLength(1)
    expect(out[0]).toBe(deep)
  })

  it('prefers the official AMM over a deeper pool somewhere else', () => {
    // The bug this encodes: ranking on depth alone picked parked pools on
    // minor venues and priced eHEX and PLS 9-12% wrong.
    const elsewhere = pair({
      baseToken: { address: '0xbbb', symbol: 'TKN' },
      dexId: 'someotherdex',
      liquidity: { usd: 9_000_000 },
    })
    const official = pair({
      baseToken: { address: '0xbbb', symbol: 'TKN' },
      dexId: 'pulsex',
      liquidity: { usd: 50_000 },
    })

    expect(deduplicatePairs([elsewhere, official])[0]).toBe(official)
  })

  it('lets volume break a tie between two pools on the same venue', () => {
    const quiet = pair({ baseToken: { address: '0xccc', symbol: 'TKN' }, liquidity: { usd: 100_000 }, volume: { h24: 0 } })
    const busy = pair({ baseToken: { address: '0xccc', symbol: 'TKN' }, liquidity: { usd: 100_000 }, volume: { h24: 5_000_000 } })

    expect(deduplicatePairs([quiet, busy])[0]).toBe(busy)
  })

  it('collapses the canonical assets by ticker, so one HEX appears not four', () => {
    const a = pair({ baseToken: { address: '0x111', symbol: 'HEX' }, liquidity: { usd: 100 } })
    const b = pair({ baseToken: { address: '0x222', symbol: 'HEX' }, liquidity: { usd: 900_000 } })

    expect(deduplicatePairs([a, b])).toHaveLength(1)
  })

  it('keeps unrelated tokens that merely share a ticker apart', () => {
    // Two different meme tokens both called PEPE are two entries, not one -
    // only the canonical list collapses by symbol.
    const a = pair({ baseToken: { address: '0x333', symbol: 'PEPE' } })
    const b = pair({ baseToken: { address: '0x444', symbol: 'PEPE' } })

    expect(deduplicatePairs([a, b])).toHaveLength(2)
  })

  it('drops a pair with no way to identify its token', () => {
    const nameless = pair({ baseToken: { address: '', symbol: '' } })
    expect(deduplicatePairs([nameless])).toEqual([])
  })

  it('handles an empty list', () => {
    expect(deduplicatePairs([])).toEqual([])
  })
})

describe('getPairsByTokens', () => {
  it('asks nobody when given no addresses', async () => {
    expect(await getPairsByTokens([])).toEqual([])
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('splits a long list into batches the API will accept', async () => {
    // DexScreener caps a multi-token response, so an unbatched request
    // silently returns nothing for the tokens past the limit - the surfaces
    // reading it just show fewer assets, with no error anywhere.
    fetchWithTimeout.mockResolvedValue(jsonResponse({ pairs: [] }))

    await getPairsByTokens(Array.from({ length: 60 }, () => nextAddress()))

    expect(fetchWithTimeout).toHaveBeenCalledTimes(3)
    for (const [url] of fetchWithTimeout.mock.calls) {
      expect(url.split('/').at(-1).split(',').length).toBeLessThanOrEqual(25)
    }
  })

  it('keeps the batches that worked when one fails', async () => {
    // One bad batch must not blank the board.
    fetchWithTimeout
      .mockResolvedValueOnce(jsonResponse({ pairs: [pair()] }))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse({ pairs: [pair(), pair()] }))

    const out = await getPairsByTokens(Array.from({ length: 60 }, () => nextAddress()))

    expect(out).toHaveLength(3)
  })

  it('drops anything that is not on PulseChain', async () => {
    fetchWithTimeout.mockResolvedValue(
      jsonResponse({ pairs: [pair(), pair({ chainId: 'ethereum' }), pair({ chainId: 'bsc' })] }),
    )

    const out = await getPairsByTokens([nextAddress()])

    expect(out).toHaveLength(1)
    expect(out[0].chainId).toBe('pulsechain')
  })

  it('survives a response with no pairs field', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse({}))
    expect(await getPairsByTokens([nextAddress()])).toEqual([])
  })
})

describe('searchPulsePairs', () => {
  it('returns nothing for an empty query without asking', async () => {
    expect(await searchPulsePairs('   ')).toEqual([])
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('pulls a contract address out of pasted text', async () => {
    const address = '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39'
    fetchWithTimeout.mockResolvedValue(jsonResponse({ pairs: [] }))

    await searchPulsePairs(`please check ${address} thanks`)

    expect(decodeURIComponent(fetchWithTimeout.mock.calls[0][0])).toContain(address)
  })

  it('hides dust pools that would otherwise fill the results', async () => {
    fetchWithTimeout.mockResolvedValue(
      jsonResponse({
        pairs: [
          pair({ liquidity: { usd: 5 }, volume: { h24: 0 } }),
          pair({ liquidity: { usd: 100_000 }, volume: { h24: 0 } }),
        ],
      }),
    )

    expect(await searchPulsePairs('dust-filter-case')).toHaveLength(1)
  })

  it('keeps a thin pool that is actually trading', async () => {
    fetchWithTimeout.mockResolvedValue(
      jsonResponse({ pairs: [pair({ liquidity: { usd: 1 }, volume: { h24: 5_000 } })] }),
    )

    expect(await searchPulsePairs('thin-but-trading-case')).toHaveLength(1)
  })

  it('returns nothing rather than throwing when the search fails', async () => {
    // A query nothing else used: the service caches by URL for eight seconds,
    // so a repeated term would be answered from the earlier test's response.
    fetchWithTimeout.mockRejectedValue(new Error('network down'))
    expect(await searchPulsePairs('a-query-no-other-test-uses')).toEqual([])
  })
})

describe('getPulsePair', () => {
  it('returns the pair the address names', async () => {
    const wanted = pair()
    fetchWithTimeout.mockResolvedValue(jsonResponse({ pairs: [wanted] }))

    expect(await getPulsePair(nextAddress())).toBe(wanted)
  })

  it('falls back to a search when the direct lookup finds nothing', async () => {
    const found = pair()
    fetchWithTimeout
      .mockResolvedValueOnce(jsonResponse({ pairs: [] }))
      .mockResolvedValueOnce(jsonResponse({ pairs: [found] }))

    expect(await getPulsePair(nextAddress())).toBe(found)
  })

  it('returns null rather than throwing when the pair does not exist', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse({ pairs: [] }))
    expect(await getPulsePair(nextAddress())).toBeNull()
  })

  it('returns null for no address', async () => {
    expect(await getPulsePair(null)).toBeNull()
  })

  it('serves the last good answer when the upstream goes down', async () => {
    // The service caches briefly and falls back to that cache on failure, so a
    // blip does not blank every panel at once.
    const address = nextAddress()
    const good = pair()

    fetchWithTimeout.mockResolvedValueOnce(jsonResponse({ pairs: [good] }))
    expect(await getPulsePair(address)).toBe(good)

    fetchWithTimeout.mockRejectedValue(new Error('network down'))
    expect(await getPulsePair(address)).toBe(good)
  })
})


/*
 * The board is the expensive call - two dozen upstream requests - and two
 * independent pollers ask for it on different intervals. These pin the sharing
 * that keeps that from becoming a 429.
 */
describe('getTopPulsePairs', () => {
  beforeEach(() => {
    __resetBoardCache()
  })

  it('serves concurrent callers from a single flight', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse({ pairs: [pair({ liquidity: { usd: 5000 } })] }))

    const [a, b, c] = await Promise.all([
      getTopPulsePairs(),
      getTopPulsePairs(),
      getTopPulsePairs(),
    ])

    // One flight, so all three callers get the very same array back.
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('answers a second caller from the memo rather than going upstream again', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse({ pairs: [pair({ liquidity: { usd: 5000 } })] }))

    await getTopPulsePairs()
    const callsAfterFirst = fetchWithTimeout.mock.calls.length

    await getTopPulsePairs()

    expect(fetchWithTimeout.mock.calls.length).toBe(callsAfterFirst)
  })

  it('keeps the last good board when the upstream goes down', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse({ pairs: [pair({ liquidity: { usd: 5000 } })] }))
    const good = await getTopPulsePairs()
    expect(good.length).toBeGreaterThan(0)

    // Step past the memo window with everything upstream now failing. Two
    // layers have to hold for this: the per-URL cache answers each failed
    // request with its last good body, and the memo refuses to let an empty
    // result replace a good board. The rebuilt board is an equal one rather
    // than the same array, which is why this is an equality check.
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 60_000)
    fetchWithTimeout.mockRejectedValue(new Error('network down'))

    try {
      expect(await getTopPulsePairs()).toStrictEqual(good)
    } finally {
      vi.useRealTimers()
    }
  })
})
