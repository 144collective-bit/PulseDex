import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getPairsByTokens,
  getPulsePair,
  getTopPulsePairs,
  getPulseGasPrice,
  isStablecoin,
} from '../../services/dexscreener'
import { getPoolCandles } from '../../services/geckoterminal'
import { NATIVE_PLS } from '../../config/dex'
import { WPLS } from '../state/tokens'

/**
 * The dashboard's data layer.
 *
 * Every module reads market data through these hooks and none of them fetch
 * directly. That is what makes the performance requirement hold: five price
 * cards showing five different tokens share one `topPairs` request, because
 * they share one query key, and React Query deduplicates the rest.
 *
 * Nothing here invents a number. Where PulseDEX has no source for a figure,
 * the hook returns null and the module says so.
 */

/**
 * A queue in front of the candle API.
 *
 * The chart wall renders up to six tiles, each wanting its own pool's history,
 * and React mounts them all in the same tick - six simultaneous requests to an
 * unauthenticated endpoint that rate-limits hard. Every one of them came back
 * 429, so the module rendered six empty charts and looked broken on a perfectly
 * healthy connection.
 *
 * Caching does not help: they are six different pools, so there is nothing to
 * deduplicate. The requests have to be spread out instead, and measured against
 * the real endpoint the limit is tighter than it looks - three sequential calls
 * a second apart still drew a 429 in the middle. So requests are spaced, and
 * paired with the backoff below, because the failures are intermittent rather
 * than a hard wall: the same request usually succeeds a moment later.
 *
 * Deliberately here rather than in `services/geckoterminal.js`: that module is
 * shared with the screener, where a single chart should not be made to wait
 * behind a queue it never contributed to.
 */
const CANDLE_SPACING_MS = 700

function createSpacedQueue(spacing) {
  let tail = Promise.resolve()

  return function enqueue(task) {
    // Each call chains onto the last, so tasks start in order and at least
    // `spacing` apart. Rejections are swallowed from the chain - one failed
    // request must not stop everything queued behind it - while still being
    // returned to that request's own caller.
    const result = tail.then(task)
    tail = result.catch(() => {}).then(() => new Promise((r) => setTimeout(r, spacing)))
    return result
  }
}

const queueCandleRequest = createSpacedQueue(CANDLE_SPACING_MS)

/**
 * Be patient with the candle endpoint rather than failing fast.
 *
 * Its rejections are transient - a request refused now generally succeeds a
 * couple of seconds later - so one immediate retry, which is React Query's
 * default posture, converts a momentary limit into a module that says it is
 * broken. Backing off gives the window time to reopen.
 */
const CANDLE_RETRY = {
  retry: 3,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
}

/** One place for the polling intervals, so modules cannot each pick their own. */
const REFRESH = {
  /** Board-level data: everything derives from this, so it is the one that matters. */
  pairs: 30_000,
  /** A single pair being watched closely. */
  pair: 20_000,
  /** Candles change slowly relative to their cost, and the API rate-limits bursts. */
  candles: 60_000,
  chain: 60_000,
}

/**
 * The whole PulseChain pair board.
 *
 * Deliberately the only entry point for "what is the market doing" - movers,
 * trending, market overview and every price card read from this one response
 * rather than each asking DexScreener their own question.
 */
export function useTopPairs() {
  return useQuery({
    queryKey: ['dashboard', 'topPairs'],
    queryFn: getTopPulsePairs,
    refetchInterval: REFRESH.pairs,
    staleTime: REFRESH.pairs / 2,
    placeholderData: (prev) => prev,
  })
}

/** Native PLS is quoted through WPLS; the UI still calls it PLS. */
function marketAddress(token) {
  if (!token?.address) return null
  return token.address === NATIVE_PLS ? WPLS.address : token.address
}

/**
 * The best market for one token.
 *
 * "Best" is the deepest non-stablecoin-base pool where the token is the base
 * asset, which is how the rest of PulseDEX picks a reference market. Falls back
 * to any pool mentioning the token, because a thin market is still better than
 * showing nothing for an asset that plainly trades.
 */
export function useTokenMarket(token) {
  const address = marketAddress(token)

  const query = useQuery({
    queryKey: ['dashboard', 'tokenMarket', address?.toLowerCase() ?? null],
    queryFn: () => getPairsByTokens([address]),
    enabled: Boolean(address),
    refetchInterval: REFRESH.pair,
    staleTime: REFRESH.pair / 2,
    placeholderData: (prev) => prev,
  })

  const pair = useMemo(() => {
    const pairs = query.data ?? []
    if (pairs.length === 0) return null
    const lower = address?.toLowerCase()

    const asBase = pairs.filter((p) => p.baseToken?.address?.toLowerCase() === lower)
    const preferred = asBase.filter((p) => !isStablecoin(p.baseToken?.symbol))
    const pool = (preferred.length ? preferred : asBase.length ? asBase : pairs).slice()

    pool.sort((a, b) => Number(b.liquidity?.usd ?? 0) - Number(a.liquidity?.usd ?? 0))
    return pool[0] ?? null
  }, [query.data, address])

  return { ...query, pair }
}

