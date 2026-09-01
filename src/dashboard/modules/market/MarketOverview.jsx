import { useMarketTotals, useGasPrice } from '../../services/marketData'
import { ModuleError, ModuleLoading } from '../../components/ModuleStates'
import { formatUsd, formatCompactCount } from '../../../utils/formatters'

/**
 * Chain-level totals.
 *
 * Every figure is a sum over the pairs PulseDEX tracks, and the module says so
 * rather than presenting them as chain-wide. The difference matters: DexScreener
 * indexes a large share of PulseChain but not all of it, and labelling a partial
 * total "PulseChain volume" would be a number that is wrong in a way nobody
 * could detect from looking at it.
 */
export default function MarketOverview() {
  const { data: totals, isLoading, isError, refetch } = useMarketTotals()
  const { data: gas } = useGasPrice()

  if (isLoading && !totals) return <ModuleLoading />
  if (isError) return <ModuleError onRetry={refetch} />
  if (!totals) return <ModuleLoading />

  const stats = [
    { label: '24h volume', value: formatUsd(totals.volume, 0) },
    { label: 'Liquidity', value: formatUsd(totals.liquidity, 0) },
    { label: '24h transactions', value: formatCompactCount(totals.transactions, 0) },
    { label: 'Tracked pairs', value: formatCompactCount(totals.pairCount, 0) },
    // Gas comes from a separate call and can be absent without the rest of the
    // panel being wrong, so it degrades on its own.
    { label: 'Gas', value: gas ? `${gas} beat` : '—' },
  ]

  return (
    <div className="dash-overview">
      <dl className="dash-stat-row">
        {stats.map((s) => (
          <div key={s.label} className="dash-stat">
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="dash-module-note">
        Totalled across the {formatCompactCount(totals.pairCount, 0)} pairs PulseDEX tracks, not
        all of PulseChain.
      </p>
    </div>
  )
}
