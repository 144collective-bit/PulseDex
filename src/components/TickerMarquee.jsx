import { Flame } from 'lucide-react'
import TokenLogo from './TokenLogo'

export default function TickerMarquee({ pairs = [], onSelectPair }) {
  if (!pairs || pairs.length === 0) return null

  const tickerItems = pairs.slice(0, 14)

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
          {tickerItems.map((p, idx) => {
            const base = p.baseToken?.symbol || 'TOKEN'
            const quote = p.quoteToken?.symbol || 'PLS'
            const baseAddr = p.baseToken?.address || ''
            const change = p.priceChange?.h24 || 0
            const isPos = change >= 0

            return (
              <div
                key={`${p.pairAddress}-${idx}`}
                className="ticker-item font-mono"
                onClick={() => onSelectPair(p)}
                title={`Click to view ${base}/${quote} chart`}
              >
                <TokenLogo
                  symbol={base}
                  address={baseAddr}
                  customUrl={p.info?.imageUrl}
                  size={16}
                />
                <span className="ticker-pair-name">{base}</span>
                <span className="ticker-price">{formatPrice(p.priceUsd)}</span>
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
