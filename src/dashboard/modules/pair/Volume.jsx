import { usePairMarket } from '../../services/marketData'
import { ModuleEmpty, ModuleError, ModuleLoading } from '../../components/ModuleStates'
import StatGrid from '../../components/StatGrid'
import { formatUsd, formatCompactCount } from '../../../utils/formatters'

/**
 * Trading activity across the windows the source actually reports.
 *
 * DexScreener returns 5m, 1h, 6h and 24h buckets, so those are the buckets
 * shown. The bar underneath is drawn from the same four numbers rather than
 * from a separate series - it is a shape, not a chart, and is not labelled as
 * one.
 */
export default function Volume({ config, context }) {
  const pair = context.following ? context.pair : config.pair
  const { data: market, isLoading, isError, refetch } = usePairMarket(pair)

  if (!pair?.base || !pair?.quote) return <ModuleEmpty label="No pair selected" />
  if (isLoading && !market) return <ModuleLoading />
  if (isError) return <ModuleError onRetry={refetch} />
  if (!market) return <ModuleEmpty label="No pool found for this pair" />

  const windows = [
    { key: 'm5', label: '5m' },
    { key: 'h1', label: '1h' },
    { key: 'h6', label: '6h' },
    { key: 'h24', label: '24h' },
  ]

  const values = windows.map((w) => ({ ...w, value: Number(market.volume?.[w.key] ?? 0) }))
  const peak = Math.max(...values.map((v) => v.value), 1)

  const buys = Number(market.txns?.h24?.buys ?? 0)
  const sells = Number(market.txns?.h24?.sells ?? 0)

  return (
    <>
      <StatGrid
        stats={[
          { label: '24h volume', value: formatUsd(Number(market.volume?.h24 ?? 0), 0) },
          {
            label: '24h transactions',
            value: buys + sells ? formatCompactCount(buys + sells, 0) : null,
          },
          { label: 'Buys', value: buys ? formatCompactCount(buys, 0) : null, tone: 'up' },
          { label: 'Sells', value: sells ? formatCompactCount(sells, 0) : null, tone: 'down' },
        ]}
      />

      <ul className="dash-volume-bars">
        {values.map((v) => (
          <li key={v.key}>
            <span className="dash-volume-label">{v.label}</span>
            <span className="dash-volume-track">
              <span className="dash-volume-fill" style={{ width: `${(v.value / peak) * 100}%` }} />
            </span>
            <span className="dash-volume-value">{formatUsd(v.value, 0)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
