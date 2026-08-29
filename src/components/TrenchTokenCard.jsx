import { Crown, Rocket, Lock } from 'lucide-react'
import TrenchTokenLogo from './TrenchTokenLogo'
import { plsToUsd } from '../services/pumptires'
import {
  formatUsd,
  formatCryptoPrice,
  formatTimeAgo,
  formatPercent,
} from '../utils/formatters'

/**
 * One record on the trenches board.
 *
 * Laid out as a dense two-line row rather than a card: a screener lives or dies
 * on how many rows fit on screen, and every number sits in a fixed column so
 * digits don't shift sideways as the feed ticks.
 */
export default function TrenchTokenCard({
  token,
  plsPrice,
  onSelect,
  variant = 'new',
  rank,
  eager = false,
}) {
  if (!token) return null

  const marketCapUsd = plsToUsd(token.marketValuePls, plsPrice)
  const priceUsd = plsToUsd(token.pricePls, plsPrice)
  const change = token.change5m
  const changeLabel = formatPercent(change)
  const isUp = change !== null && change >= 0

  const progress = token.bondingProgress || 0
  const isGraduated = token.isLaunched
  // The launchpad crowns whichever token is closest to graduating.
  const isNearGraduation = !isGraduated && progress >= 90

  const timestamp = variant === 'grad' ? token.launchedAt : token.createdAt

  // Heat band for the bonding bar - the closer to graduation, the hotter.
  const heat = progress >= 90 ? 'hot' : progress >= 60 ? 'warm' : 'cool'

  return (
    <button
      type="button"
      className={`trench-row ${isNearGraduation ? 'is-king' : ''} ${isGraduated ? 'is-grad' : ''}`}
      onClick={() => onSelect?.(token)}
      title={`${token.name} - open detail`}
    >
      <span className="tr-rank font-mono">{rank}</span>

      <span className="tr-logo">
        <TrenchTokenLogo
          cid={token.imageCid}
          address={token.address}
          symbol={token.symbol}
          size={34}
          eager={eager}
        />
        {isNearGraduation && (
          <span className="tr-crown" aria-hidden="true">
            <Crown size={9} />
          </span>
        )}
      </span>

      <span className="tr-ident">
        <span className="tr-symbol font-mono">{token.symbol}</span>
        <span className="tr-name truncate">{token.name}</span>
      </span>

      <span className="tr-price-cell font-mono">
        {/* Remounting on a price change replays the tick flash. A token with no
            prior print has no direction to show, so it flashes neutral. */}
        <span
          key={token.pricePls}
          className={`tr-price ${change === null ? '' : isUp ? 'tick-up' : 'tick-down'}`}
        >
          {formatCryptoPrice(priceUsd)}
        </span>
      </span>

      {/* Second line spans the full row width, so the meta figures never clip */}
      <span className="tr-meta font-mono">
        <span className="tr-age">{formatTimeAgo(timestamp)}</span>
        <span className="tr-sep" aria-hidden="true">·</span>
        <span>MC {formatUsd(marketCapUsd)}</span>
        <span className="tr-sep" aria-hidden="true">·</span>
        <span>V {formatUsd(token.volumeUsd)}</span>
      </span>

      <span className="tr-side">
        {changeLabel ? (
          <span className={`tr-change font-mono ${isUp ? 'is-up' : 'is-down'}`}>
            {changeLabel}
          </span>
        ) : (
          <span className="tr-change font-mono is-flat">—</span>
        )}

        {isGraduated ? (
          <span className="tr-grad-tag font-mono">
            <Rocket size={9} />
            GRAD
            {token.lockedLp && <Lock size={8} className="tr-lock" />}
          </span>
        ) : (
          <span className="tr-bond">
            <span className={`tr-bond-track heat-${heat}`}>
              <span className="tr-bond-fill" style={{ width: `${Math.max(2, progress)}%` }} />
            </span>
            <span className="tr-bond-pct font-mono">{progress.toFixed(0)}%</span>
          </span>
        )}
      </span>
    </button>
  )
}

/**
 * Row for the graduated-movers panel, where price action comes from the PulseX
 * pair rather than the curve.
 */
export function TrenchMoverRow({ token, onSelect, rank, eager = false }) {
  if (!token) return null

  const change24h = token.change24h
  const changeLabel = formatPercent(change24h)
  const isUp = change24h !== null && change24h >= 0

  return (
    <button
      type="button"
      className="trench-row is-mover"
      onClick={() => onSelect?.(token)}
      title={`${token.name} - open detail`}
    >
      <span className="tr-rank font-mono">{rank}</span>

      <span className="tr-logo">
        <TrenchTokenLogo
          cid={token.imageCid}
          address={token.address}
          symbol={token.symbol}
          fallbackUrl={token.pair?.info?.imageUrl}
          size={30}
          eager={eager}
        />
      </span>

      <span className="tr-ident">
        <span className="tr-symbol font-mono">{token.symbol}</span>
      </span>

      <span className="tr-price-cell font-mono">
        <span className="tr-price">{formatCryptoPrice(token.priceUsd)}</span>
      </span>

      <span className="tr-meta font-mono">
        <span>LIQ {formatUsd(token.liquidityUsd)}</span>
        <span className="tr-sep" aria-hidden="true">·</span>
        <span>V {formatUsd(token.volume24h)}</span>
        <span className="tr-sep" aria-hidden="true">·</span>
        <span>{token.txns24h.toLocaleString()} tx</span>
      </span>

      <span className="tr-side">
        <span className={`tr-change-chip font-mono ${isUp ? 'is-up' : 'is-down'}`}>
          {changeLabel || '—'}
        </span>
      </span>
    </button>
  )
}
