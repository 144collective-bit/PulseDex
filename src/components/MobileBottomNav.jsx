import {
  TrendingUp,
  Flame,
  Radio,
  PieChart,
  Star,
} from 'lucide-react'

export default function MobileBottomNav({
  activeTab,
  setActiveTab,
  watchlistCount = 0,
}) {
  return (
    <nav className="mobile-bottom-nav font-mono">
      <button
        className={`mobile-nav-item ${activeTab === 'screener' ? 'active' : ''}`}
        onClick={() => setActiveTab('screener')}
      >
        <div className="mobile-nav-icon-wrapper">
          <TrendingUp size={18} />
        </div>
        <span className="mobile-nav-label">Screener</span>
      </button>

      <button
        className={`mobile-nav-item ${activeTab === 'trenches' ? 'active' : ''}`}
        onClick={() => setActiveTab('trenches')}
      >
        <div className="mobile-nav-icon-wrapper">
          <Flame size={18} className="text-pulse-amber" />
          <span className="mobile-hot-dot"></span>
        </div>
        <span className="mobile-nav-label">Trenches</span>
      </button>

      <button
        className={`mobile-nav-item ${activeTab === 'markets' ? 'active' : ''}`}
        onClick={() => setActiveTab('markets')}
      >
        <div className="mobile-nav-icon-wrapper">
          <Radio size={18} />
        </div>
        <span className="mobile-nav-label">Markets</span>
      </button>

      <button
        className={`mobile-nav-item ${activeTab === 'portfolio' ? 'active' : ''}`}
        onClick={() => setActiveTab('portfolio')}
      >
        <div className="mobile-nav-icon-wrapper">
          <PieChart size={18} />
        </div>
        <span className="mobile-nav-label">Portfolio</span>
      </button>

      <button
        className={`mobile-nav-item ${activeTab === 'watchlist' ? 'active' : ''}`}
        onClick={() => setActiveTab('watchlist')}
      >
        <div className="mobile-nav-icon-wrapper">
          <Star size={18} fill={watchlistCount > 0 ? '#fbbf24' : 'none'} color={watchlistCount > 0 ? '#fbbf24' : 'currentColor'} />
          {watchlistCount > 0 && (
            <span className="mobile-badge-count">{watchlistCount}</span>
          )}
        </div>
        <span className="mobile-nav-label">Watchlist</span>
      </button>
    </nav>
  )
}
