import { Crown, Rocket, Lock, Star } from 'lucide-react'
import TrenchTokenLogo from './TrenchTokenLogo'
import { plsToUsd } from '../services/pumptires'
import { formatVelocity, formatEta } from '../hooks/useBondingVelocity'
import { drawdownFromAth } from '../utils/trenchBoard'
import {
  formatUsd,
  formatCryptoPrice,
  formatTimeAgo,
  formatPercent,
} from '../utils/formatters'

/**
 * Below this the drawdown is noise around the high rather than a fall from it.
 * A row printing new highs every few seconds would otherwise flicker a chip.
 */
const ATH_CHIP_THRESHOLD = -8

/** Star that adds a token to the watchlist, shared by both row shapes. */
function WatchStar({ watched, onToggle, symbol }) {
  if (!onToggle) return null

  return (
    <span
      className={`tr-star ${watched ? 'is-on' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={watched}
      aria-label={watched ? `Unstar ${symbol}` : `Star ${symbol}`}
      title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
      /*
       * A span, not a button. The row itself is a <button> and HTML forbids a
       * button inside one - React renders it anyway and the browser closes the
       * outer element early, which broke the row's own click target. The
       * handlers below give it the behaviour a button would have had.
       */
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onToggle()
        }
      }}
    >
      <Star size={12} />
    </span>
  )
}

/**
 * One record on the trenches board.
 *
 * Laid out as a dense three-line row rather than a card: a screener lives or
 * dies on how many rows fit on screen, and every number sits in a fixed column
 * so digits don't shift sideways as the feed ticks.
 */
export default function TrenchTokenCard({
  token,
  plsPrice,
  onSelect,
  variant = 'new',
  rank,
  eager = false,
  velocity,
  watched = false,
  onToggleWatch,
  isNew = false,
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

  const velocityLabel = formatVelocity(velocity?.perMin)
  const etaLabel = formatEta(velocity?.etaMin)

  const drawdown = drawdownFromAth(token)
  const showAth = drawdown !== null && drawdown <= ATH_CHIP_THRESHOLD

  /*
   * The deployer, on the row's tooltip rather than in it.
   *
   * It went on the metadata line first and did not fit at any width the board
   * actually uses: even a 383px column leaves that line about 129px, and age,
   * market cap and volume already need 140. Rather than clip a figure on every
   * row for a name most tokens do not carry, it rides the hover text - and the
   * detail panel behind the row shows it in full.
   */
  const deployer = token.creatorUsername?.trim()
  const rowTitle = deployer
    ? `${token.name} · deployed by ${deployer} - open detail`
    : `${token.name} - open detail`

  return (
    <button
      type="button"
      className={[
        'trench-row',
        isNearGraduation ? 'is-king' : '',
        isGraduated ? 'is-grad' : '',
        watched ? 'is-watched' : '',
        isNew ? 'is-new' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect?.(token)}
      title={rowTitle}
    >
      <span className="tr-rank font-mono">{rank}</span>

      <span className="tr-logo">
        <TrenchTokenLogo
          cid={token.imageCid}
          address={token.address}
          symbol={token.symbol}
          size={42}
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

      {/* Second line spans the full row width, so the meta figures never clip.
          Each figure carries its own class rather than relying on its position,
          so the breakpoints below can drop them in a deliberate order. */}
      <span className="tr-meta font-mono">
        <span className="tr-age">{formatTimeAgo(timestamp)}</span>
        <span className="tr-sep tr-sep-age" aria-hidden="true">·</span>
        <span className="tr-mc">MC {formatUsd(marketCapUsd)}</span>
        <span className="tr-sep tr-sep-vol" aria-hidden="true">·</span>
        <span className="tr-vol">V {formatUsd(token.volumeUsd)}</span>
      </span>

      <span className="tr-side">
        {/* How far off the high, which is the difference between a token still
            running and one that already had its move. */}
        {/* Just the figure and a down caret. Spelling out "ATH" cost about
            24px of a track the metadata line was already short of, and the
            tooltip carries the meaning. */}
        {showAth && (
          <span className="tr-ath font-mono" title="Below its all-time high">
            ▾{Math.abs(Math.round(drawdown))}%
          </span>
        )}

        {changeLabel ? (
          <span className={`tr-change font-mono ${isUp ? 'is-up' : 'is-down'}`}>
            {changeLabel}
          </span>
        ) : (
          <span className="tr-change font-mono is-flat">—</span>
        )}

        {isGraduated && (
          <span className="tr-grad-tag font-mono">
            <Rocket size={9} />
            {/* The word is wrapped so it can drop on its own in the
                Graduations column, where every row is graduated and the icon
                is enough - the width it frees is what stops that column's
                metadata line clipping. */}
            <span className="tr-grad-word">GRAD</span>
            {token.lockedLp && <Lock size={8} className="tr-lock" />}
          </span>
        )}
      </span>

      {/*
        Bonding progress sits on its own line rather than beside the change.
        Sharing that cell it claimed ~81px of a 145px track, which squeezed the
        metadata line into 133px when it needed 190 - so age, market cap and
        volume clipped on every row even at full width. On its own line it also
        gets a bar long enough to read as progress, and room for how fast that
        bar is actually moving.
      */}
      {!isGraduated && (
        <span className="tr-bond">
          <span className={`tr-bond-track heat-${heat}`}>
            <span className="tr-bond-fill" style={{ width: `${Math.max(2, progress)}%` }} />
          </span>
          <span className="tr-bond-pct font-mono">{progress.toFixed(0)}%</span>

          {velocityLabel && (
            <span
              className={`tr-vel font-mono ${velocity.perMin > 0 ? 'is-up' : 'is-down'}`}
              title="Curve movement per minute, measured over the last 10 minutes"
            >
              {velocityLabel}
            </span>
          )}
          {etaLabel && (
            <span className="tr-eta font-mono" title="Estimated time to graduation at the current rate">
              ~{etaLabel}
            </span>
          )}
        </span>
      )}

      <WatchStar
        watched={watched}
        symbol={token.symbol}
        onToggle={onToggleWatch ? () => onToggleWatch(token.address) : null}
      />
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
          size={38}
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
