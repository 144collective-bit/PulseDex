import { useState } from 'react'
import {
  Star,
  ExternalLink,
  Copy,
  Check,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import TokenLogo from './TokenLogo'
import { formatCryptoPrice, formatUsd } from '../utils/formatters'

export default function PairHeader({ pair, isStarred, onToggleStar }) {
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedPair, setCopiedPair] = useState(false)

  if (!pair) return null

  const base = pair.baseToken || {}
  const quote = pair.quoteToken || {}
  const priceChange = pair.priceChange?.h24 || 0
  const isPositive = priceChange >= 0

  const buys = pair.txns?.h24?.buys || 0
  const sells = pair.txns?.h24?.sells || 0
  const totalTxns = buys + sells
  const buyRatio = totalTxns > 0 ? (buys / totalTxns) * 100 : 50

  const liquidity = parseFloat(pair.liquidity?.usd || '0')
  const volume24 = parseFloat(pair.volume?.h24 || '0')
  const volLiqRatio = liquidity > 0 ? (volume24 / liquidity).toFixed(2) : '0.00'

  const copyAddress = (addr, type) => {
    navigator.clipboard.writeText(addr)
    if (type === 'token') {
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    } else if (type === 'pair') {
      setCopiedPair(true)
      setTimeout(() => setCopiedPair(false), 2000)
    }
  }

  const formatPrice = (val) => {
    return formatCryptoPrice(val)
  }

  return (
    <div className="pair-header-container glass-panel">
      {/* Top Main Identity Row */}
      <div className="pair-main-row">
        {/* Token Identity */}
        <div className="pair-identity">
          <div className="pair-avatar-stack">
            <div className="base-avatar-wrap" title={`${base.symbol || 'Base'} Token`}>
              <TokenLogo
                symbol={base.symbol}
                address={base.address}
                customUrl={pair.info?.imageUrl}
                size={34}
              />
            </div>
            <div className="quote-avatar-wrap" title={`${quote.symbol || 'Quote'} Token`}>
              <TokenLogo
                symbol={quote.symbol}
                address={quote.address}
                size={20}
              />
            </div>
          </div>

          <div className="pair-titles">
            <div className="pair-title-line">
              <h1 className="pair-symbol-text font-mono">
                {base.symbol} <span className="quote-dim">/ {quote.symbol}</span>
              </h1>
              <span className="dex-tag font-mono">{pair.dexId?.toUpperCase() || 'PULSEX'}</span>
              <span className="chain-tag font-mono">PLS 369</span>

              <button
                className={`star-btn ${isStarred ? 'starred' : ''}`}
                onClick={onToggleStar}
                title={isStarred ? 'Remove from Watchlist' : 'Add to Watchlist'}
              >
                <Star
                  size={17}
                  fill={isStarred ? '#fbbf24' : 'none'}
                  color={isStarred ? '#fbbf24' : '#94a3b8'}
                />
              </button>
            </div>

            <div className="pair-subtitle font-mono">
              <span className="token-full-name">{base.name || base.symbol}</span>
              <span className="dot-sep">•</span>
              <span
                className="copy-chip"
                onClick={() => copyAddress(base.address, 'token')}
                title="Copy Token Address"
              >
                <span className="text-muted">Token:</span> {base.address?.slice(0, 5)}...{base.address?.slice(-4)}
                {copiedToken ? <Check size={11} className="text-pulse-green" /> : <Copy size={11} />}
              </span>
              <span className="dot-sep">•</span>
              <span
                className="copy-chip"
                onClick={() => copyAddress(pair.pairAddress, 'pair')}
                title="Copy Pair Pool Address"
              >
                <span className="text-muted">Pair:</span> {pair.pairAddress?.slice(0, 5)}...{pair.pairAddress?.slice(-4)}
                {copiedPair ? <Check size={11} className="text-pulse-green" /> : <Copy size={11} />}
              </span>
              <span className="dot-sep">•</span>
              <a
                href={`https://scan.pulsechain.com/address/${pair.pairAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="external-link"
              >
                PulseScan <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </div>

        {/* Live Price Block */}
        <div className="pair-price-block">
          <div className="price-primary font-mono">
            {formatPrice(pair.priceUsd)}
          </div>
          <div className="price-secondary">
            <span
              className={`change-pill font-mono ${
                isPositive ? 'badge-green' : 'badge-red'
              }`}
            >
              {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {isPositive ? '+' : ''}
              {priceChange}% (24h)
            </span>
            {pair.priceNative && (
              <span className="native-price-tag font-mono">
                {parseFloat(pair.priceNative).toFixed(6)} {quote.symbol}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Pro Metrics Grid */}
      <div className="pair-metrics-grid font-mono">
        <div className="metric-box">
          <span className="metric-label">Liquidity</span>
          <span className="metric-value">{formatUsd(pair.liquidity?.usd)}</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">24h Volume</span>
          <span className="metric-value">{formatUsd(pair.volume?.h24)}</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">FDV</span>
          <span className="metric-value">{formatUsd(pair.fdv)}</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Market Cap</span>
          <span className="metric-value">{formatUsd(pair.marketCap || pair.fdv)}</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Vol / Liq</span>
          <span className="metric-value text-pulse-cyan">{volLiqRatio}x</span>
        </div>

        {/* Interval Changes */}
        <div className="metric-box-intervals">
          <div className="interval-item">
            <span className="interval-tag">5M</span>
            <span className={`interval-val ${(pair.priceChange?.m5 || 0) >= 0 ? 'text-pulse-green' : 'text-pulse-red'}`}>
              {(pair.priceChange?.m5 || 0) >= 0 ? '+' : ''}{pair.priceChange?.m5 || 0}%
            </span>
          </div>
          <div className="interval-item">
            <span className="interval-tag">1H</span>
            <span className={`interval-val ${(pair.priceChange?.h1 || 0) >= 0 ? 'text-pulse-green' : 'text-pulse-red'}`}>
              {(pair.priceChange?.h1 || 0) >= 0 ? '+' : ''}{pair.priceChange?.h1 || 0}%
            </span>
          </div>
          <div className="interval-item">
            <span className="interval-tag">6H</span>
            <span className={`interval-val ${(pair.priceChange?.h6 || 0) >= 0 ? 'text-pulse-green' : 'text-pulse-red'}`}>
              {(pair.priceChange?.h6 || 0) >= 0 ? '+' : ''}{pair.priceChange?.h6 || 0}%
            </span>
          </div>
          <div className="interval-item">
            <span className="interval-tag">24H</span>
            <span className={`interval-val ${priceChange >= 0 ? 'text-pulse-green' : 'text-pulse-red'}`}>
              {priceChange >= 0 ? '+' : ''}{priceChange}%
            </span>
          </div>
        </div>

        {/* Buy/Sell Volume Pressure Bar */}
        <div className="metric-box-pressure">
          <div className="pressure-labels">
            <span className="text-pulse-green">Buys: {buys.toLocaleString()}</span>
            <span className="text-pulse-red">Sells: {sells.toLocaleString()}</span>
          </div>
          <div className="pressure-bar">
            <div className="pressure-fill-buy" style={{ width: `${buyRatio}%` }}></div>
            <div className="pressure-fill-sell" style={{ width: `${100 - buyRatio}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  )
}
