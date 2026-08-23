import {
  TrendingUp,
  Flame,
  Radio,
  PieChart,
  Star,
  User,
} from 'lucide-react'
import { useUserProfile } from '../context/UserProfileContext'

export default function MobileBottomNav({
  activeTab,
  setActiveTab,
  watchlistCount = 0,
}) {
  const { openProfileModal, activeAvatarDef, profile } = useUserProfile()

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

      <button
        className="mobile-nav-item mobile-profile-nav-item"
        onClick={openProfileModal}
      >
        <div className="mobile-nav-icon-wrapper">
          <div
            className="mobile-nav-avatar-mini"
            style={{
              background: activeAvatarDef?.bg || 'linear-gradient(135deg, #00ff9d, #0066ff)',
            }}
          >
            {profile.customAvatarUrl ? (
              <img
                src={profile.customAvatarUrl}
                alt={profile.displayName}
                className="mobile-nav-avatar-img"
                onError={(e) => {
                  e.target.style.display = 'none'
                }}
              />
            ) : (
              <span>{activeAvatarDef?.icon || '⚡'}</span>
            )}
          </div>
        </div>
        <span className="mobile-nav-label">Profile</span>
      </button>
    </nav>
  )
}
