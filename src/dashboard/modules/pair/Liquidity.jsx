import { usePairMarket } from '../../services/marketData'
import { ModuleEmpty, ModuleError, ModuleLoading } from '../../components/ModuleStates'
import StatGrid from '../../components/StatGrid'
import { formatUsd } from '../../../utils/formatters'

/**
 * Pool depth, and how it is split.
 *
 * There is no liquidity *change* here. DexScreener reports the pool's current
 * reserves and nothing historical, so a "24h liquidity change" would have to be
 * invented - and a fabricated number about pool depth is exactly the kind that
 * gets read as a rug-pull signal. The split between the two sides is real and
 * is shown instead.
 */
export default function Liquidity({ config, context }) {
  const pair = context.following ? context.pair : config.pair
  const { data: market, isLoading, isError, refetch } = usePairMarket(pair)

  if (!pair?.base || !pair?.quote) return <ModuleEmpty label="No pair selected" />
  if (isLoading && !market) return <ModuleLoading />
  if (isError) return <ModuleError onRetry={refetch} />
  if (!market) return <ModuleEmpty label="No pool found for this pair" />

  const total = Number(market.liquidity?.usd ?? 0)
  const baseReserve = Number(market.liquidity?.base ?? 0)
  const quoteReserve = Number(market.liquidity?.quote ?? 0)
  const volume = Number(market.volume?.h24 ?? 0)

  return (
    <>
      <StatGrid
        stats={[
          { label: 'Total liquidity', value: total ? formatUsd(total, 0) : null },
          {
            label: `${market.baseToken?.symbol} reserve`,
            value: baseReserve
              ? baseReserve.toLocaleString('en-US', { maximumFractionDigits: 0 })
              : null,
          },
          {
            label: `${market.quoteToken?.symbol} reserve`,
            value: quoteReserve
              ? quoteReserve.toLocaleString('en-US', { maximumFractionDigits: 0 })
              : null,
          },
          {
            // Volume against depth says how hard the pool is working. A pool
            // turning over several times its own depth in a day is a different
            // animal from one that has barely traded, and neither figure alone
            // shows that.
            label: 'Volume / liquidity',
            value: total && volume ? `${(volume / total).toFixed(2)}x` : null,
          },
        ]}
      />
      <p className="dash-module-note">
        Current reserves. PulseDEX has no historical depth series, so no change over time is shown.
      </p>
    </>
  )
}
