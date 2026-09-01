import { useMemo } from 'react'
import TokenLogo from '../../../components/TokenLogo'
import { useWalletPortfolio, selectHoldings } from '../../services/walletData'
import { ModuleEmpty, ModuleError, ModuleLoading } from '../../components/ModuleStates'
import { useDashboardActions } from '../../state/DashboardProvider'
import { toTokenRef } from '../../state/tokens'
import { formatUsd } from '../../../utils/formatters'

/**
 * Individual positions.
 *
 * Clicking a row sets the dashboard asset, so a portfolio can drive a chart
 * without either module knowing the other exists.
 */
export default function Holdings({ config }) {
  const actions = useDashboardActions()
  const { data, isLoading, isError, refetch, isConnected } = useWalletPortfolio(config.wallet)

  const rows = useMemo(() => {
    if (!data) return []
    const holdings = selectHoldings(data, {
      sortBy: config.sortBy ?? 'value',
      includeSpam: Boolean(config.includeSpam),
    })
    return holdings.slice(0, config.limit ?? 25)
  }, [data, config.sortBy, config.includeSpam, config.limit])

  const total = useMemo(
    () => rows.reduce((sum, t) => sum + Number(t.valueUsd ?? 0), 0),
    [rows],
  )

  if (!isConnected) return <ModuleEmpty label="No wallet connected" />
  if (isLoading && !data) return <ModuleLoading label="Reading balances" />
  if (isError) return <ModuleError onRetry={refetch} />
  if (rows.length === 0) {
    return (
      <ModuleEmpty
        label="No holdings found"
        hint={config.includeSpam ? undefined : 'Airdropped spam tokens are hidden by default.'}
      />
    )
  }

  return (
    <table className="dash-table">
      <thead>
        <tr>
          <th scope="col">Asset</th>
          <th scope="col">Balance</th>
          <th scope="col">Value</th>
          <th scope="col">Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => {
          const value = Number(t.valueUsd ?? 0)
          const share = total > 0 ? (value / total) * 100 : 0
          return (
            <tr key={t.address ?? t.symbol}>
              <th scope="row">
                <button
                  type="button"
                  className="dash-table-link"
                  onClick={() => actions.setGlobalContext({ asset: toTokenRef(t) })}
                >
                  <TokenLogo symbol={t.symbol} address={t.address} size={18} />
                  <span className="dash-table-symbol">{t.symbol}</span>
                </button>
              </th>
              <td>{Number(t.balance ?? 0).toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
              <td>{formatUsd(value, 2)}</td>
              <td>{share.toFixed(1)}%</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
