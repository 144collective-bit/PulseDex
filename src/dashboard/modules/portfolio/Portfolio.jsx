import { useMemo } from 'react'
import { useWalletPortfolio, selectHoldings } from '../../services/walletData'
import { ModuleEmpty, ModuleError, ModuleLoading } from '../../components/ModuleStates'
import StatGrid from '../../components/StatGrid'
import { formatUsd } from '../../../utils/formatters'

/**
 * What the connected wallet is worth.
 *
 * 24-hour change is computed from the holdings: each position's own 24h price
 * move, weighted by what it is worth. That is a real figure derived from real
 * inputs.
 *
 * Seven-day change and profit/loss are not shown, and that is deliberate.
 * Both need something PulseDEX does not have - a stored history of what the
 * wallet held, or a cost basis for each position. Neither can be inferred from
 * a current balance and a current price, and a profit figure that is actually
 * something else is worse than no profit figure at all on a page about money.
 */
export default function Portfolio({ config }) {
  const { data, isLoading, isError, refetch, isConnected } = useWalletPortfolio(config.wallet)

  const summary = useMemo(() => {
    if (!data) return null
    const holdings = selectHoldings(data)
    const total = holdings.reduce((sum, t) => sum + Number(t.valueUsd ?? 0), 0)

    // Weighted by position value: a 40% move on a dust holding should not read
    // as a 40% move on the portfolio.
    const change =
      total > 0
        ? holdings.reduce(
            (sum, t) => sum + Number(t.change24h ?? 0) * (Number(t.valueUsd ?? 0) / total),
            0,
          )
        : 0

    return { total, change, count: holdings.length }
  }, [data])

  if (!isConnected) {
    return (
      <ModuleEmpty
        label="No wallet connected"
        hint="Connect a wallet, or set an address to watch in this module's settings."
      />
    )
  }
  if (isLoading && !data) return <ModuleLoading label="Reading balances" />
  if (isError) return <ModuleError onRetry={refetch} />
  if (!summary) return <ModuleLoading />

  return (
    <>
      <StatGrid
        stats={[
          { label: 'Total value', value: formatUsd(summary.total, 2) },
          {
            label: '24h change',
            value: `${summary.change >= 0 ? '+' : ''}${summary.change.toFixed(2)}%`,
            tone: summary.change >= 0 ? 'up' : 'down',
          },
          { label: 'Assets held', value: summary.count },
        ]}
      />
      <p className="dash-module-note">
        24h change is each position&rsquo;s price move weighted by its value. Profit and loss needs a
        cost basis, which PulseDEX does not store.
      </p>
    </>
  )
}
