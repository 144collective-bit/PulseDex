import { Rocket, AlertTriangle } from 'lucide-react'
import { TrenchMoverRow } from './TrenchTokenCard'
import { useGraduatedMovers } from '../hooks/usePumpTires'

/**
 * Graduated launchpad tokens ranked by live DEX volume.
 *
 * Identity comes from the launchpad; price movement, liquidity and volume come
 * from the token's PulseX pair via DexScreener - after graduation the curve is
 * no longer the price source.
 */
export default function TrenchDexMovers({ onSelectToken }) {
  const { data: movers, isLoading, isError, isFetching } = useGraduatedMovers()
  const rows = movers || []

  return (
    <section className="trench-movers trench-panel">
      <header className="trench-panel-head">
        <div className="tph-title-group">
          <Rocket size={12} className="text-pulse-green" />
          <h2 className="tph-title font-mono">DEX Movers</h2>
          {isFetching && !isLoading && (
            <span className="tph-live" title="Refreshing" aria-hidden="true" />
          )}
        </div>
        <span className="tph-count font-mono">{rows.length}</span>
      </header>

      <div className="trench-col-labels font-mono" aria-hidden="true">
        <span className="tcl-rank">#</span>
        <span className="tcl-ident">PAIR / LIQ · TXNS</span>
        <span className="tcl-num">PRICE / VOL</span>
        <span className="tcl-bond">24H</span>
      </div>

      <div className="trench-panel-scroll">
        {isLoading && (
          <div className="trench-panel-state font-mono">
            <span className="tph-live" aria-hidden="true" />
            <span>Indexing pairs…</span>
          </div>
        )}

        {isError && !rows.length && (
          <div className="trench-panel-state font-mono is-error">
            <AlertTriangle size={15} />
            <span>Pair data unavailable</span>
          </div>
        )}

        {!isLoading && !rows.length && !isError && (
          <div className="trench-panel-state font-mono">
            <span>No graduated pairs indexed</span>
          </div>
        )}

        {rows.map((token, index) => (
          <TrenchMoverRow
            key={token.address}
            token={token}
            rank={index + 1}
            onSelect={onSelectToken}
            eager={index < 8}
          />
        ))}
      </div>
    </section>
  )
}