/**
 * Resolve a PairRef to a live market.
 *
 * A PairRef is two assets the user chose; it may or may not name a pool. When
 * it does, the pool is read directly. When it does not, the deepest pool
 * holding both assets is found - and if there is none, this returns null rather
 * than quietly substituting a different pair, because a chart labelled
 * "HEX / WPLS" that is actually drawing HEX / DAI is worse than an empty one.
 */
export function usePairMarket(pair) {
  const baseAddress = marketAddress(pair?.base)
  const quoteAddress = marketAddress(pair?.quote)
  const pinned = pair?.pairAddress ?? null

  return useQuery({
    queryKey: [
      'dashboard',
      'pairMarket',
      pinned?.toLowerCase() ?? null,
      baseAddress?.toLowerCase() ?? null,
      quoteAddress?.toLowerCase() ?? null,
    ],
    enabled: Boolean(pinned || (baseAddress && quoteAddress)),
    refetchInterval: REFRESH.pair,
    staleTime: REFRESH.pair / 2,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      if (pinned) return getPulsePair(pinned)

      const pairs = await getPairsByTokens([baseAddress])
      const b = baseAddress.toLowerCase()
      const q = quoteAddress.toLowerCase()

      const matches = pairs.filter((p) => {
        const pb = p.baseToken?.address?.toLowerCase()
        const pq = p.quoteToken?.address?.toLowerCase()
        return (pb === b && pq === q) || (pb === q && pq === b)
      })

      matches.sort((x, y) => Number(y.liquidity?.usd ?? 0) - Number(x.liquidity?.usd ?? 0))
      return matches[0] ?? null
    },
  })
}

/**
 * OHLCV for a pool.
 *
 * Keyed on pool and interval so two charts on the same pool and timeframe cost
 * one request, and a chart redrawn after a config change reuses what is already
 * cached rather than going back to a rate-limited free API.
 */
export function usePoolCandles(poolAddress, interval) {
  return useQuery({
    queryKey: ['dashboard', 'candles', poolAddress?.toLowerCase() ?? null, interval],
    queryFn: () => queueCandleRequest(() => getPoolCandles(poolAddress, interval)),
    enabled: Boolean(poolAddress),
    refetchInterval: REFRESH.candles,
    staleTime: REFRESH.candles / 2,
    placeholderData: (prev) => prev,
    ...CANDLE_RETRY,
  })
}

/**
 * A token's price history in USD.
 *
 * The OHLCV endpoint quotes a pool, not a token, so asking it for a pool
 * returns whichever side that pool happens to lead with - the WPLS/DAI pool
 * answers with DAI at about a dollar, a flat line if you wanted PLS. Naming the
 * token leaves no room for that, and the values come back in USD rather than in
 * the pool's own units: PLSX from the PLSX/WPLS pool reads 0.00000955, its
 * dollar price, not 0.875, its price in WPLS.
 *
 * That is what makes a ratio between two tokens meaningful - both series are in
 * the same unit, so dividing them cancels it out.
 */
export function useTokenUsdSeries(token, interval = '1h') {
  const { pair } = useTokenMarket(token)
  const poolAddress = pair?.pairAddress
  const address = marketAddress(token)

  return useQuery({
    queryKey: [
      'dashboard',
      'usdSeries',
      poolAddress?.toLowerCase() ?? null,
      address?.toLowerCase() ?? null,
      interval,
    ],
    queryFn: () =>
      queueCandleRequest(() => getPoolCandles(poolAddress, interval, { tokenAddress: address })),
    enabled: Boolean(poolAddress && address),
    refetchInterval: REFRESH.candles,
    staleTime: REFRESH.candles / 2,
    placeholderData: (prev) => prev,
    ...CANDLE_RETRY,
  })
}

/**
 * How many of B one A is worth, over time.
 *
 * Aligned on timestamps the two series actually share rather than zipped by
 * index. The tokens are priced from different pools, which trade at different
 * times and can be missing different candles, so pairing the nth of one with
 * the nth of the other would silently compare prices from different hours - and
 * the resulting line would look plausible while being wrong.
 *
 * @returns {{data: {time:number,value:number}[], isLoading:boolean, isError:boolean, error:unknown, refetch:Function, missing:boolean}}
 */
