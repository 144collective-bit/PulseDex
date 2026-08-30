import { useState, useEffect, useRef } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import {
  Home,
  Search,
  Flame,
  Wallet,
  TrendingUp,
  PieChart,
  ExternalLink,
  ChevronDown,
  LogOut,
  Zap,
  Radio,
  User,
  EyeOff,
  UserPlus,
  LogIn,
  Sparkles,
} from 'lucide-react'
import { searchPulsePairs, getNativePlsPrice, getPulseGasPrice } from '../services/dexscreener'
import TokenLogo from './TokenLogo'
import { useUserProfile } from '../context/UserProfileContext'
import { useAuth } from '../context/AuthContext'
import { FEATURES } from '../config/features'
export default function Navbar({
  activeTab,
  setActiveTab,
  onSelectPair,
  watchlistCount = 0,
  onOpenWalletModal,
}) {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { profile, activeAvatarDef, openProfileModal, preferences } = useUserProfile()
  const { currentUser, isAuthenticated, openAuthModal, signOut } = useAuth()

  const [plsPrice, setPlsPrice] = useState(0.00001455)
  const [gasPrice, setGasPrice] = useState('150')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [showWalletMenu, setShowWalletMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const [mobileSearchExpanded, setMobileSearchExpanded] = useState(false)

  const searchRef = useRef(null)
  const mobileInputRef = useRef(null)
  const userMenuRef = useRef(null)
  const walletMenuRef = useRef(null)

  // Fetch PLS price & Gas periodically
  useEffect(() => {
    async function loadStats() {
      const price = await getNativePlsPrice()
      const gas = await getPulseGasPrice()
      setPlsPrice(price)
      setGasPrice(gas)
    }
    loadStats()
    const interval = setInterval(loadStats, 15000)
    return () => clearInterval(interval)
  }, [])

  // Handle Search Debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      const results = await searchPulsePairs(searchQuery)
      setSearchResults(results.slice(0, 8))
      setIsSearching(false)
      setIsSearchOpen(true)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Close search and menus on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsSearchOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false)
      }
      if (walletMenuRef.current && !walletMenuRef.current.contains(event.target)) {
        setShowWalletMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handlePairClick = (pair) => {
    onSelectPair(pair)
    setIsSearchOpen(false)
    setSearchQuery('')
    setMobileSearchExpanded(false)
    setActiveTab('screener')
  }

  const openMobileSearch = () => {
    setMobileSearchExpanded(true)
    setTimeout(() => {
      if (mobileInputRef.current) mobileInputRef.current.focus()
    }, 100)
  }

  return (
    <header className="navbar-container">
      {/* Top Banner Ticker */}
      <div className="top-stats-bar">
        <div className="stats-inner">
          <div className="stat-pill">
            <span className="live-dot"></span>
            <span className="stat-label">PulseChain:</span>
            <span className="stat-value text-pulse-green">Mainnet (369)</span>
          </div>

          <div className="stat-pill">
            <span className="stat-label">PLS:</span>
            <span className="stat-value font-mono">
              ${plsPrice < 0.0001 ? plsPrice.toFixed(8) : plsPrice.toFixed(6)}
            </span>
          </div>

          <div className="stat-pill">
            <Flame size={13} className="text-pulse-purple" />
            <span className="stat-label">Gas:</span>
            <span className="stat-value font-mono">{gasPrice} Gwei</span>
          </div>

          <div className="stat-pill banner-dex-tag">
            <Zap size={13} className="text-pulse-cyan" />
            <span>DexScreener & PulseX</span>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="main-nav">
        <div className="nav-left">
          {/* Logo */}
          <div className="logo-box" onClick={() => setActiveTab('screener')}>
            <img src="/brand-logo.png" alt="PulseDex" className="brand-logo-img" />
            <img src="/PulseDex.png" alt="PulseDex" className="brand-text-img" />
          </div>

          {/* Desktop Navigation Tabs (Hidden on mobile <768px, shown in bottom nav) */}
          <nav className="nav-tabs desktop-only-nav">
            <button
              className={`btn-tab ${activeTab === 'home' ? 'active' : ''}`}
              onClick={() => setActiveTab('home')}
            >
              <Home size={16} className="text-pulse-cyan" />
              <span>Home</span>
            </button>
            <button
              className={`btn-tab ${activeTab === 'screener' ? 'active' : ''}`}
              onClick={() => setActiveTab('screener')}
            >
              <TrendingUp size={16} />
              <span>Screener</span>
            </button>
            <button
              className={`btn-tab ${activeTab === 'trenches' ? 'active' : ''}`}
              onClick={() => setActiveTab('trenches')}
            >
              <Flame size={16} className="text-pulse-cyan" />
              <span>Trenches</span>
            </button>
            <button
              className={`btn-tab ${activeTab === 'dex' ? 'active' : ''}`}
              onClick={() => setActiveTab('dex')}
            >
              <Zap size={16} className="text-pulse-green" />
              <span>DEX</span>
            </button>
            {FEATURES.markets && (
              <button
                className={`btn-tab ${activeTab === 'markets' ? 'active' : ''}`}
                onClick={() => setActiveTab('markets')}
              >
                <Radio size={16} />
                <span>Markets</span>
              </button>
            )}
            <button
              className={`btn-tab ${activeTab === 'portfolio' ? 'active' : ''}`}
              onClick={() => setActiveTab('portfolio')}
            >
              <PieChart size={16} />
              <span>Portfolio</span>
            </button>
            {FEATURES.profile && (
              <button
                className={`btn-tab ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => setActiveTab('profile')}
              >
                <User size={16} className="text-pulse-cyan" />
                <span>Profile</span>
              </button>
            )}
          </nav>
        </div>

        {/* Desktop Global Search Bar */}
        <div className="nav-center desktop-search" ref={searchRef}>
          <div className="search-bar-wrapper">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search pair, token or 0x address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setIsSearchOpen(true)
              }}
              className="search-input font-mono"
            />
            {isSearching && <div className="search-spinner"></div>}
          </div>

          {/* Search Results Dropdown */}
          {isSearchOpen && (
            <div className="search-dropdown glass-panel">
              {searchResults.length === 0 ? (
                <div className="search-empty">
                  {isSearching ? 'Scanning PulseChain...' : 'No PulseChain pairs found for query'}
                </div>
              ) : (
                searchResults.map((pair) => {
                  const priceChange = pair.priceChange?.h24 || 0
                  return (
                    <div
                      key={pair.pairAddress}
                      className="search-item"
                      onClick={() => handlePairClick(pair)}
                    >
                      <div className="search-item-left">
                        <TokenLogo
                          symbol={pair.baseToken?.symbol}
                          address={pair.baseToken?.address}
                          customUrl={pair.info?.imageUrl}
                          size={22}
                        />
                        <span className="search-pair-name font-mono">
                          {pair.baseToken?.symbol} <span className="text-muted">/ {pair.quoteToken?.symbol}</span>
                        </span>
                        <span className="search-dex-badge">{pair.dexId}</span>
                      </div>
                      <div className="search-item-right">
                        <span className="search-price font-mono">${pair.priceUsd}</span>
                        <span
                          className={`search-change font-mono ${
                            priceChange >= 0 ? 'text-pulse-green' : 'text-pulse-red'
                          }`}
                        >
                          {priceChange >= 0 ? '+' : ''}
                          {priceChange}%
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Right Action: Mobile Search Trigger + Buy DEX + Auth / Profile */}
        <div className="nav-right">
          {/* Mobile Search Icon Button */}
          <button
            className="mobile-search-trigger-btn btn-icon-round"
            onClick={openMobileSearch}
            title="Search PulseChain Pairs"
          >
            <Search size={16} />
          </button>

          {/* 🚀 Harmonious Glowing "Buy $DEX" Platform Token Button */}
          <button
            type="button"
            className="btn-buy-dex-glow font-mono"
            onClick={() => setActiveTab('token')}
            title="$DEX Platform Token"
          >
            <Zap size={16} className="buy-dex-zap" />
            {/* "DEX" is split out so it can carry the wordmark's gradient,
                matching the DEX half of the PULSEDEX logo. */}
            <span className="buy-dex-text">
              BUY $<span className="buy-dex-word">DEX</span>
            </span>
          </button>

          {FEATURES.auth && (isAuthenticated ? (
            <div className="user-profile-menu-wrapper" ref={userMenuRef}>
              <button
                className="btn-secondary nav-profile-trigger-btn is-authenticated"
                onClick={() => setShowUserMenu(!showUserMenu)}
                title={`User Profile: ${profile.displayName} (@${currentUser?.username || profile.username})`}
              >
                <div
                  className="nav-avatar-mini"
                  style={{
                    background: activeAvatarDef?.bg || 'linear-gradient(135deg, #00ff9d, #0066ff)',
                    boxShadow: `0 0 8px ${activeAvatarDef?.glowColor || '#00ff9d'}88`,
                  }}
                >
                  {profile.customAvatarUrl ? (
                    <img
                      src={profile.customAvatarUrl}
                      alt={profile.displayName}
                      className="nav-avatar-mini-img"
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  ) : (
                    <span className="nav-avatar-mini-icon">{activeAvatarDef?.icon || '⚡'}</span>
                  )}
                </div>
                <div className="nav-profile-name-col desktop-only font-mono">
                  <span className="nav-profile-name">{currentUser?.displayName || profile.displayName}</span>
                  <span className="nav-profile-sub-handle text-muted">@{currentUser?.username || profile.username}</span>
                </div>
                <span className="verified-user-badge" title="Authenticated User">✓</span>
                <ChevronDown size={12} className="text-muted ml-1" />
                {preferences.privacyMode && (
                  <span className="nav-privacy-dot" title="Privacy Mode Active">
                    <EyeOff size={11} className="text-pulse-yellow" />
                  </span>
                )}
              </button>

              {/* Authenticated User Dropdown Menu */}
              {showUserMenu && (
                <div className="user-profile-dropdown glass-panel font-mono">
                  <div className="user-dropdown-header">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs">{currentUser?.displayName || profile.displayName}</span>
                    </div>
                    <span className="text-muted text-xs">@{currentUser?.username || profile.username}</span>
                  </div>

                  <div className="user-dropdown-divider"></div>

                  <button
                    className="user-dropdown-item"
                    onClick={() => {
                      setShowUserMenu(false)
                      openProfileModal()
                    }}
                  >
                    <User size={14} className="text-pulse-cyan" />
                    <span>Profile & DEX Preferences</span>
                  </button>

                  <button
                    className="user-dropdown-item"
                    onClick={() => {
                      setShowUserMenu(false)
                      openAuthModal('signin')
                    }}
                  >
                    <LogIn size={14} className="text-pulse-green" />
                    <span>Switch Account</span>
                  </button>

                  <div className="user-dropdown-divider"></div>

                  <button
                    className="user-dropdown-item text-pulse-red"
                    onClick={() => {
                      setShowUserMenu(false)
                      signOut()
                    }}
                  >
                    <LogOut size={14} />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="btn-guest-signin font-mono"
              onClick={() => openAuthModal('signin')}
              title="Sign In to PulseDex (or Create Account)"
            >
              <LogIn size={13} className="text-pulse-cyan" />
              <span>Sign In</span>
            </button>
          ))}

          {/* Connect Web3 Wallet - Temporarily hidden from UI; underlying functionality preserved */}
          {/*
          {isConnected ? (
            <div className="wallet-connected-wrapper" ref={walletMenuRef}>
              <button
                className="btn-secondary wallet-btn"
                onClick={() => setShowWalletMenu(!showWalletMenu)}
              >
                <div className="connected-dot"></div>
                <span className="font-mono wallet-addr-label">
                  {address?.slice(0, 5)}...{address?.slice(-4)}
                </span>
                <ChevronDown size={13} />
              </button>

              {showWalletMenu && (
                <div className="wallet-dropdown glass-panel">
                  <div className="wallet-drop-header">
                    <span className="wallet-drop-label">Connected Wallet</span>
                    <span className="wallet-drop-addr font-mono">{address}</span>
                  </div>
                  <div className="wallet-drop-actions">
                    <button
                      className="wallet-drop-item"
                      onClick={() => {
                        openProfileModal()
                        setShowWalletMenu(false)
                      }}
                    >
                      <User size={15} className="text-pulse-green" />
                      <span>User Profile & Settings</span>
                    </button>
                    {!isAuthenticated && (
                      <button
                        className="wallet-drop-item text-pulse-cyan"
                        onClick={() => {
                          openAuthModal('signup')
                          setShowWalletMenu(false)
                        }}
                      >
                        <UserPlus size={15} />
                        <span>Sign Up with this Wallet</span>
                      </button>
                    )}
                    <button
                      className="wallet-drop-item"
                      onClick={() => {
                        setActiveTab('portfolio')
                        setShowWalletMenu(false)
                      }}
                    >
                      <PieChart size={15} />
                      <span>View in Portfolio</span>
                    </button>
                    <a
                      href={`https://scan.pulsechain.com/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="wallet-drop-item"
                    >
                      <ExternalLink size={15} />
                      <span>View on PulseScan</span>
                    </a>
                    {isAuthenticated && (
                      <button
                        className="wallet-drop-item text-pulse-yellow"
                        onClick={() => {
                          signOut()
                          setShowWalletMenu(false)
                        }}
                      >
                        <LogOut size={15} />
                        <span>Log Out Account</span>
                      </button>
                    )}
                    <button
                      className="wallet-drop-item text-pulse-red"
                      onClick={() => {
                        disconnect()
                        setShowWalletMenu(false)
                      }}
                    >
                      <LogOut size={15} />
                      <span>Disconnect Wallet</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              className="btn-primary wallet-connect-btn"
              onClick={onOpenWalletModal}
            >
              <Wallet size={15} />
              <span className="wallet-btn-text">Connect</span>
            </button>
          )}
          */}
        </div>
      </div>

      {/* Mobile Fullscreen Search Overlay */}
      {mobileSearchExpanded && (
        <div className="mobile-search-overlay glass-panel">
          <div className="mobile-search-bar-row">
            <div className="search-bar-wrapper flex-1">
              <Search size={16} className="search-icon" />
              <input
                ref={mobileInputRef}
                type="text"
                placeholder="Search token, symbol or 0x..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input font-mono"
              />
              {isSearching && <div className="search-spinner"></div>}
            </div>
            <button
              className="mobile-search-close-btn"
              onClick={() => setMobileSearchExpanded(false)}
            >
              Cancel
            </button>
          </div>

          {/* Results list in mobile overlay */}
          <div className="mobile-search-results">
            {searchResults.length === 0 ? (
              <div className="search-empty">
                {searchQuery.trim()
                  ? isSearching
                    ? 'Searching PulseChain...'
                    : 'No matching tokens found'
                  : 'Type a token symbol (e.g. WPLS, PLSX, HEX, INC) or contract address...'}
              </div>
            ) : (
              searchResults.map((pair) => {
                const priceChange = pair.priceChange?.h24 || 0
                return (
                  <div
                    key={pair.pairAddress}
                    className="mobile-search-item"
                    onClick={() => handlePairClick(pair)}
                  >
                    <div className="search-item-left">
                      <TokenLogo
                        symbol={pair.baseToken?.symbol}
                        address={pair.baseToken?.address}
                        customUrl={pair.info?.imageUrl}
                        size={26}
                      />
                      <div className="mobile-search-names">
                        <span className="search-pair-name font-mono">
                          {pair.baseToken?.symbol}{' '}
                          <span className="text-muted">/ {pair.quoteToken?.symbol}</span>
                        </span>
                        <span className="search-dex-badge">{pair.dexId}</span>
                      </div>
                    </div>
                    <div className="search-item-right text-right">
                      <span className="search-price font-mono">${pair.priceUsd}</span>
                      <span
                        className={`search-change font-mono ${
                          priceChange >= 0 ? 'text-pulse-green' : 'text-pulse-red'
                        }`}
                      >
                        {priceChange >= 0 ? '+' : ''}
                        {priceChange}%
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </header>
  )
}

