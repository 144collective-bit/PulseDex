import { useMemo } from 'react'
import { useTopPairs } from '../../services/marketData'
import { isStablecoin } from '../../../services/dexscreener'
import { ModuleError, ModuleLoading } from '../../components/ModuleStates'
import PairRowList from '../../components/PairRowList'

/**
 * What is unusually busy right now.
 *
 * "Trending" is not a field any source here provides, so it is computed rather
 * than borrowed - and computed only from figures DexScreener actually returns:
 * the last hour's volume against the last day's average hour.
 *
 * A pair trading at its normal rate scores 1. A pair doing five times its usual
 * hourly volume scores 5. That is a real measurement of acceleration, which is
 * what the word is meant to convey - as opposed to ranking by raw volume,
 * which would just be the same large pairs every hour of every day.
 */

/** Below this, an hour of volume is a couple of trades and the ratio is noise. */
const MIN_HOUR_VOLUME = 5_000
const MIN_LIQUIDITY = 25_000

export default function Trending({ config }) {
  const { data: pairs, isLoading, isError, refetch } = useTopPairs()

  const trending = useMemo(() => {
    if (!pairs?.length) return []

    return pairs
      .map((p) => {
        const hour = Number(p.volume?.h1 ?? 0)
        const day = Number(p.volume?.h24 ?? 0)
        const liquidity = Number(p.liquidity?.usd ?? 0)
        const averageHour = day / 24

        if (
          hour < MIN_HOUR_VOLUME ||
          averageHour <= 0 ||
          liquidity < MIN_LIQUIDITY ||
          isStablecoin(p.baseToken?.symbol)
        ) {
          return null
        }

        return { pair: p, score: hour / averageHour }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, config.limit ?? 10)
      .map((row) => row.pair)
  }, [pairs, config.limit])

  if (isLoading && !pairs) return <ModuleLoading />
  if (isError) return <ModuleError onRetry={refetch} />

  return (
    <>
      <p className="dash-module-note">Hour volume against this pair&rsquo;s daily average.</p>
      <PairRowList
        pairs={trending}
        column="volume"
        emptyLabel="Nothing is trading unusually fast right now"
      />
    </>
  )
}
