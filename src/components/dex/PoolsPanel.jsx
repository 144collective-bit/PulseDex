import { Droplets, Plus, Info } from 'lucide-react'
import TokenLogo from '../TokenLogo'
import { formatUsd } from '../../utils/formatters'

/**
 * Pools tab.
 *
 * Shows the live PulseX pools we already index, so the section is useful before
 * liquidity provision is wired. Adding and removing liquidity needs the same
 * signing flow the swap does, so those controls are inert for now rather than
 * pretending to work.
 */
export default function PoolsPanel({ pairs = [], isLoading, onSelectPair }) {
  const pools = pairs.slice(0, 12)

  return (
    <section className="pools-panel">
      <header className="pools-head">
        <div className="pools-title">
          <Droplets size={15} className="text-pulse-cyan" />
          <h3>Liquidity pools</h3>
        </div>
        <button type="button" className="pools-add" disabled>
          <Plus size={13} />
          Add liquidity
        </button>
      </header>

      <div className="pools-note">
        <Info size={13} />
        <span>
          Pool data is live. Adding and removing liquidity needs a signing flow,
          which is not enabled yet.
        </span>
      </div>

      <div className="pools-labels">
        <span>Pool</span>
        <span className="tcl-right">Liquidity</span>
        <span className="tcl-right">24h volume</span>
        <span className="tcl-right">24h fees</span>
      </div>

      <div className="pools-list">
        {isLoading && !pools.length && (
          <p className="pools-empty">Loading pools…</p>
        )}

        {pools.map((p) => {
          const liq = parseFloat(p.liquidity?.usd || 0)
          const vol = parseFloat(p.volume?.h24 || 0)
          // PulseX charges 0.29% per swap, of which LPs receive 0.22%.
          const lpFees = vol * 0.0022

          return (
            <button
              key={p.pairAddress}
              type="button"
              className="pool-row"
              onClick={() => onSelectPair?.(p)}
            >
              <span className="pool-ident">
                <TokenLogo
                  symbol={p.baseToken?.symbol}
                  address={p.baseToken?.address}
                  customUrl={p.info?.imageUrl}
                  size={30}
                />
                <span className="pool-names">
                  <span className="pool-pair">
                    {p.baseToken?.symbol} / {p.quoteToken?.symbol}
                  </span>
                  <span className="pool-dex">{p.dexId}</span>
                </span>
              </span>

              <span className="tcl-right pool-fig">{formatUsd(liq, 1)}</span>
              <span className="tcl-right pool-fig">{formatUsd(vol, 1)}</span>
              <span className="tcl-right pool-fig is-accent">{formatUsd(lpFees, 1)}</span>
            </button>
          )
        })}

        {!isLoading && !pools.length && (
          <p className="pools-empty">No pools indexed right now.</p>
        )}
      </div>
    </section>
  )
}
