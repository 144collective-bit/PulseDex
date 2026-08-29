import { Activity, AlertTriangle } from 'lucide-react'
import TrenchTokenLogo from './TrenchTokenLogo'
import { useGlobalActivity } from '../hooks/usePumpTires'
import { formatUsd, formatTimeAgo, formatAddress } from '../utils/formatters'

/**
 * Live buy/sell tape across the tokens currently on the board.
 *
 * The launchpad has no cross-token trade endpoint, so this merges the per-token
 * feeds for the tokens on screen (see getGlobalActivity). That makes it a tape
 * of what's visible rather than of the entire chain.
 */
export default function TrenchActivityFeed({ addresses = [], tokenIndex = {}, onSelectToken }) {
  const { data: trades, isLoading, isError, isFetching } = useGlobalActivity(addresses)
  const rows = trades || []

  // Buy/sell split across the tape, shown as a pressure bar in the header.
  const buys = rows.filter((t) => t.type === 'buy').length
  const buyShare = rows.length ? (buys / rows.length) * 100 : 50

  return (
    <section className="trench-activity trench-panel">
      <header className="trench-panel-head">
        <div className="tph-title-group">
          <Activity size={12} className="text-pulse-purple" />
          <h2 className="tph-title font-mono">Live Trades</h2>
          {isFetching && !isLoading && (
            <span className="tph-live" title="Refreshing" aria-hidden="true" />
          )}
        </div>

        <div className="tph-meta font-mono">
          {rows.length > 0 && (
            <span className="tape-pressure" title={`${buys} buys / ${rows.length - buys} sells`}>
              <span className="tape-pressure-buy" style={{ width: `${buyShare}%` }} />
            </span>
          )}
          <span className="tph-count">{rows.length}</span>
        </div>
      </header>

      <div className="trench-col-labels font-mono is-tape" aria-hidden="true">
        <span>SIDE</span>
        <span>TOKEN</span>
        <span className="tcl-right">VALUE</span>
        <span>MAKER</span>
        <span className="tcl-right">AGE</span>
      </div>

      <div className="trench-panel-scroll is-tape">
        {isLoading && !rows.length && (
          <div className="trench-panel-state font-mono">
            <span className="tph-live" aria-hidden="true" />
            <span>Listening…</span>
          </div>
        )}

        {isError && !rows.length && (
          <div className="trench-panel-state font-mono is-error">
            <AlertTriangle size={15} />
            <span>Tape unavailable</span>
          </div>
        )}

        {!isLoading && !rows.length && !isError && (
          <div className="trench-panel-state font-mono">
            <span>No trades yet</span>
          </div>
        )}

        {rows.map((trade) => {
          const token = tokenIndex[trade.tokenAddress]
          const isBuy = trade.type === 'buy'
          // Size band drives the row's emphasis, so whales stand out on the tape.
          const band = trade.usdValue >= 50 ? 'lg' : trade.usdValue >= 10 ? 'md' : 'sm'

          return (
            <button
              type="button"
              key={trade.id || `${trade.txHash}-${trade.timestamp}`}
              className={`tape-row size-${band} ${isBuy ? 'is-buy' : 'is-sell'}`}
              onClick={() => token && onSelectToken?.(token)}
              title={token ? `Open ${token.symbol}` : trade.txHash}
            >
              <span className="tape-side font-mono">{isBuy ? 'BUY' : 'SELL'}</span>

              <span className="tape-token">
                <TrenchTokenLogo
                  cid={token?.imageCid}
                  address={trade.tokenAddress}
                  symbol={token?.symbol || '?'}
                  size={16}
                />
                <span className="tape-symbol font-mono truncate">
                  {token?.symbol || formatAddress(trade.tokenAddress)}
                </span>
              </span>

              <span className="tape-value font-mono">{formatUsd(trade.usdValue)}</span>

              <span className="tape-maker font-mono truncate">
                {trade.username || formatAddress(trade.userAddress)}
              </span>

              <span className="tape-age font-mono">{formatTimeAgo(trade.timestamp)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
