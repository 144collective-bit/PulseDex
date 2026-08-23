import { Star, TrendingUp, TrendingDown, ArrowUpRight } from 'lucide-react'
import TokenLogo from './TokenLogo'

export default function WatchlistView({
  watchlist = [],
  pairs = [],
  onSelectPair,
  onToggleWatchlist,
}) {
  const watchedPairs = pairs.filter((p) =>
    watchlist.includes(p.pairAddress?.toLowerCase())
  )

  const formatUsd = (num) => {
    const val = parseFloat(num || '0')
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`
    if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`
    return `$${val.toFixed(2)}`
  }

  return (
    <div className="watchlist-container">
      <div className="watchlist-header glass-panel">
        <div className="watchlist-title-box">
          <Star size={18} fill="#fbbf24" color="#fbbf24" />
          <h2 className="watchlist-heading font-mono">Custom Watchlist</h2>
          <span className="watchlist-count font-mono">{watchedPairs.length} pairs tracked</span>
        </div>
      </div>

      {watchedPairs.length === 0 ? (
        <div className="watchlist-empty glass-panel">
          <Star size={36} className="text-muted" />
          <h3 className="empty-title font-mono">Your Watchlist is Empty</h3>
          <p className="empty-desc">
            Star your favorite PulseChain tokens and pairs in the Screener or Markets tab to track them here.
          </p>

          {/* Quick suggestions */}
          <div className="suggestions-box">
            <span className="suggestions-label font-mono">Popular PulseChain Pairs:</span>
            <div className="suggestions-grid">
              {pairs.slice(0, 4).map((p) => (
                <div key={p.pairAddress} className="suggestion-card glass-panel">
                  <div className="sugg-top">
                    <div className="flex items-center gap-2">
                      <TokenLogo
                        symbol={p.baseToken?.symbol}
                        address={p.baseToken?.address}
                        customUrl={p.info?.imageUrl}
                        size={20}
                      />
                      <span className="sugg-symbols font-mono font-semibold">
                        {p.baseToken?.symbol} / {p.quoteToken?.symbol}
                      </span>
                    </div>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => onToggleWatchlist(p.pairAddress)}
                    >
                      <Star size={12} />
                      <span>Track</span>
                    </button>
                  </div>
                  <div className="sugg-price font-mono">
                    ${parseFloat(p.priceUsd || '0') < 0.0001
                      ? parseFloat(p.priceUsd || '0').toFixed(8)
                      : parseFloat(p.priceUsd || '0').toFixed(5)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="watchlist-grid">
          {watchedPairs.map((pair) => {
            const base = pair.baseToken || {}
            const quote = pair.quoteToken || {}
            const priceChange = pair.priceChange?.h24 || 0
            const isPositive = priceChange >= 0

            return (
              <div
                key={pair.pairAddress}
                className="watchlist-card glass-panel"
                onClick={() => onSelectPair(pair)}
              >
                <div className="wl-card-top">
                  <div className="flex items-center gap-2">
                    <TokenLogo
                      symbol={base.symbol}
                      address={base.address}
                      customUrl={pair.info?.imageUrl}
                      size={26}
                    />
                    <div className="wl-pair-title font-mono">
                      <span className="wl-base">{base.symbol}</span>
                      <span className="wl-quote">/{quote.symbol}</span>
                      <span className="wl-dex-pill">{pair.dexId || 'PulseX'}</span>
                    </div>
                  </div>
                  <button
                    className="wl-star-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleWatchlist(pair.pairAddress)
                    }}
                  >
                    <Star size={16} fill="#fbbf24" color="#fbbf24" />
                  </button>
                </div>

                <div className="wl-card-price-row font-mono">
                  <div className="wl-price">
                    ${parseFloat(pair.priceUsd || '0') < 0.0001
                      ? parseFloat(pair.priceUsd || '0').toFixed(8)
                      : parseFloat(pair.priceUsd || '0').toFixed(5)}
                  </div>
                  <div
                    className={`wl-change-badge ${
                      isPositive ? 'badge-green' : 'badge-red'
                    }`}
                  >
                    {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {isPositive ? '+' : ''}{priceChange}%
                  </div>
                </div>

                <div className="wl-card-stats font-mono">
                  <div className="wl-stat-item">
                    <span className="text-muted">24h Vol:</span>
                    <span>{formatUsd(pair.volume?.h24)}</span>
                  </div>
                  <div className="wl-stat-item">
                    <span className="text-muted">Liquidity:</span>
                    <span>{formatUsd(pair.liquidity?.usd)}</span>
                  </div>
                </div>

                <div className="wl-card-bottom">
                  <button className="btn-primary btn-sm full-width">
                    <span>Open Live Screener</span>
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
