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
    queryFn: () => getPoolCandles(poolAddress, interval),
    enabled: Boolean(poolAddress),
    refetchInterval: REFRESH.candles,
    staleTime: REFRESH.candles / 2,
    placeholderData: (prev) => prev,
    retry: 1,
  })
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
