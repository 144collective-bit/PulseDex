import { useState, useEffect, useRef } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import {
  Search,
  Flame,
  Wallet,
  TrendingUp,
  PieChart,
  Star,
  ExternalLink,
  ChevronDown,
  LogOut,
  Zap,
  Radio,
} from 'lucide-react'
import { searchPulsePairs, getNativePlsPrice, getPulseGasPrice } from '../services/dexscreener'
import TokenLogo from './TokenLogo'

export default function Navbar({ activeTab, setActiveTab, onSelectPair, watchlistCount = 0 }) {
  const { address, isConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()

  const [plsPrice, setPlsPrice] = useState(0.00001455)
  const [gasPrice, setGasPrice] = useState('150')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [showWalletMenu, setShowWalletMenu] = useState(false)

  const searchRef = useRef(null)

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

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handlePairClick = (pair) => {
    onSelectPair(pair)
    setIsSearchOpen(false)
    setSearchQuery('')
    setActiveTab('screener')
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
            <span className="stat-label">PLS Price:</span>
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
            <span>DexScreener & PulseX Live Feeds</span>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="main-nav">
        <div className="nav-left">
          {/* Logo */}
          <div className="logo-box" onClick={() => setActiveTab('screener')}>
            <div className="logo-image-container">
              <img src="/brand-logo.png" alt="PulseDex" className="brand-logo-img" />
            </div>
            <img src="/PulseDex.png" alt="PulseDex" className="brand-text-img" />
          </div>

          {/* Navigation Tabs */}
          <nav className="nav-tabs">
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
              <Flame size={16} className="text-pulse-amber" />
              <span>Trenches</span>
              <span className="tab-hot-badge font-mono">HOT</span>
            </button>
            <button
              className={`btn-tab ${activeTab === 'markets' ? 'active' : ''}`}
              onClick={() => setActiveTab('markets')}
            >
              <Radio size={16} />
              <span>Markets</span>
            </button>
            <button
              className={`btn-tab ${activeTab === 'portfolio' ? 'active' : ''}`}
              onClick={() => setActiveTab('portfolio')}
            >
              <PieChart size={16} />
              <span>Portfolio</span>
            </button>
            <button
              className={`btn-tab ${activeTab === 'watchlist' ? 'active' : ''}`}
              onClick={() => setActiveTab('watchlist')}
            >
              <Star size={16} />
              <span>Watchlist</span>
              {watchlistCount > 0 && <span className="tab-count-badge">{watchlistCount}</span>}
            </button>
          </nav>
        </div>

        {/* Global Search Bar */}
        <div className="nav-center" ref={searchRef}>
          <div className="search-bar-wrapper">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search PulseChain pair, token symbol or 0x address..."
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

        {/* Right Action / Connect Wallet */}
        <div className="nav-right">
          {isConnected ? (
            <div className="wallet-connected-wrapper">
              <button
                className="btn-secondary wallet-btn"
                onClick={() => setShowWalletMenu(!showWalletMenu)}
              >
                <div className="connected-dot"></div>
                <span className="font-mono">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
                <ChevronDown size={14} />
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
                    <button
                      className="wallet-drop-item text-pulse-red"
                      onClick={() => {
                        disconnect()
                        setShowWalletMenu(false)
                      }}
                    >
                      <LogOut size={15} />
                      <span>Disconnect</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              className="btn-primary"
              onClick={() => {
                const connector = connectors[0]
                if (connector) connect({ connector })
              }}
            >
              <Wallet size={16} />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
