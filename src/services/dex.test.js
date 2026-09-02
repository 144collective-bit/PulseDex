import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
 * Swap quoting - the money maths.
 *
 * Nothing in this file signs anything, and that is exactly why it needs
 * pinning: every number a trader will act on is decided here, and the two that
 * decide whether they get robbed are `minimumReceived`, which becomes the
 * slippage floor a router is told to enforce, and `impact`, which is the only
 * warning that a trade is moving the pool it is trading against.
 *
 * The decimals handling is the other half. parseUnits scales by them, so
 * treating a 6-decimal token as 18 misprices a quote by a factor of a
 * trillion - and it renders as a perfectly ordinary-looking number.
 */

vi.mock('./rpc', () => ({
  publicClient: { readContract: vi.fn() },
}))

const { publicClient } = await import('./rpc')
const { fetchTokenMeta, findDirectPools, buildPath, quoteSwap, minimumReceived } =
  await import('./dex')
const { WPLS, NATIVE_PLS, PULSEX_ROUTER_V2, PULSEX_ROUTER_V1 } = await import('../config/dex')

const ZERO = '0x0000000000000000000000000000000000000000'

/** An 18-decimal token that is not WPLS and not native. */
const TOKEN_A = { address: '0x1111111111111111111111111111111111111111', decimals: 18, symbol: 'AAA' }
const TOKEN_B = { address: '0x2222222222222222222222222222222222222222', decimals: 18, symbol: 'BBB' }
/** Six decimals, like USDC - the case that misprices by 1e12 if assumed. */
const USDC = { address: '0x3333333333333333333333333333333333333333', decimals: 6, symbol: 'USDC' }
const PLS = { address: NATIVE_PLS, decimals: 18, symbol: 'PLS' }
const WRAPPED = { address: WPLS, decimals: 18, symbol: 'WPLS' }

beforeEach(() => {
  vi.clearAllMocks()
})

/**
 * Answer getAmountsOut with a fixed multiple of the input.
 *
 * The probe call quoting price impact uses the same route, so a constant rate
 * means execution matches spot and impact comes out at zero - which is what
 * makes it possible to assert on impact separately from everything else.
 */
function quoteAtRate(rate, { outDecimalsShift = 0n } = {}) {
  return vi.fn(async ({ args }) => {
    const [amountIn, path] = args
    const out = (amountIn * BigInt(Math.round(rate * 1000))) / 1000n
    return [amountIn, ...path.slice(1, -1).map(() => 0n), out * 10n ** outDecimalsShift]
  })
}

describe('minimumReceived', () => {
  /*
   * This is the slippage floor. It is the number that would be handed to a
   * router as amountOutMin, and it is the only thing standing between a user
   * and a sandwich - so it must never round in the pool's favour.
   */
  it('takes the tolerance off the quoted output', () => {
    expect(minimumReceived(100, 1)).toBeCloseTo(99, 10)
    expect(minimumReceived(100, 0.5)).toBeCloseTo(99.5, 10)
    expect(minimumReceived(100, 0.1)).toBeCloseTo(99.9, 10)
  })

  it('never returns more than the quote', () => {
    for (const slip of [0, 0.1, 0.5, 1, 5, 50]) {
      expect(minimumReceived(1234.5678, slip)).toBeLessThanOrEqual(1234.5678)
    }
  })

  it('is zero for a zero or missing quote rather than NaN', () => {
    // A NaN reaching a router as amountOutMin would be a swap with no floor.
    expect(minimumReceived(0, 1)).toBe(0)
    expect(minimumReceived(null, 1)).toBe(0)
    expect(minimumReceived(undefined, 1)).toBe(0)
  })

  it('holds its precision on a small figure', () => {
    // Micro-cap amounts are routine here; a float slip would show as a wrong
    // floor rather than as an error.
    expect(minimumReceived(0.00000123, 0.5)).toBeCloseTo(0.00000122385, 15)
  })

  it('gives back the whole quote at zero tolerance', () => {
    expect(minimumReceived(500, 0)).toBe(500)
  })
})

