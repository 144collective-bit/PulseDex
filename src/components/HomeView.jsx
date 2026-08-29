import { Home, AlertTriangle } from 'lucide-react'
import CoreAssetCard from './CoreAssetCard'
import { useCoreAssets } from '../hooks/useCoreAssets'
import { CORE_ASSETS } from '../config/coreAssets'
import { formatUsd } from '../utils/formatters'
import '../styles/home.css'

/** Placeholder card so the grid holds its shape before data lands. */
function CardSkeleton() {
  return (
    <div className="core-card is-skeleton" aria-hidden="true">
      <div className="cc-head">
        <span className="ccs ccs-logo" />
        <div className="cc-ident">
          <span className="ccs ccs-symbol" />
          <span className="ccs ccs-name" />
        </div>
      </div>
      <span className="ccs ccs-price" />
      <div className="cc-stats">
        <span className="ccs ccs-line" />
        <span className="ccs ccs-line" />
      </div>
      <div className="cc-market">
        <span className="ccs ccs-line" />
        <span className="ccs ccs-line" />
        <span className="ccs ccs-line" />
      </div>
    </div>
  )
}

/**
 * Home board: the core PulseChain assets at a glance.
 *
 * Market figures come from DexScreener; supply and burned are read on-chain,
 * since no market API carries them.
 */
export default function HomeView({ onSelectPairForChart }) {
  const { data: assets, isLoading, isError } = useCoreAssets()
  const rows = assets || []

  // Combined liquidity across the core set, as a header read on the ecosystem.
  const totalLiquidity = rows.reduce((sum, a) => sum + (a.liquidityUsd || 0), 0)
  const totalVolume = rows.reduce((sum, a) => sum + (a.volume24h || 0), 0)

  const openChart = (asset) => {
    if (asset.pair) onSelectPairForChart?.(asset.pair)
  }

  return (
    <div className="home-page">
      <header className="home-head">
        <div className="home-brand">
          <div className="home-badge">
            <Home size={13} className="text-pulse-cyan" />
            <span>CORE ASSETS</span>
          </div>
          <p className="home-sub">
            The backbone of the PulseChain ecosystem, priced live with on-chain supply.
          </p>
        </div>

        {rows.length > 0 && (
          <div className="home-totals font-mono">
            <div className="home-total">
              <span className="home-total-label">Assets</span>
              <span className="home-total-val">{rows.length}</span>
            </div>
            <div className="home-total">
              <span className="home-total-label">24h Volume</span>
              <span className="home-total-val">{formatUsd(totalVolume, 1)}</span>
            </div>
            <div className="home-total">
              <span className="home-total-label">Liquidity</span>
              <span className="home-total-val text-pulse-green">
                {formatUsd(totalLiquidity, 1)}
              </span>
            </div>
          </div>
        )}
      </header>

      {isError && !rows.length && (
        <div className="home-state font-mono">
          <AlertTriangle size={16} />
          <span>Market data unavailable right now.</span>
        </div>
      )}

      <div className="home-grid">
        {isLoading && !rows.length
          ? CORE_ASSETS.map((a) => <CardSkeleton key={a.id} />)
          : rows.map((asset) => (
              <CoreAssetCard key={asset.id} asset={asset} onOpenChart={openChart} />
            ))}
      </div>
    </div>
  )
}
