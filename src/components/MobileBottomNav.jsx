import {
  Home,
  TrendingUp,
  Flame,
  Zap,
  Radio,
  PieChart,
} from 'lucide-react'
import { FEATURES } from '../config/features'

export default function MobileBottomNav({
  activeTab,
  setActiveTab,
  watchlistCount = 0,
}) {
  return (
    <nav className="mobile-bottom-nav font-mono">
      <button
        className={`mobile-nav-item ${activeTab === 'home' ? 'active' : ''}`}
        aria-current={activeTab === 'home' ? 'page' : undefined}
        onClick={() => setActiveTab('home')}
      >
        <div className="mobile-nav-icon-wrapper">
          <Home size={22} />
        </div>
        <span className="mobile-nav-label">Home</span>
      </button>

      <button
        className={`mobile-nav-item ${activeTab === 'screener' ? 'active' : ''}`}
        aria-current={activeTab === 'screener' ? 'page' : undefined}
        onClick={() => setActiveTab('screener')}
      >
        <div className="mobile-nav-icon-wrapper">
          <TrendingUp size={22} />
        </div>
        <span className="mobile-nav-label">Screener</span>
      </button>

      <button
        className={`mobile-nav-item ${activeTab === 'trenches' ? 'active' : ''}`}
        aria-current={activeTab === 'trenches' ? 'page' : undefined}
        onClick={() => setActiveTab('trenches')}
      >
        <div className="mobile-nav-icon-wrapper">
          <Flame size={22} />
        </div>
        <span className="mobile-nav-label">Trenches</span>
      </button>

      <button
        className={`mobile-nav-item ${activeTab === 'dex' ? 'active' : ''}`}
        aria-current={activeTab === 'dex' ? 'page' : undefined}
        onClick={() => setActiveTab('dex')}
      >
        <div className="mobile-nav-icon-wrapper">
          <Zap size={22} />
        </div>
        <span className="mobile-nav-label">DEX</span>
      </button>

      {FEATURES.markets && (
        <button
          className={`mobile-nav-item ${activeTab === 'markets' ? 'active' : ''}`}
        aria-current={activeTab === 'markets' ? 'page' : undefined}
          onClick={() => setActiveTab('markets')}
        >
          <div className="mobile-nav-icon-wrapper">
            <Radio size={22} />
          </div>
          <span className="mobile-nav-label">Markets</span>
        </button>
      )}

      <button
        className={`mobile-nav-item ${activeTab === 'portfolio' ? 'active' : ''}`}
        aria-current={activeTab === 'portfolio' ? 'page' : undefined}
        onClick={() => setActiveTab('portfolio')}
      >
        <div className="mobile-nav-icon-wrapper">
          <PieChart size={22} />
          {watchlistCount > 0 && (
            <span className="mobile-badge-count">{watchlistCount}</span>
          )}
        </div>
        <span className="mobile-nav-label">Portfolio</span>
      </button>

    </nav>
  )
}
