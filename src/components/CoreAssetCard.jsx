import { useState } from 'react'
import { BadgeCheck, Copy, Check, LineChart, ArrowUp, ArrowDown } from 'lucide-react'
import TokenLogo from './TokenLogo'
import TokenSparkline from './TokenSparkline'
import {
  formatCryptoPrice,
  formatCompactCount,
  formatUsd,
  formatPercent,
} from '../utils/formatters'

/** Timeframe windows shown in the momentum strip, shortest first. */
const WINDOWS = [
  { key: 'change5m', label: '5M' },
  { key: 'change1h', label: '1H' },
  { key: 'change6h', label: '6H' },
  { key: 'change24h', label: '24H' },
]

/** One figure in the card's stat grid. */
function Stat({ label, value, accent = false }) {
  return (
    <div className="cc-stat">
      <span className="cc-stat-label">{label}</span>
      <span className={`cc-stat-val ${accent ? 'is-accent' : ''}`}>{value}</span>
    </div>
  )
}

/**
 * One core-asset card on the Home board.
 *
 * Reads top to bottom in order of what a holder checks first: identity, then
 * price and its move, then how that move built up across four windows, then the
 * market figures, then the day's order flow. Each block is a separate band so
 * the eye can stop at the level it needs instead of scanning fifteen numbers of
 * equal weight.
 */
export default function CoreAssetCard({ asset, onOpenChart }) {
  const [copied, setCopied] = useState(false)

  const change = asset.change24h
  const changeLabel = formatPercent(change, 2)
  const isUp = change !== null && change >= 0

  // Order flow across the day. Split drives the pressure bar.
  const flowTotal = (asset.buys24h || 0) + (asset.sells24h || 0)
  const buyShare = flowTotal > 0 ? (asset.buys24h / flowTotal) * 100 : null

  // Burned is quoted against supply so the figure has a sense of scale.
  const burnShare =
    asset.burned !== null && asset.supply > 0
      ? (asset.burned / (asset.supply + asset.burned)) * 100
      : null

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(asset.address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable (insecure context or denied) - nothing to undo.
    }
  }

  return (
    <article className={`core-card ${isUp ? 'trend-up' : 'trend-down'}`}>
      {/* Direction accent along the top edge */}
      <span className="cc-accent" aria-hidden="true" />

      <header className="cc-head">
        {/*
          The last 24 hours, behind the identity block.

          Placed here rather than under the price: the header is the one band
          of the card with empty space on its right, so the line gets a run of
          its own without displacing a figure or adding height. It is masked
          out over the logo and symbol and reads at full strength only in the
          gap before the buttons.
        */}
        {asset.pairAddress && (
          <TokenSparkline
            poolAddress={asset.pairAddress}
            tokenAddress={asset.address}
            interval="1h"
            variant="backdrop"
            label={`${asset.symbol} price, last 24 hours`}
          />
        )}

        <span className="cc-logo-wrap">
          <TokenLogo
            symbol={asset.symbol}
            address={asset.address}
            customUrl={asset.logoUrl}
            size={52}
          />
        </span>

        <div className="cc-ident">
          <div className="cc-symbol-row">
            <h3 className="cc-symbol">{asset.symbol}</h3>
            {asset.verified && (
              <BadgeCheck size={14} className="cc-verified" aria-label="Verified asset" />
            )}
          </div>
          <span className="cc-name truncate">
            {asset.name}
            {asset.venue && <span className="cc-venue"> · {asset.venue}</span>}
          </span>
        </div>

        <div className="cc-actions">
          <button
            type="button"
            className="cc-action"
            onClick={copyAddress}
            title={`Copy ${asset.symbol} contract address`}
            aria-label={`Copy ${asset.symbol} contract address`}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button
            type="button"
            className="cc-action"
            onClick={() => onOpenChart?.(asset)}
            title={`Open ${asset.symbol} chart`}
            aria-label={`Open ${asset.symbol} chart`}
          >
            <LineChart size={15} />
          </button>
        </div>
      </header>

      {/* Headline price and the day's move */}
      <div className="cc-price-row">
        <span className="cc-price">{formatCryptoPrice(asset.priceUsd)}</span>
        {changeLabel && (
          <span className={`cc-change-pill ${isUp ? 'is-up' : 'is-down'}`}>
            {isUp ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {changeLabel.replace('+', '').replace('-', '')}
          </span>
        )}
      </div>

      {/* How the move built up, window by window */}
      <div className="cc-momentum">
        {WINDOWS.map(({ key, label }) => {
          const v = asset[key]
          const text = formatPercent(v, 1)
          const tone = text === null ? 'is-flat' : v >= 0 ? 'is-up' : 'is-down'
          return (
            <div key={key} className={`cc-mo ${tone}`}>
              <span className="cc-mo-label">{label}</span>
              <span className="cc-mo-val">{text || '—'}</span>
            </div>
          )
        })}
      </div>

      {/* Market and supply figures */}
      <div className="cc-stats">
        <Stat label="Market Cap" value={asset.marketCap > 0 ? formatUsd(asset.marketCap, 1) : '—'} accent />
        <Stat label="Volume 24h" value={formatUsd(asset.volume24h, 1)} />
        <Stat label="Liquidity" value={formatUsd(asset.liquidityUsd, 1)} />
        <Stat
          label="Supply"
          value={asset.supply === null ? '—' : formatCompactCount(asset.supply)}
        />
        <Stat
          label="Burned"
          value={asset.burned === null ? '—' : formatCompactCount(asset.burned)}
        />
        <Stat
          label="Txns 24h"
          value={flowTotal > 0 ? flowTotal.toLocaleString() : '—'}
        />
      </div>

      {/* Day's order flow, and how much supply has been burned */}
      <footer className="cc-foot">
        {buyShare !== null ? (
          <div className="cc-flow">
            <div className="cc-flow-head">
              <span className="cc-flow-label">Buy / Sell 24h</span>
              <span className="cc-flow-counts">
                <span className="is-up">{asset.buys24h.toLocaleString()}</span>
                <span className="cc-flow-sep">/</span>
                <span className="is-down">{asset.sells24h.toLocaleString()}</span>
              </span>
            </div>
            <span className="cc-flow-track">
              <span className="cc-flow-buy" style={{ width: `${buyShare}%` }} />
            </span>
          </div>
        ) : (
          <div className="cc-flow is-empty">
            <span className="cc-flow-label">No trades recorded in 24h</span>
          </div>
        )}

        {burnShare !== null && burnShare > 0 && (
          <span className="cc-burn-note">
            {burnShare < 0.01 ? '<0.01' : burnShare.toFixed(2)}% of supply burned
          </span>
        )}
      </footer>
    </article>
  )
}
