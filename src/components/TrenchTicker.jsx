import { Flame } from 'lucide-react'
import TrenchTokenLogo from './TrenchTokenLogo'
import { plsToUsd } from '../services/pumptires'
import { formatCryptoPrice, formatPercent } from '../utils/formatters'

/**
 * Scrolling strip of the tokens closest to graduating.
 *
 * Reuses the app's existing ticker chrome so the trenches board reads as part
 * of the same terminal rather than a bolted-on panel.
 */
export default function TrenchTicker({ tokens = [], plsPrice, onSelectToken }) {
  if (!tokens.length) return null

  const items = tokens.slice(0, 14)

  return (
    <div className="ticker-marquee-container trench-ticker">
      <div className="ticker-marquee-badge">
        <Flame size={13} className="text-pulse-yellow animate-pulse" />
        <span className="font-mono">KING OF THE HILL</span>
      </div>

      <div className="ticker-marquee-track">
        <div className="ticker-marquee-items">
          {items.map((token) => {
            const change = token.change5m
            const label = formatPercent(change)
            const isUp = change !== null && change >= 0

            return (
              <div
                key={token.address}
                className="ticker-item font-mono"
                onClick={() => onSelectToken?.(token)}
                title={`${token.name} — ${token.bondingProgress.toFixed(1)}% to graduation`}
              >
                <TrenchTokenLogo
                  cid={token.imageCid}
                  address={token.address}
                  symbol={token.symbol}
                  size={16}
                />
                <span className="ticker-pair-name">{token.symbol}</span>
                <span className="ticker-price">
                  {formatCryptoPrice(plsToUsd(token.pricePls, plsPrice))}
                </span>
                <span className="trench-ticker-progress">
                  {token.bondingProgress.toFixed(0)}%
                </span>
                {label && (
                  <span
                    className={`ticker-change ${isUp ? 'text-pulse-green' : 'text-pulse-red'}`}
                  >
                    {label}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
