import { useState } from 'react'
import { BadgeCheck, Copy, Check, LineChart } from 'lucide-react'
import TokenLogo from './TokenLogo'
import {
  formatCryptoPrice,
  formatCompactCount,
  formatUsd,
  formatPercent,
} from '../utils/formatters'

/**
 * One core-asset card on the Home board.
 *
 * Three tiers of figure: headline price and 24h move, then supply against the
 * amount burned out of it, then the market row. Values that aren't available
 * render an em dash rather than a misleading zero.
 */
export default function CoreAssetCard({ asset, onOpenChart }) {
  const [copied, setCopied] = useState(false)

  const changeLabel = formatPercent(asset.change24h, 2)
  const isUp = asset.change24h !== null && asset.change24h >= 0

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
    <article className="core-card">
      <header className="cc-head">
        <TokenLogo
          symbol={asset.symbol}
          address={asset.address}
          customUrl={asset.logoUrl}
          size={44}
        />

        <div className="cc-ident">
          <div className="cc-symbol-row">
            <h3 className="cc-symbol">{asset.symbol}</h3>
            {asset.verified && (
              <BadgeCheck size={15} className="cc-verified" aria-label="Verified asset" />
            )}
          </div>
          <span className="cc-name truncate">{asset.name}</span>
        </div>

        <div className="cc-actions">
          <button
            type="button"
            className="cc-action"
            onClick={copyAddress}
            title={`Copy ${asset.symbol} contract address`}
            aria-label={`Copy ${asset.symbol} contract address`}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <button
            type="button"
            className="cc-action"
            onClick={() => onOpenChart?.(asset)}
            title={`Open ${asset.symbol} chart`}
            aria-label={`Open ${asset.symbol} chart`}
          >
            <LineChart size={16} />
          </button>
        </div>
      </header>

      <div className="cc-price-row">
        <span className="cc-price">{formatCryptoPrice(asset.priceUsd)}</span>
        {changeLabel && (
          <span className={`cc-change ${isUp ? 'is-up' : 'is-down'}`}>{changeLabel}</span>
        )}
      </div>

      <div className="cc-stats">
        <div className="cc-stat">
          <span className="cc-stat-label">Supply</span>
          <span className="cc-stat-val">
            {asset.supply === null ? '—' : formatCompactCount(asset.supply)}
          </span>
        </div>
        <div className="cc-stat align-right">
          <span className="cc-stat-label">Burned</span>
          <span className="cc-stat-val">
            {asset.burned === null ? '—' : formatCompactCount(asset.burned)}
          </span>
        </div>
      </div>

      <div className="cc-market">
        <div className="cc-stat">
          <span className="cc-stat-label">M.Cap</span>
          {/* Market cap drops the currency symbol, matching the reference layout */}
          <span className="cc-stat-val">
            {asset.marketCap > 0 ? formatCompactCount(asset.marketCap, 1) : '—'}
          </span>
        </div>
        <div className="cc-stat align-center">
          <span className="cc-stat-label">Volume</span>
          <span className="cc-stat-val">{formatUsd(asset.volume24h, 1)}</span>
        </div>
        <div className="cc-stat align-right">
          <span className="cc-stat-label">Liquidity</span>
          <span className="cc-stat-val">{formatUsd(asset.liquidityUsd, 1)}</span>
        </div>
      </div>
    </article>
  )
}
