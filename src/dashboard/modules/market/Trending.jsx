import { useMemo } from 'react'
import { useTopPairs } from '../../services/marketData'
import { isStablecoin } from '../../../services/dexscreener'
import { ModuleError, ModuleLoading } from '../../components/ModuleStates'
import PairRowList from '../../components/PairRowList'
import { trendingPairs } from '../../../utils/trending'

/**
 * What is unusually busy right now.
 *
 * "Trending" is not a field any source here provides, so it is computed rather
 * than borrowed - and computed only from figures DexScreener actually returns:
 * the last hour's volume against the last day's average hour.
 *
 * The computation used to be inline here and is now src/utils/trending.js,
 * because the social section needs the same answer and two trending
 * definitions in one app is a number that disagrees with itself depending on
 * which page you are looking at. Moving it also gave it tests, which it did
 * not have - including the one that matters: a pool created an hour ago has
 * almost no daily volume, so without the floors its ratio is enormous and the
 * top of this list is permanently whatever was deployed most recently.
 */
export default function Trending({ config }) {
  const { data: pairs, isLoading, isError, refetch } = useTopPairs()

  const trending = useMemo(
    () =>
      trendingPairs(pairs, {
        limit: config.limit ?? 10,
        exclude: (p) => isStablecoin(p.baseToken?.symbol),
      }).map((row) => row.pair),
    [pairs, config.limit],
  )

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
