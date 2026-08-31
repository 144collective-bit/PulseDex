import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { getPoolCandles } from '../services/geckoterminal'

/**
 * History for the Home board's summary tiles.
 *
 * The tiles are aggregates over the core assets, and no API reports the
 * history of an aggregate - so it is assembled here from the same per-token
 * candle series the cards already draw.
 *
 * That "already" is the point. These queries use the identical key, interval
 * and options as the cards' sparklines, so React Query serves both from one
 * cache entry and the tiles cost no additional requests. Given the chart API
 * limits by address and answers a limit by dropping its CORS header - taking
 * every chart on the page down at once - a second set of six requests for the
 * same data would have been an expensive way to draw four small lines.
 *
 * Liquidity is missing on purpose. OHLCV carries prices and volumes and says
 * nothing about pool depth over time, and there is no free source that does,
 * so that tile gets no line rather than an invented one.
 */
export function useCoreAggregateSeries(assets) {
  const withPools = useMemo(
    () => (assets || []).filter((a) => a.pairAddress && a.address),
    [assets]
  )

  const results = useQueries({
    queries: withPools.map((asset) => ({
      // Identical to TokenSparkline's key, so the cards and the tiles share
      // one request per token.
      queryKey: ['sparkline', asset.pairAddress.toLowerCase(), asset.address.toLowerCase(), '1h'],
      queryFn: () => getPoolCandles(asset.pairAddress, '1h', { tokenAddress: asset.address }),
      staleTime: 5 * 60_000,
      refetchInterval: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    })),
  })

  const seriesKey = results.map((r) => r.data?.length || 0).join(',')

  return useMemo(() => {
    const loaded = results
      .map((r, i) => ({ asset: withPools[i], candles: r.data }))
      .filter((x) => Array.isArray(x.candles) && x.candles.length > 2)

    if (loaded.length < 2) return { marketCap: null, volume: null, change: null }

    /*
     * Align on the timestamps every token has.
     *
     * The pools do not all trade in the same hours, so their series start at
     * different points and skip different gaps. Summing them by position
     * would add one token's Tuesday to another's Wednesday; summing on the
     * shared timestamps is the only way the total means anything.
     */
    let shared = new Set(loaded[0].candles.map((c) => c.time))
    for (const { candles } of loaded.slice(1)) {
      const theirs = new Set(candles.map((c) => c.time))
      shared = new Set([...shared].filter((t) => theirs.has(t)))
    }

    const times = [...shared].sort((a, b) => a - b)
    if (times.length < 3) return { marketCap: null, volume: null, change: null }

    const byTime = loaded.map(({ asset, candles }) => ({
      asset,
      map: new Map(candles.map((c) => [c.time, c])),
    }))

    const marketCap = []
    const volume = []
    const change = []

    for (const time of times) {
      let cap = 0
      let vol = 0
      let weightedMove = 0
      let weight = 0

      for (const { asset, map } of byTime) {
        const candle = map.get(time)
        if (!candle) continue

        vol += candle.volume || 0

        // Supply is read on-chain and is current, not historical - so this is
        // today's supply at that hour's price. Over a day that is a rounding
        // error next to price movement, and it is the only supply there is.
        if (asset.supply > 0) {
          const value = candle.close * asset.supply
          cap += value

          const first = map.get(times[0])
          if (first?.close > 0) {
            weightedMove += ((candle.close - first.close) / first.close) * 100 * value
            weight += value
          }
        }
      }

      marketCap.push(cap)
      volume.push(vol)
      // Weighted by value, like the headline figure it sits under - a plain
      // average would let the smallest asset swing it as hard as PLS.
      change.push(weight > 0 ? weightedMove / weight : 0)
    }

    return {
      marketCap: marketCap.some((v) => v > 0) ? marketCap : null,
      volume: volume.some((v) => v > 0) ? volume : null,
      change,
    }
  }, [seriesKey, withPools])
}