describe('buildPath', () => {
  it('offers the direct pair and the WPLS hop for two ordinary tokens', () => {
    const paths = buildPath(TOKEN_A, TOKEN_B)

    expect(paths).toEqual([
      [TOKEN_A.address, TOKEN_B.address],
      [TOKEN_A.address, WPLS, TOKEN_B.address],
    ])
  })

  it('routes native PLS through WPLS, since it has no contract to trade', () => {
    const paths = buildPath(PLS, TOKEN_A)

    // PLS became WPLS, and a WPLS pair is always direct - no second hop.
    expect(paths).toEqual([[WPLS, TOKEN_A.address]])
  })

  it('does not hop through WPLS when WPLS is already one side', () => {
    expect(buildPath(WRAPPED, TOKEN_A)).toEqual([[WPLS, TOKEN_A.address]])
    expect(buildPath(TOKEN_A, WRAPPED)).toEqual([[TOKEN_A.address, WPLS]])
  })

  it('refuses a token against itself', () => {
    expect(buildPath(TOKEN_A, TOKEN_A)).toBeNull()
    // And through the wrapper: PLS and WPLS are the same asset to a router.
    expect(buildPath(PLS, WRAPPED)).toBeNull()
  })
})

describe('quoteSwap', () => {
  it('returns nothing for an amount that is not a positive number', async () => {
    for (const amount of ['0', '-1', 'abc', '', null, undefined]) {
      expect(await quoteSwap({ from: TOKEN_A, to: TOKEN_B, amount })).toBeNull()
    }
    expect(publicClient.readContract).not.toHaveBeenCalled()
  })

  it('returns nothing when either side is missing', async () => {
    expect(await quoteSwap({ from: null, to: TOKEN_B, amount: '1' })).toBeNull()
    expect(await quoteSwap({ from: TOKEN_A, to: null, amount: '1' })).toBeNull()
  })

  it('scales the input by the sending token decimals', async () => {
    publicClient.readContract = quoteAtRate(2)

    await quoteSwap({ from: USDC, to: TOKEN_A, amount: '1' })

    // 1 USDC is 1e6, not 1e18. Getting this wrong misprices by a trillion.
    const [amountIn] = publicClient.readContract.mock.calls[0][0].args
    expect(amountIn).toBe(1_000_000n)
  })

  it('reads the output back through the receiving token decimals', async () => {
    // Output is returned in 6-decimal units; 2e6 raw is 2 USDC, not 2e-12.
    publicClient.readContract = vi.fn(async ({ args }) => {
      const [amountIn, path] = args
      return [amountIn, ...path.slice(1).map(() => 2_000_000n)]
    })

    const quote = await quoteSwap({ from: TOKEN_A, to: USDC, amount: '1' })

    expect(quote.amountOut).toBe(2)
  })

  it('keeps the best output when two paths both quote', async () => {
    // The direct pair is thin and the WPLS hop is deeper - the hop should win.
    publicClient.readContract = vi.fn(async ({ args }) => {
      const [amountIn, path] = args
      const better = path.length === 3
      const out = better ? amountIn * 5n : amountIn * 2n
      return [amountIn, ...path.slice(1, -1).map(() => 0n), out]
    })

    const quote = await quoteSwap({ from: TOKEN_A, to: TOKEN_B, amount: '1' })

    expect(quote.amountOut).toBe(5)
    expect(quote.hops).toBe(2)
    expect(quote.path).toEqual([TOKEN_A.address, WPLS, TOKEN_B.address])
  })

  it('survives a path that reverts, because a missing pool is expected', async () => {
    publicClient.readContract = vi.fn(async ({ args }) => {
      const [amountIn, path] = args
      if (path.length === 2) throw new Error('execution reverted')
      return [amountIn, 0n, amountIn * 3n]
    })

    const quote = await quoteSwap({ from: TOKEN_A, to: TOKEN_B, amount: '1' })

    expect(quote).not.toBeNull()
    expect(quote.amountOut).toBe(3)
  })

  it('returns nothing when every path on every router reverts', async () => {
    publicClient.readContract = vi.fn(async () => {
      throw new Error('execution reverted')
    })

    expect(await quoteSwap({ from: TOKEN_A, to: TOKEN_B, amount: '1' })).toBeNull()
  })

  it('falls back to the V1 router when V2 has no pool at all', async () => {
    publicClient.readContract = vi.fn(async ({ address, args }) => {
      if (address === PULSEX_ROUTER_V2) throw new Error('execution reverted')
      const [amountIn, path] = args
      return [amountIn, ...path.slice(1, -1).map(() => 0n), amountIn * 4n]
    })

    const quote = await quoteSwap({ from: TOKEN_A, to: TOKEN_B, amount: '1' })

    expect(quote.router).toBe(PULSEX_ROUTER_V1)
    expect(quote.routerLabel).toBe('PulseX V1')
  })

  it('labels the router it actually quoted against', async () => {
    publicClient.readContract = quoteAtRate(2)

    const quote = await quoteSwap({ from: TOKEN_A, to: TOKEN_B, amount: '1' })

    expect(quote.router).toBe(PULSEX_ROUTER_V2)
    expect(quote.routerLabel).toBe('PulseX V2')
  })

  it('reports no impact when execution matches spot', async () => {
    // Constant rate: the tiny probe and the real trade price identically.
    publicClient.readContract = quoteAtRate(2)

    const quote = await quoteSwap({ from: TOKEN_A, to: TOKEN_B, amount: '1' })

    expect(quote.impact).toBeCloseTo(0, 6)
  })

  it('reports impact when the trade prices worse than the probe', async () => {
    /*
     * The probe is 0.0001 in. Quoting it generously and the real trade meanly
     * is what a thin pool does, and the gap between them is the impact a
     * trader is being warned about.
     */
    publicClient.readContract = vi.fn(async ({ args }) => {
      const [amountIn, path] = args
      const tiny = amountIn <= parseTiny()
      const out = tiny ? amountIn * 2n : amountIn // spot 2.0, execution 1.0
      return [amountIn, ...path.slice(1, -1).map(() => 0n), out]
    })

    const quote = await quoteSwap({ from: TOKEN_A, to: TOKEN_B, amount: '1' })

    // Half the spot rate is a 50% impact.
    expect(quote.impact).toBeCloseTo(50, 6)
  })

  it('never reports a negative impact when the trade prices better than spot', async () => {
    // Rounding on a tiny probe can make execution look better than spot. A
    // negative warning would read as a bonus, so it is floored at zero.
    publicClient.readContract = vi.fn(async ({ args }) => {
      const [amountIn, path] = args
      const tiny = amountIn <= parseTiny()
      const out = tiny ? amountIn : amountIn * 2n // execution beats spot
      return [amountIn, ...path.slice(1, -1).map(() => 0n), out]
    })

    const quote = await quoteSwap({ from: TOKEN_A, to: TOKEN_B, amount: '1' })

    expect(quote.impact).toBeGreaterThanOrEqual(0)
  })

  it('still returns a usable quote when the impact probe fails', async () => {
    // Impact is advisory. Losing it must not void a quote that priced fine.
    let first = true
    publicClient.readContract = vi.fn(async ({ args }) => {
      const [amountIn, path] = args
      if (!first) throw new Error('probe reverted')
      first = false
      return [amountIn, ...path.slice(1, -1).map(() => 0n), amountIn * 2n]
    })

    const quote = await quoteSwap({ from: TOKEN_A, to: TOKEN_B, amount: '1' })

    expect(quote.amountOut).toBe(2)
    expect(quote.impact).toBeNull()
  })

  it('quotes native PLS through the wrapper', async () => {
    publicClient.readContract = quoteAtRate(2)

    const quote = await quoteSwap({ from: PLS, to: TOKEN_A, amount: '1' })

    expect(quote.path[0]).toBe(WPLS)
  })

  it('reports the rate as output per unit of input', async () => {
    publicClient.readContract = quoteAtRate(2)

    const quote = await quoteSwap({ from: TOKEN_A, to: TOKEN_B, amount: '4' })

    expect(quote.amountIn).toBe(4)
    expect(quote.amountOut).toBeCloseTo(8, 10)
    expect(quote.rate).toBeCloseTo(2, 10)
  })
})

