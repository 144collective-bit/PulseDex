import { useState } from 'react'
import { Wallet, Star } from 'lucide-react'
import PortfolioView from './PortfolioView'
import WatchlistView from './WatchlistView'
import '../styles/portfolio-section.css'

/**
 * Portfolio section: holdings and watchlist under one tab.
 *
 * The watchlist used to occupy its own slot in the nav even though it is the
 * same job as the portfolio - tracking assets you care about - so it now sits
 * beside holdings here and the nav is one item shorter.
 */
export default function PortfolioSection({
  watchlist,
  pairs,
  onSelectPair,
  onToggleWatchlist,
}) {
  const [section, setSection] = useState('holdings')

  return (
    <div className="pf-section">
      <header className="pf-head">
        <div className="pf-title-block">
          <div className="pf-eyebrow">
            <span className="pf-dot" aria-hidden="true" />
            <span>YOUR ASSETS</span>
          </div>
          <h1 className="pf-title">Portfolio</h1>
          <p className="pf-sub">
            Wallet holdings and the pairs you are tracking, in one place.
          </p>
        </div>

        <div className="pf-switch" role="tablist" aria-label="Portfolio sections">
          <button
            type="button"
            role="tab"
            aria-selected={section === 'holdings'}
            className={`pf-switch-btn ${section === 'holdings' ? 'active' : ''}`}
            onClick={() => setSection('holdings')}
          >
            <Wallet size={15} />
            <span>Holdings</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'watchlist'}
            className={`pf-switch-btn ${section === 'watchlist' ? 'active' : ''}`}
            onClick={() => setSection('watchlist')}
          >
            <Star size={15} />
            <span>Watchlist</span>
            {watchlist.length > 0 && (
              <span className="pf-switch-count">{watchlist.length}</span>
            )}
          </button>
        </div>
      </header>

      <div className="pf-body">
        {section === 'holdings' ? (
          <PortfolioView onSelectTokenForChart={onSelectPair} />
        ) : (
          <WatchlistView
            watchlist={watchlist}
            pairs={pairs}
            onSelectPair={onSelectPair}
            onToggleWatchlist={onToggleWatchlist}
          />
        )}
      </div>
    </div>
  )
}
