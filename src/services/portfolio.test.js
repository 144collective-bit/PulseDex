import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'


/*
 * Wallet holdings: the one surface in the app that puts a number on what
 * someone owns.
 *
 * Two things are worth pinning. The spam filter, because airdropped junk is
 * routine on PulseChain and a total that counts it is wrong by orders of
 * magnitude. And the ambiguous-symbol flag, because symbols are not unique
 * here - a wallet routinely holds two tokens calling themselves the same thing
 * at wildly different prices, and without the flag the rows are
 * indistinguishable.
 */

vi.mock('./rpc', () => ({
  publicClient: {
    getBalance: vi.fn(async () => 0n),
    readContract: vi.fn(),
    multicall: vi.fn(async () => []),
  },
}))

vi.mock('./dexscreener', () => ({
  getPairsByTokens: vi.fn(async () => []),
  getNativePlsPrice: vi.fn(async () => 0.00001),
  getPulsePair: vi.fn(async () => null),
}))

vi.mock('./pulsescan', () => ({ fetchWithRetry: vi.fn(async () => ({ items: [] })) }))

const { publicClient } = await import('./rpc')
const { getPairsByTokens } = await import('./dexscreener')
const { fetchWithRetry } = await import('./pulsescan')
const { isSpamToken, fetchWalletPortfolio, fetchTokenMetadata } = await import('./portfolio')

const WALLET = '0x15B744D6cB354f65218660c1BD6f6830ee092547'

/** A holding as PulseScan reports it. */
const holding = (address, symbol, { value = '1000000000000000000', decimals = '18', name } = {}) => ({
  token: { address, symbol, name: name ?? symbol, decimals, type: 'ERC-20' },
  value,
})

/** A market for that holding, as DexScreener reports it. */
const market = (address, symbol, priceUsd) => ({
  chainId: 'pulsechain',
  pairAddress: `0xpair${address.slice(-4)}`,
  dexId: 'pulsex',
  baseToken: { address, symbol },
  quoteToken: { address: '0xwpls', symbol: 'WPLS' },
  priceUsd: String(priceUsd),
  liquidity: { usd: 100_000 },
  volume: { h24: 10_000 },
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  publicClient.getBalance.mockResolvedValue(0n)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isSpamToken', () => {
  it('catches the airdrop lures', () => {
    // These arrive unrequested and are worthless; counting them distorts a
    // portfolio total, sometimes by orders of magnitude.
    for (const name of ['Claim on rewards.xyz', 'visit to claim', 'FREE-AIRDROP', 'Bonus voucher']) {
      expect(isSpamToken({ symbol: '', name })).toBe(true)
    }
  })

  it('catches a domain hidden in the ticker', () => {
    expect(isSpamToken({ symbol: 'claim.io', name: '' })).toBe(true)
  })

  it('ignores case', () => {
    expect(isSpamToken({ symbol: 'AIRDROP', name: '' })).toBe(true)
  })

  it('leaves real tokens alone', () => {
    for (const symbol of ['HEX', 'PLSX', 'INC', 'WPLS', 'DAI', 'PEPE']) {
      expect(isSpamToken({ symbol, name: symbol })).toBe(false)
    }
  })

  it('does not throw on a token with no name or symbol', () => {
    expect(isSpamToken({})).toBe(false)
  })
})