/**
 * 0.0001 of an 18-decimal token: exactly the size of the impact probe.
 *
 * Compared inclusively at the call sites - the probe is this figure, not less
 * than it, and an exclusive test quietly prices the probe like a real trade,
 * which reports every impact as zero.
 */
function parseTiny() {
  return 100_000_000_000_000n
}

describe('findDirectPools', () => {
  it('asks both factories and drops the ones with no pool', async () => {
    const pool = '0xaaaa000000000000000000000000000000000001'
    publicClient.readContract = vi
      .fn()
      .mockResolvedValueOnce(pool)
      .mockResolvedValueOnce(ZERO)

    expect(await findDirectPools(TOKEN_A, TOKEN_B)).toEqual([pool])
  })

  it('deduplicates a pool both factories report', async () => {
    const pool = '0xaaaa000000000000000000000000000000000002'
    publicClient.readContract = vi.fn(async () => pool)

    expect(await findDirectPools(TOKEN_A, TOKEN_B)).toEqual([pool])
  })

  it('returns nothing for a token against itself', async () => {
    expect(await findDirectPools(TOKEN_A, TOKEN_A)).toEqual([])
    // PLS and WPLS are the same asset once the path is built.
    expect(await findDirectPools(PLS, WRAPPED)).toEqual([])
    expect(publicClient.readContract).not.toHaveBeenCalled()
  })

  it('returns nothing when either side is missing', async () => {
    expect(await findDirectPools(null, TOKEN_B)).toEqual([])
    expect(await findDirectPools(TOKEN_A, null)).toEqual([])
  })

  it('survives a factory that throws', async () => {
    const pool = '0xaaaa000000000000000000000000000000000003'
    publicClient.readContract = vi
      .fn()
      .mockRejectedValueOnce(new Error('rpc down'))
      .mockResolvedValueOnce(pool)

    expect(await findDirectPools(TOKEN_A, TOKEN_B)).toEqual([pool])
  })
})

