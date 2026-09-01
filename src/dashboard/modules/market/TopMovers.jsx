import { useRankedPairs, RANK_MODES } from '../../services/marketData'
import { ModuleError, ModuleLoading } from '../../components/ModuleStates'
import PairRowList from '../../components/PairRowList'

/**
 * A ranked board, in whichever direction the user asked for.
 *
 * Gainers, losers, volume and transactions are one module with a Metric
 * setting. Two copies of it side by side - one set to gainers, one to losers -
 * is a normal way to use the dashboard, and costs one shared request.
 */

/** Which right-hand column makes sense for each ranking. */
const COLUMN_FOR = {
  gainers: 'change',
  losers: 'change',
  volume: 'volume',
  transactions: 'transactions',
  liquidity: 'liquidity',
}

export default function TopMovers({ config }) {
  const mode = RANK_MODES[config.mode] ? config.mode : 'gainers'

  const { data, isLoading, isError, refetch } = useRankedPairs({
    mode,
    limit: config.limit ?? 8,
    minLiquidity: config.minLiquidity ?? 25_000,
  })

  if (isLoading && !data?.length) return <ModuleLoading />
  if (isError) return <ModuleError onRetry={refetch} />

  return (
    <PairRowList
      pairs={data}
      column={COLUMN_FOR[mode]}
      emptyLabel="No pair clears the liquidity filter right now"
    />
  )
}