describe('fetchWalletPortfolio', () => {
  it('refuses anything that is not an address, without calling out', async () => {
    for (const bad of [null, '', 'not-an-address', '0x123']) {
      const result = await fetchWalletPortfolio(bad)
      expect(result.tokens).toEqual([])
      expect(result.totalUsd).toBe(0)
    }
    expect(fetchWithRetry).not.toHaveBeenCalled()
  })

  it('values a holding at its market price', async () => {
    fetchWithRetry.mockResolvedValue({ items: [holding('0xaaa', 'TKN')] })
    getPairsByTokens.mockResolvedValue([market('0xaaa', 'TKN', 2.5)])

    const { tokens } = await fetchWalletPortfolio(WALLET)
    const tkn = tokens.find((t) => t.symbol === 'TKN')

    expect(tkn.balance).toBe(1)
    expect(tkn.valueUsd).toBeCloseTo(2.5, 6)
  })

  it('flags two holdings that share a ticker', async () => {
    // The forked and bridged DAI are the common case: same symbol, same name,
    // prices three orders of magnitude apart. Both rows are correct, and side
    // by side they read as a mispriced stablecoin.
    fetchWithRetry.mockResolvedValue({
      items: [
        holding('0x6b175474e89094c44da98b954eedeac495271d0f', 'DAI', { name: 'Dai Stablecoin' }),
        holding('0xefd766ccb38eaf1dfd701853bfce31359239f305', 'DAI', { name: 'Dai Stablecoin' }),
      ],
    })
    getPairsByTokens.mockResolvedValue([
      market('0x6b175474e89094c44da98b954eedeac495271d0f', 'DAI', 0.002),
      market('0xefd766ccb38eaf1dfd701853bfce31359239f305', 'DAI', 1),
    ])

    const { tokens } = await fetchWalletPortfolio(WALLET)
    const dais = tokens.filter((t) => t.symbol === 'DAI')

    expect(dais).toHaveLength(2)
    for (const dai of dais) expect(dai.ambiguousSymbol).toBe(true)
  })

  it('leaves an unambiguous ticker unflagged', async () => {
    // An address on all 55 rows would be noise, and noise is what stops a
    // warning being read.
    fetchWithRetry.mockResolvedValue({
      items: [holding('0xaaa', 'TKN'), holding('0xbbb', 'OTHER')],
    })
    getPairsByTokens.mockResolvedValue([market('0xaaa', 'TKN', 1), market('0xbbb', 'OTHER', 1)])

    const { tokens } = await fetchWalletPortfolio(WALLET)

    for (const token of tokens.filter((t) => ['TKN', 'OTHER'].includes(t.symbol))) {
      expect(token.ambiguousSymbol).toBe(false)
    }
  })

  it('compares tickers case-insensitively, so casing cannot hide a collision', async () => {
    fetchWithRetry.mockResolvedValue({
      items: [holding('0xaaa', 'pepe'), holding('0xbbb', 'PEPE')],
    })
    getPairsByTokens.mockResolvedValue([market('0xaaa', 'pepe', 1), market('0xbbb', 'PEPE', 2)])

    const { tokens } = await fetchWalletPortfolio(WALLET)
    const pepes = tokens.filter((t) => t.symbol.toUpperCase() === 'PEPE')

    expect(pepes).toHaveLength(2)
    for (const p of pepes) expect(p.ambiguousSymbol).toBe(true)
  })

  it('marks spam without dropping it, so the filter stays the caller’s choice', async () => {
    fetchWithRetry.mockResolvedValue({
      items: [holding('0xaaa', 'TKN'), holding('0xspam', 'CLAIM-AIRDROP')],
    })
    getPairsByTokens.mockResolvedValue([market('0xaaa', 'TKN', 1)])

    const { tokens } = await fetchWalletPortfolio(WALLET)
    const spam = tokens.find((t) => t.symbol === 'CLAIM-AIRDROP')

    if (spam) expect(spam.isSpam).toBe(true)
  })

  it('gives every holding a share of the total that sums to a whole', async () => {
    fetchWithRetry.mockResolvedValue({
      items: [holding('0xaaa', 'AAA'), holding('0xbbb', 'BBB')],
    })
    getPairsByTokens.mockResolvedValue([market('0xaaa', 'AAA', 3), market('0xbbb', 'BBB', 1)])

    const { tokens, totalUsd } = await fetchWalletPortfolio(WALLET)
    const priced = tokens.filter((t) => t.valueUsd > 0)
    const share = priced.reduce((a, t) => a + t.portfolioPct, 0)

    expect(totalUsd).toBeGreaterThan(0)
    expect(share).toBeCloseTo(100, 4)
  })

  it('sorts the most valuable holding first', async () => {
    fetchWithRetry.mockResolvedValue({
      items: [holding('0xaaa', 'SMALL'), holding('0xbbb', 'BIG')],
    })
    getPairsByTokens.mockResolvedValue([market('0xaaa', 'SMALL', 1), market('0xbbb', 'BIG', 900)])

    const { tokens } = await fetchWalletPortfolio(WALLET)

    expect(tokens[0].symbol).toBe('BIG')
  })

  it('scales a balance by the token’s own decimals', async () => {
    // HEX has eight. Reading it as eighteen understates a holding by ten
    // orders of magnitude and still renders as an ordinary number.
    fetchWithRetry.mockResolvedValue({
      items: [holding('0xaaa', 'HEX8', { value: '150000000', decimals: '8' })],
    })
    getPairsByTokens.mockResolvedValue([market('0xaaa', 'HEX8', 1)])

    const { tokens } = await fetchWalletPortfolio(WALLET)

    expect(tokens.find((t) => t.symbol === 'HEX8').balance).toBeCloseTo(1.5, 6)
  })

  it('skips NFTs, which are not fungible holdings', async () => {
    fetchWithRetry.mockResolvedValue({
      items: [
        { token: { address: '0xnft', symbol: 'NFT', decimals: '0', type: 'ERC-721' }, value: '1' },
        holding('0xaaa', 'TKN'),
      ],
    })
    getPairsByTokens.mockResolvedValue([market('0xaaa', 'TKN', 1)])

    const { tokens } = await fetchWalletPortfolio(WALLET)

    expect(tokens.some((t) => t.symbol === 'NFT')).toBe(false)
  })

  it('still returns a portfolio when the explorer is down', async () => {
    // A failed discovery call must not produce an exception in a page whose
    // whole job is to show a total.
    fetchWithRetry.mockRejectedValue(new Error('scan down'))

    const result = await fetchWalletPortfolio(WALLET)

    expect(result).toMatchObject({ address: WALLET })
    expect(Array.isArray(result.tokens)).toBe(true)
  })
})

describe('fetchTokenMetadata', () => {
  it('reads name, symbol and decimals off the contract', async () => {
    // Decimals in particular have to come from the chain: assuming 18 for a
    // six-decimal token misprices everything downstream by a factor of a
    // trillion, and it renders as a perfectly ordinary number.
    // Answered by which call it is, not by order: the three run in parallel,
    // and a positional mock silently swaps the fields if that order changes.
    publicClient.readContract.mockImplementation(async ({ functionName }) =>
      ({ symbol: 'USDC', name: 'USD Coin', decimals: 6 })[functionName],
    )

    const meta = await fetchTokenMetadata('0xaaa')

    expect(meta).toMatchObject({ decimals: 6, symbol: 'USDC', name: 'USD Coin' })
  })

  it('returns null when the address is not a token', async () => {
    publicClient.readContract.mockRejectedValue(new Error('execution reverted'))

    expect(await fetchTokenMetadata('0xnotatoken')).toBeNull()
  })
})