describe('fetchTokenMeta', () => {
  it('reads decimals from the chain rather than assuming eighteen', async () => {
    publicClient.readContract = vi.fn(async ({ functionName }) =>
      functionName === 'decimals' ? 6 : 'USDC'
    )

    const meta = await fetchTokenMeta(USDC.address)

    expect(meta.decimals).toBe(6)
    expect(meta.symbol).toBe('USDC')
  })

  it('marks anything it had to read as unverified', async () => {
    // Three separate tokens on this chain answer to "PRVX"; the picker has to
    // be able to say which one came off the curated list.
    publicClient.readContract = vi.fn(async ({ functionName }) =>
      functionName === 'decimals' ? 18 : 'PRVX'
    )

    expect((await fetchTokenMeta(TOKEN_A.address)).verified).toBe(false)
  })

  it('still returns the token when the symbol call fails', async () => {
    publicClient.readContract = vi.fn(async ({ functionName }) => {
      if (functionName === 'symbol') throw new Error('no symbol')
      return 18
    })

    const meta = await fetchTokenMeta(TOKEN_A.address)

    expect(meta.decimals).toBe(18)
    expect(meta.symbol).toBe('???')
  })

  it('returns nothing without an address', async () => {
    expect(await fetchTokenMeta(null)).toBeNull()
    expect(publicClient.readContract).not.toHaveBeenCalled()
  })

  it('returns nothing when decimals cannot be read, rather than guessing', async () => {
    publicClient.readContract = vi.fn(async ({ functionName }) =>
      functionName === 'decimals' ? null : 'AAA'
    )

    expect(await fetchTokenMeta(TOKEN_A.address)).toBeNull()
  })
})
