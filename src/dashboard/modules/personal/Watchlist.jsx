import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import TokenLogo from '../../../components/TokenLogo'
import { useWatchlistPairs } from '../../services/watchlist'
import { useTopPairs } from '../../services/marketData'
import { ModuleEmpty, ModuleError, ModuleLoading } from '../../components/ModuleStates'
import { useDashboardActions } from '../../state/DashboardProvider'
import { makePair, toTokenRef } from '../../state/tokens'
import { formatCryptoPrice, formatUsd } from '../../../utils/formatters'

/**
 * The pairs this account follows.
 *
 * Shares its storage with the screener and portfolio page, so starring a pair
 * anywhere in PulseDEX puts it here too. Selecting a row sets the dashboard
 * context, which is how a watchlist drives a chart without knowing that any
 * chart exists.
 */
export default function Watchlist({ config }) {
  const actions = useDashboardActions()
  const { rows, remove, move, add, addresses, isLoading, isError, refetch } = useWatchlistPairs()
  const { data: allPairs } = useTopPairs()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  const matches = query.trim()
    ? (allPairs ?? [])
        .filter((p) => {
          const q = query.trim().toLowerCase()
          return (
            !addresses.includes(p.pairAddress?.toLowerCase()) &&
            (p.baseToken?.symbol?.toLowerCase().includes(q) ||
              p.quoteToken?.symbol?.toLowerCase().includes(q))
          )
        })
        .slice(0, 6)
    : []

  if (isLoading && rows.length === 0 && addresses.length > 0) return <ModuleLoading />
  if (isError) return <ModuleError onRetry={refetch} />

  const select = (p) =>
    actions.setGlobalContext({
      asset: toTokenRef(p.baseToken),
      pair: makePair(toTokenRef(p.baseToken), toTokenRef(p.quoteToken), p.pairAddress),
    })

  return (
    <div className="dash-watchlist">
      {rows.length === 0 ? (
        <ModuleEmpty
          label="Nothing on the watchlist yet"
          hint="Add a pair below, or star one anywhere else in PulseDEX."
        />
      ) : (
        <table className="dash-table">
          <thead>
            <tr>
              <th scope="col">Pair</th>
              <th scope="col">Price</th>
              <th scope="col">24h</th>
              {config.showVolume ? <th scope="col">Vol</th> : null}
              <th scope="col"><span className="dash-sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const change = Number(p.priceChange?.h24 ?? 0)
              return (
                <tr key={p.pairAddress}>
                  <th scope="row">
                    <button type="button" className="dash-table-link" onClick={() => select(p)}>
                      <TokenLogo
                        symbol={p.baseToken?.symbol}
                        address={p.baseToken?.address}
                        size={18}
                      />
                      <span className="dash-table-symbol">{p.baseToken?.symbol}</span>
                      <span className="dash-muted">/ {p.quoteToken?.symbol}</span>
                    </button>
                  </th>
                  <td>{formatCryptoPrice(Number(p.priceUsd ?? 0))}</td>
                  <td className={change >= 0 ? 'is-up' : 'is-down'}>
                    {change >= 0 ? '+' : ''}
                    {change.toFixed(1)}%
                  </td>
                  {config.showVolume ? <td>{formatUsd(Number(p.volume?.h24 ?? 0), 0)}</td> : null}
                  <td className="dash-row-actions">
                    {/* Reordering by button rather than by drag: this list sits
                        inside a module that is itself draggable, and nesting a
                        second drag surface inside the first is a fight the user
                        always loses. */}
                    <button
                      type="button"
                      className="dash-icon-btn"
                      onClick={() => move(p.pairAddress, 'up')}
                      aria-label={`Move ${p.baseToken?.symbol} up`}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      className="dash-icon-btn"
                      onClick={() => move(p.pairAddress, 'down')}
                      aria-label={`Move ${p.baseToken?.symbol} down`}
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      className="dash-icon-btn"
                      onClick={() => remove(p.pairAddress)}
                      aria-label={`Remove ${p.baseToken?.symbol} from watchlist`}
                    >
                      <X size={12} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {adding ? (
        <div className="dash-watchlist-add">
          <input
            autoFocus
            type="text"
            className="dash-input"
            placeholder="Search a pair to add"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search pairs to add"
          />
          {matches.map((p) => (
            <button
              key={p.pairAddress}
              type="button"
              className="dash-token-row"
              onClick={() => {
                add(p.pairAddress)
                setQuery('')
                setAdding(false)
              }}
            >
              <TokenLogo symbol={p.baseToken?.symbol} address={p.baseToken?.address} size={18} />
              <span className="dash-token-symbol">
                {p.baseToken?.symbol} / {p.quoteToken?.symbol}
              </span>
              <span className="dash-muted">{formatUsd(Number(p.liquidity?.usd ?? 0), 0)}</span>
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="dash-btn dash-btn-sm" onClick={() => setAdding(true)}>
          <Plus size={12} /> Add pair
        </button>
      )}
    </div>
  )
}
