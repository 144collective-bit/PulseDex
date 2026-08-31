import { AlertTriangle } from 'lucide-react'
import CoreAssetCard from './CoreAssetCard'
import { useCoreAssets } from '../hooks/useCoreAssets'
import { useCoreAggregateSeries } from '../hooks/useCoreAggregateSeries'
import Sparkline from './Sparkline'
import { CORE_ASSETS } from '../config/coreAssets'
import { formatUsd, formatPercent } from '../utils/formatters'
import '../styles/home.css'
import '../styles/sparkline.css'

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
function SummaryTile({ label, value, tone = '', accent = 'cyan', live = false, series = null }) {
  /*
   * The line follows the figure it sits under: green while the aggregate is
   * above where it started the day, red below. The tiles are the one place a
   * directional tint earns its keep - unlike an asset card, they carry no
   * change pill and no coloured badge, so the line is the only thing saying
   * which way the day went.
   */
  const direction =
    series && series.length > 1
      ? series[series.length - 1] >= series[0]
        ? 'up'
        : 'down'
      : 'accent'

  return (
    <div className={`home-tile accent-${accent}`}>
      {series && (
        <Sparkline
          values={series}
          tone={direction}
          variant="tile"
          showDot={false}
          label={`${label}, last 24 hours`}
        />
      )}

      <span className="home-tile-label">
        {label}
        {live && <span className="home-tile-live" title="Refreshing" aria-hidden="true" />}
      </span>
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

  /*
   * History for the tiles, assembled from the series the cards already fetch -
   * so it costs no extra requests. Liquidity is absent because OHLCV carries
   * no record of pool depth and no free source does.
   */
  const aggregate = useCoreAggregateSeries(rows)

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
        {rows.length > 0 && (
          <div className="home-tiles">
            <SummaryTile
              label="Combined Cap"
              value={formatUsd(totalMarketCap, 1)}
              series={aggregate.marketCap}
              accent="cyan"
            />
            <SummaryTile
              label="24h Volume"
              value={formatUsd(totalVolume, 1)}
              series={aggregate.volume}
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
              series={aggregate.change}
              tone={avgChange === null ? '' : avgUp ? 'is-up' : 'is-down'}
              accent={avgUp ? 'green' : 'red'}
              live={isFetching}
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
