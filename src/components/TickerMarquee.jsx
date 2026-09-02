import { Flame } from 'lucide-react'
import TokenLogo from './TokenLogo'
import { selectTickerItems } from '../utils/tickerItems'

export default function TickerMarquee({ pairs = [], onSelectPair }) {
  // One entry per token rather than per pool, and what each is called. See
  // `selectTickerItems` - the choice is tested there, not here.
  const tickerItems = selectTickerItems(pairs)
  if (tickerItems.length === 0) return null

  const formatPrice = (val) => {
    const num = parseFloat(val || '0')
    if (num < 0.0001) return `$${num.toFixed(8)}`
    if (num < 1) return `$${num.toFixed(5)}`
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="ticker-marquee-container">
      <div className="ticker-marquee-badge">
        <Flame size={13} className="text-pulse-yellow animate-pulse" />
        <span className="font-mono">TRENDING PULSE</span>
      </div>
      <div className="ticker-marquee-track">
        <div className="ticker-marquee-items">
          {tickerItems.map(({ pair, key, symbol, quote, address, label }) => {
            const change = pair.priceChange?.h24 || 0
            const isPos = change >= 0

            return (
              <div
                key={key}
                className="ticker-item font-mono"
                onClick={() => onSelectPair(pair)}
                title={`Click to view ${symbol}/${quote} chart`}
              >
                <TokenLogo
                  symbol={symbol}
                  address={address}
                  customUrl={pair.info?.imageUrl}
                  size={16}
                />
                <span className="ticker-pair-name">{label}</span>
                <span className="ticker-price">{formatPrice(pair.priceUsd)}</span>
                <span className={`ticker-change ${isPos ? 'text-pulse-green' : 'text-pulse-red'}`}>
                  {isPos ? '+' : ''}{change}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