export function useRatioSeries(tokenA, tokenB, interval = '1h') {
  const a = useTokenUsdSeries(tokenA, interval)
  const b = useTokenUsdSeries(tokenB, interval)

  const data = useMemo(() => {
    if (!a.data?.length || !b.data?.length) return []

    const byTime = new Map(b.data.map((c) => [c.time, c.close]))
    const out = []

    for (const candle of a.data) {
      const other = byTime.get(candle.time)
      // A zero denominator is a bad candle, not a ratio of infinity.
      if (!other || !isFinite(other) || other === 0) continue
      if (!isFinite(candle.close)) continue
      out.push({ time: candle.time, value: candle.close / other })
    }

    return out
  }, [a.data, b.data])

  return {
    data,
    isLoading: a.isLoading || b.isLoading,
    isFetching: a.isFetching || b.isFetching,
    isError: a.isError || b.isError,
    error: a.error ?? b.error,
    refetch: () => {
      a.refetch()
      b.refetch()
    },
    // Both sides loaded but nothing lined up - worth saying, because it means
    // something different from "still loading".
    missing: Boolean(a.data?.length && b.data?.length && data.length === 0),
  }
}

/** Chain-level figures the PulseChain modules read. */
export function useGasPrice() {
  return useQuery({
    queryKey: ['dashboard', 'gas'],
    queryFn: getPulseGasPrice,
    refetchInterval: REFRESH.chain,
    staleTime: REFRESH.chain / 2,
  })
}

/**
 * Aggregate the pair board into chain-wide totals.
 *
 * Derived from the same `topPairs` response the rest of the dashboard uses, so
 * it costs nothing extra. It is explicitly a total across the pairs PulseDEX
 * tracks, not across all of PulseChain - the modules say so, because presenting
 * it as the latter would be a fabricated figure.
 */
export function useMarketTotals() {
  const { data: pairs, ...rest } = useTopPairs()

  const totals = useMemo(() => {
    if (!pairs?.length) return null

    let volume = 0
    let liquidity = 0
    let transactions = 0

    for (const p of pairs) {
      volume += Number(p.volume?.h24 ?? 0)
      liquidity += Number(p.liquidity?.usd ?? 0)
      transactions += Number(p.txns?.h24?.buys ?? 0) + Number(p.txns?.h24?.sells ?? 0)
    }

    return { volume, liquidity, transactions, pairCount: pairs.length }
  }, [pairs])

  return { ...rest, data: totals }
}

/**
 * Rank the board.
 *
 * One function behind Top Gainers, Top Losers, Highest Volume and Most
 * Transactions - they are the same list with a different sort, and writing four
 * modules for that would be four places to fix the next bug.
 */
export const RANK_MODES = {
  gainers: {
    label: 'Top gainers',
    value: (p) => Number(p.priceChange?.h24 ?? 0),
    direction: 'desc',
  },
  losers: {
    label: 'Top losers',
    value: (p) => Number(p.priceChange?.h24 ?? 0),
    direction: 'asc',
  },
  volume: {
    label: 'Highest volume',
    value: (p) => Number(p.volume?.h24 ?? 0),
    direction: 'desc',
  },
  transactions: {
    label: 'Most transactions',
    value: (p) => Number(p.txns?.h24?.buys ?? 0) + Number(p.txns?.h24?.sells ?? 0),
    direction: 'desc',
  },
  liquidity: {
    label: 'Deepest liquidity',
    value: (p) => Number(p.liquidity?.usd ?? 0),
    direction: 'desc',
  },
}

/**
 * A ranked slice of the board.
 *
 * The liquidity floor is not decoration. A pool holding a few hundred dollars
 * moves 90% on a single trade, so an unfiltered "top gainers" is a list of
 * dust pools every time - which tells the user nothing and looks like the data
 * is wrong.
 */
export function useRankedPairs({ mode = 'gainers', limit = 8, minLiquidity = 25_000 } = {}) {
  const { data: pairs, ...rest } = useTopPairs()

  const ranked = useMemo(() => {
    const spec = RANK_MODES[mode] ?? RANK_MODES.gainers
    if (!pairs?.length) return []

    const eligible = pairs.filter(
      (p) =>
        Number(p.liquidity?.usd ?? 0) >= minLiquidity && !isStablecoin(p.baseToken?.symbol),
    )

    const sorted = eligible.slice().sort((a, b) => {
      const diff = spec.value(a) - spec.value(b)
      return spec.direction === 'asc' ? diff : -diff
    })

    return sorted.slice(0, limit)
  }, [pairs, mode, limit, minLiquidity])

  return { ...rest, data: ranked }
}
