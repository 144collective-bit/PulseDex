import { useMemo } from 'react'
import { usePairMarket } from '../../services/marketData'
import { usePoolSwaps } from '../../services/pairActivity'
import { ModuleEmpty, ModuleError, ModuleLoading } from '../../components/ModuleStates'
import { formatTimeAgo, formatAddress } from '../../../utils/formatters'

/**
 * The swap tape for a pool, read from the chain.
 *
 * Prices are quoted in the counter asset rather than converted to USD. The
 * conversion would need the counter asset's price at that block, which the
 * source does not carry - pricing an hour-old trade at today's rate would put a
 * number on screen that no trade ever happened at.
 */
export default function RecentTrades({ config, context }) {
  const pair = context.following ? context.pair : config.pair
  const { data: market, isLoading: loadingPair } = usePairMarket(pair)

  const poolAddress = market?.pairAddress
  const baseAddress = market?.baseToken?.address

  const { data, isLoading, isError, error, refetch } = usePoolSwaps(
    poolAddress,
    baseAddress,
    config.limit ?? 25,
  )

  const rows = useMemo(() => {
    if (!data) return []
    const filter = config.filter ?? 'all'
    const min = Number(config.minAmount ?? 0)
    return data
      .filter((s) => (filter === 'all' ? true : s.side === filter))
      .filter((s) => (min > 0 ? s.baseAmount >= min : true))
  }, [data, config.filter, config.minAmount])

  if (!pair?.base) return <ModuleEmpty label="No pair selected" />
  if (loadingPair || (isLoading && !data)) return <ModuleLoading label="Reading swaps" />
  if (!poolAddress) return <ModuleEmpty label="No pool found for this pair" />
  if (isError) return <ModuleError onRetry={refetch} detail={error?.message} />
  if (rows.length === 0) {
    return <ModuleEmpty label="No swaps match these filters" hint="Try widening the size filter." />
  }

  return (
    <table className="dash-table dash-table-dense">
      <thead>
        <tr>
          <th scope="col">Side</th>
          <th scope="col">{market?.baseToken?.symbol ?? 'Amount'}</th>
          <th scope="col">Price</th>
          <th scope="col">Trader</th>
          <th scope="col">Age</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.hash}>
            <td className={s.side === 'buy' ? 'is-up' : 'is-down'}>
              {s.side === 'buy' ? 'Buy' : 'Sell'}
            </td>
            <td>{s.baseAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
            <td>
              {s.price.toPrecision(5)} <span className="dash-muted">{s.counterSymbol}</span>
            </td>
            <td className="dash-muted">{s.trader ? formatAddress(s.trader) : '—'}</td>
            <td className="dash-muted">
              {formatTimeAgo(Math.floor(new Date(s.timestamp).getTime() / 1000))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
