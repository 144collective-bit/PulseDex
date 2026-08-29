import { AlertTriangle } from 'lucide-react'
import CoreAssetCard from './CoreAssetCard'
import { useCoreAssets } from '../hooks/useCoreAssets'
import { CORE_ASSETS } from '../config/coreAssets'
import { formatUsd, formatPercent } from '../utils/formatters'
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
      <div className="cc-momentum">
        {[0, 1, 2, 3].map((i) => <span key={i} className="ccs ccs-mo" />)}
      </div>
      <div className="cc-stats">
        {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="ccs ccs-line" />)}
      </div>
      <span className="ccs ccs-foot" />
    </div>
  )
}

/**
 * One aggregate figure in the page header.
 *
 * Built as its own glass panel rather than a cell in a strip, so the summary
 * row belongs to the same family as the asset cards below it.
 */
function SummaryTile({ label, value, tone = '', accent = 'cyan' }) {
  return (
    <div className={`home-tile accent-${accent}`}>
      <span className="home-tile-label">{label}</span>
      <span className={`home-tile-val ${tone}`}>{value}</span>
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
  const { data: assets, isLoading, isError, isFetching } = useCoreAssets()
  const rows = assets || []

  const totalLiquidity = rows.reduce((sum, a) => sum + (a.liquidityUsd || 0), 0)
  const totalVolume = rows.reduce((sum, a) => sum + (a.volume24h || 0), 0)
  const totalMarketCap = rows.reduce((sum, a) => sum + (a.marketCap || 0), 0)

  // Aggregate move, weighted by market cap - a plain average would let the
  // smallest asset swing the headline as hard as PLS.
  const weighted = rows.reduce(
    (acc, a) => {
      if (a.change24h === null || !(a.marketCap > 0)) return acc
      return { sum: acc.sum + a.change24h * a.marketCap, cap: acc.cap + a.marketCap }
    },
    { sum: 0, cap: 0 }
  )
  const avgChange = weighted.cap > 0 ? weighted.sum / weighted.cap : null
  const avgUp = avgChange !== null && avgChange >= 0

  const openChart = (asset) => {
    if (asset.pair) onSelectPairForChart?.(asset.pair)
  }

  return (
    <div className="home-page">
      <header className="home-head">
        <div className="home-title-block">
          <div className="home-eyebrow">
            <span className={`home-pulse ${isFetching ? 'is-live' : ''}`} aria-hidden="true" />
            <span>PULSECHAIN · CORE ASSETS</span>
          </div>
          <h1 className="home-title">Market Overview</h1>
          <p className="home-sub">
            The backbone of the ecosystem — priced live, with supply read straight
            from the chain.
          </p>
        </div>

        {rows.length > 0 && (
          <div className="home-tiles">
            <SummaryTile
              label="Combined Cap"
              value={formatUsd(totalMarketCap, 1)}
              accent="cyan"
            />
            <SummaryTile
              label="24h Volume"
              value={formatUsd(totalVolume, 1)}
              accent="purple"
            />
            <SummaryTile
              label="Liquidity"
              value={formatUsd(totalLiquidity, 1)}
              accent="blue"
            />
            <SummaryTile
              label="Avg 24h"
              value={formatPercent(avgChange, 2) || '—'}
              tone={avgChange === null ? '' : avgUp ? 'is-up' : 'is-down'}
              accent={avgUp ? 'green' : 'red'}
            />
          </div>
        )}
      </header>

      {isError && !rows.length && (
        <div className="home-state">
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
