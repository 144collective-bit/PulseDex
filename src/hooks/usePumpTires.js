import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import {
  getTokenList,
  getTokenData,
  getCandles,
  getTransactions,
  getPlsPrice,
  getProtocolStats,
  getGlobalActivity,
} from '../services/pumptires'
import { getPairsByTokens } from '../services/dexscreener'
import { POLL_TOKENS, POLL_ACTIVITY, POLL_PRICE } from '../config/pumptires'

/**
 * React Query bindings for the pump.tires launchpad.
 *
 * Poll intervals live in config/pumptires.js so every board panel refreshes on
 * the same cadence the launchpad itself uses.
 */

/** Live PLS/USD price. Everything on the board is quoted in PLS until this lands. */
export function usePlsPrice() {
  return useQuery({
    queryKey: ['pumptires', 'plsPrice'],
    queryFn: getPlsPrice,
    refetchInterval: POLL_PRICE,
    staleTime: 30000,
  })
}

/**
 * One board column, paged. `filter` picks which column: `created_timestamp`,
 * `top_bonding`, or `launch_timestamp`.
 */
export function useTokenColumn(filter, search) {
  return useInfiniteQuery({
    queryKey: ['pumptires', 'column', filter, search || ''],
    queryFn: ({ pageParam }) => getTokenList(filter, { cursor: pageParam, search }),
    initialPageParam: undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    refetchInterval: POLL_TOKENS,
    staleTime: 15000,
  })
}

/** Full token record plus holder distribution. */
export function useTokenDetail(address) {
  return useQuery({
    queryKey: ['pumptires', 'token', address],
    queryFn: () => getTokenData(address),
    enabled: Boolean(address),
    refetchInterval: POLL_TOKENS,
    staleTime: 15000,
  })
}

/** OHLC candles for the detail chart. `interval` is in seconds. */
export function useTokenCandles(address, interval = 300) {
  return useQuery({
    queryKey: ['pumptires', 'candles', address, interval],
    queryFn: () => getCandles(address, interval),
    enabled: Boolean(address),
    refetchInterval: POLL_ACTIVITY,
    staleTime: 10000,
  })
}

/** Recent trades for one token. */
export function useTokenTransactions(address, limit = 50) {
  return useQuery({
    queryKey: ['pumptires', 'txns', address, limit],
    queryFn: () => getTransactions(address, { limit }),
    enabled: Boolean(address),
    refetchInterval: POLL_ACTIVITY,
    staleTime: 10000,
  })
}

/**
 * Cross-token trade tape, merged from the tokens currently on the board.
 *
 * `addresses` is memoised by the caller into a stable key so the tape doesn't
 * refetch on every parent render.
 */
export function useGlobalActivity(addresses = []) {
  const key = addresses.join(',')
  return useQuery({
    queryKey: ['pumptires', 'activity', key],
    queryFn: () => getGlobalActivity(addresses),
    enabled: addresses.length > 0,
    refetchInterval: POLL_ACTIVITY,
    staleTime: 8000,
    // Keep the last tape visible while the next merge is in flight.
    placeholderData: (prev) => prev,
  })
}

/** Launchpad-wide totals for the header strip. */
export function useProtocolStats(days = 7) {
  return useQuery({
    queryKey: ['pumptires', 'stats', days],
    queryFn: () => getProtocolStats(days),
    refetchInterval: 120000,
    staleTime: 60000,
  })
}

/**
 * Graduated tokens enriched with live DEX metrics.
 *
 * Once a token graduates, the curve stops being the price source — the PulseX
 * pair is. We take the launchpad's graduated list for identity and bonding
 * history, then join DexScreener on the pair address for the 5m/1h/6h/24h
 * movement, volume, and liquidity a mover board needs.
 */
export function useGraduatedMovers(limit = 30) {
  return useQuery({
    queryKey: ['pumptires', 'movers', limit],
    queryFn: async () => {
      const { tokens } = await getTokenList('launch_timestamp', { limit })
      const graduated = tokens.filter((t) => t.isLaunched && t.pairAddress)
      if (!graduated.length) return []

      const pairs = await getPairsByTokens(graduated.map((t) => t.address))

      // Index by base token address, keeping the deepest pool per token.
      const byToken = new Map()
      pairs.forEach((p) => {
        const addr = p.baseToken?.address?.toLowerCase()
        if (!addr) return
        const liq = parseFloat(p.liquidity?.usd || 0)
        const existing = byToken.get(addr)
        if (!existing || liq > parseFloat(existing.liquidity?.usd || 0)) {
          byToken.set(addr, p)
        }
      })

      return graduated
        .map((token) => {
          const pair = byToken.get(token.address.toLowerCase()) || null
          return {
            ...token,
            pair,
            priceUsd: parseFloat(pair?.priceUsd || 0),
            change5m: pair?.priceChange?.m5 ?? null,
            change1h: pair?.priceChange?.h1 ?? null,
            change6h: pair?.priceChange?.h6 ?? null,
            change24h: pair?.priceChange?.h24 ?? null,
            volume24h: parseFloat(pair?.volume?.h24 || 0),
            liquidityUsd: parseFloat(pair?.liquidity?.usd || 0),
            marketCapUsd: parseFloat(pair?.marketCap || pair?.fdv || 0),
            txns24h:
              (pair?.txns?.h24?.buys || 0) + (pair?.txns?.h24?.sells || 0),
          }
        })
        // A pair that DexScreener hasn't indexed yet has no movement to show.
        .filter((t) => t.pair)
        .sort((a, b) => b.volume24h - a.volume24h)
    },
    refetchInterval: POLL_TOKENS,
    staleTime: 20000,
  })
}
