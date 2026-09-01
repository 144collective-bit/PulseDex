import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAccount } from 'wagmi'
import {
  Wallet,
  Plus,
  Trash2,
  RefreshCw,
  PieChart as PieIcon,
  ExternalLink,
  Download,
  Search,
  TrendingUp,
  TrendingDown,
  Compass,
  Copy,
  Check,
  Shield,
  ShieldAlert,
  ArrowUpDown,
  Flame,
  Layers,
  Sparkles,
} from 'lucide-react'
import { fetchWalletPortfolio, fetchTokenMetadata } from '../services/portfolio'
import TokenLogo from './TokenLogo'
import PulseTokenExplorer from './PulseTokenExplorer'
import WalletConnectModal from './WalletConnectModal'
import { useUserProfile } from '../context/UserProfileContext'
import { useSiweAuth } from '../context/SiweAuthContext'
import { readScoped, writeScoped } from '../utils/profileStorage'
import { formatAddress } from '../utils/formatters'

export default function PortfolioView({ onSelectTokenForChart }) {
  const { account } = useSiweAuth()
  const { address: connectedAddress, isConnected } = useAccount()
  const { preferences } = useUserProfile()
  const [subTab, setSubTab] = useState('portfolio') // 'portfolio' | 'explorer'

  // Stored watch wallets: array of { address, label }
  /**
   * Watched addresses, scoped to the signed-in account.
   *
   * Stored under one shared key, the previous visitor's watched wallets were
   * still listed for whoever signed in next on the same browser - the same
   * leak the profile fields had. A watch list says what someone is following,
   * which is not something to hand to the next user of a shared machine.
   */
  const [wallets, setWallets] = useState(() => {
    const saved = readScoped('portfolio_wallets', account, null)
    return Array.isArray(saved) ? saved : []
  })

  // Custom tokens tracked manually: array of { address, symbol, name, decimals }
  const [customTokens, setCustomTokens] = useState(() => {
    try {
      const saved = readScoped('custom_tokens', account, null)
      return Array.isArray(saved) ? saved : []
    } catch {
      return []
    }
  })

  const [activeWalletIndex, setActiveWalletIndex] = useState(0)
  const [newWalletInput, setNewWalletInput] = useState('')
  // Inline rather than alert(): a blocking dialog is suppressed outright in
  // some contexts, which made a rejected address look like a dead button.
  const [walletError, setWalletError] = useState('')
  const [newWalletLabel, setNewWalletLabel] = useState('')
  const [showAddWalletModal, setShowAddWalletModal] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  
  // Dashboard Filter & Search States
  const [tokenSearch, setTokenSearch] = useState('')
  const [filterMode, setFilterMode] = useState('all') // 'all' | 'valued' | 'dust'
  const [hideSpam, setHideSpam] = useState(true)
  const [sortBy, setSortBy] = useState('value') // 'value' | 'balance' | 'change' | 'name'
  const [sortAsc, setSortAsc] = useState(false)

  // Copy feedback state
  const [copiedAddr, setCopiedAddr] = useState('')

  // Custom Token Add Modal State
  const [customTokenInput, setCustomTokenInput] = useState('')
  const [isAddingToken, setIsAddingToken] = useState(false)
  const [customTokenError, setCustomTokenError] = useState('')
  const [showAddTokenModal, setShowAddTokenModal] = useState(false)

  const [portfolioData, setPortfolioData] = useState({
    totalUsd: 0,
    totalPls: 0,
    tokens: [],
  })
  const [isLoading, setIsLoading] = useState(false)

  // Sync connected wallet into list if connected
  useEffect(() => {
    if (isConnected && connectedAddress) {
      setWallets((prev) => {
        const exists = prev.some((w) => w.address.toLowerCase() === connectedAddress.toLowerCase())
        if (!exists) {
          const updated = [{ address: connectedAddress, label: 'Connected Wallet' }, ...prev]
          writeScoped('portfolio_wallets', account, updated)
          return updated
        }
        return prev
      })
    }
  }, [isConnected, connectedAddress, account])

  // Swap to this account's own watch list when the signed-in address changes,
  // so nothing from the previous account stays on screen.
  useEffect(() => {
    const saved = readScoped('portfolio_wallets', account, null)
    setWallets(Array.isArray(saved) ? saved : [])
    setActiveWalletIndex(0)
  }, [account])

  // Save wallets
  const saveWallets = (newWallets) => {
    setWallets(newWallets)
    writeScoped('portfolio_wallets', account, newWallets)
  }

  // Active wallet address to track
  const currentWallet = wallets[activeWalletIndex] || (connectedAddress ? { address: connectedAddress, label: 'Connected' } : null)

  // Fetch portfolio data
  const loadPortfolio = useCallback(async () => {
    if (!currentWallet?.address) return
    setIsLoading(true)
    try {
      const data = await fetchWalletPortfolio(currentWallet.address, customTokens)
      setPortfolioData(data)
    } catch (err) {
      console.error('Failed to load portfolio:', err)
    } finally {
      setIsLoading(false)
    }
  }, [currentWallet?.address, customTokens])

  useEffect(() => {
    loadPortfolio()
  }, [loadPortfolio])

  // Calculate 24h PnL estimate
  const pnl24h = useMemo(() => {
    let totalPnlUsd = 0
    portfolioData.tokens.forEach((t) => {
      if (t.valueUsd > 0 && t.change24h) {
        const changeRatio = t.change24h / 100
        const prevValue = t.valueUsd / (1 + changeRatio)
        totalPnlUsd += (t.valueUsd - prevValue)
      }
    })
    const pnlPct = portfolioData.totalUsd > 0 ? (totalPnlUsd / portfolioData.totalUsd) * 100 : 0
    return { usd: totalPnlUsd, pct: pnlPct }
  }, [portfolioData])

  // Filtered & Sorted Tokens List
  const processedTokens = useMemo(() => {
    let list = [...portfolioData.tokens]

    // Spam Filter
    if (hideSpam) {
      list = list.filter((t) => !t.isSpam)
    }

    // View Filter Modes
    if (filterMode === 'valued') {
      list = list.filter((t) => (t.valueUsd || 0) >= 0.01)
    } else if (filterMode === 'dust') {
      list = list.filter((t) => (t.valueUsd || 0) < 0.01 && (t.balance || 0) > 0)
    }

    // Search Query
    if (tokenSearch.trim()) {
      const q = tokenSearch.toLowerCase()
      list = list.filter(
        (t) =>
          t.symbol?.toLowerCase().includes(q) ||
          t.name?.toLowerCase().includes(q) ||
          t.address?.toLowerCase().includes(q)
      )
    }

    // Sorting
    list.sort((a, b) => {
      let comp = 0
      if (sortBy === 'value') {
        comp = (b.valueUsd || 0) - (a.valueUsd || 0)
      } else if (sortBy === 'balance') {
        comp = (b.balance || 0) - (a.balance || 0)
      } else if (sortBy === 'change') {
        comp = (b.change24h || 0) - (a.change24h || 0)
      } else if (sortBy === 'name') {
        comp = (a.symbol || '').localeCompare(b.symbol || '')
      }
      return sortAsc ? -comp : comp
    })

    return list
  }, [portfolioData.tokens, hideSpam, filterMode, tokenSearch, sortBy, sortAsc])

  const spamCount = useMemo(() => {
    return portfolioData.tokens.filter((t) => t.isSpam).length
  }, [portfolioData.tokens])

  // Export Holdings CSV
  const exportHoldingsCSV = () => {
    const headers = 'Asset,Symbol,Name,ContractAddress,Balance,PriceUSD,TotalValueUSD,24hChangePct,PortfolioPct,IsSpam\n'
    const rows = portfolioData.tokens
      .map(
        (t) =>
          `"${t.symbol}","${t.symbol}","${t.name}","${t.address}","${t.balance}","${t.priceUsd}","${t.valueUsd}","${t.change24h || 0}","${t.portfolioPct?.toFixed(2) || 0}","${t.isSpam ? 'YES' : 'NO'}"`
      )
      .join('\n')
    const blob = new Blob([headers + rows], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pulsechain_portfolio_${currentWallet?.label || 'wallet'}_${Date.now()}.csv`
    a.click()
  }

  // Add Watch-only wallet
  const handleAddWallet = (e) => {
    e.preventDefault()
    const candidate = newWalletInput.trim()

    // Checked as real hex rather than by prefix and length. The old test
    // accepted 0x followed by forty of any character, so a typed address with
    // letters past 'f' was saved as a wallet that could never resolve.
    if (!/^0x[a-fA-F0-9]{40}$/.test(candidate)) {
      setWalletError('That is not a valid PulseChain address. It should be 0x followed by 40 hex characters.')
      return
    }

    if (wallets.some((w) => w.address?.toLowerCase() === candidate.toLowerCase())) {
      setWalletError('You are already tracking that address.')
      return
    }

    const newEntry = {
      address: candidate,
      label: newWalletLabel.trim() || `Wallet ${wallets.length + 1}`,
    }

    const updated = [...wallets, newEntry]
    saveWallets(updated)
    setActiveWalletIndex(updated.length - 1)
    setNewWalletInput('')
    setNewWalletLabel('')
    setWalletError('')
    setShowAddWalletModal(false)
  }

  // Remove Watch-only wallet
  const handleRemoveWallet = (index, e) => {
    e.stopPropagation()
    const updated = wallets.filter((_, i) => i !== index)
    saveWallets(updated)
    if (activeWalletIndex >= updated.length) {
      setActiveWalletIndex(Math.max(0, updated.length - 1))
    }
  }

  // Add Custom Token
  const handleAddCustomToken = async (e) => {
    e.preventDefault()
    setCustomTokenError('')
    let input = customTokenInput.trim()
    const addressMatch = input.match(/0x[a-fA-F0-9]{40}/)
    if (addressMatch) {
      input = addressMatch[0]
    }

    if (!input || !input.startsWith('0x') || input.length !== 42) {
      setCustomTokenError('Please enter a valid 0x contract address or token URL (e.g. plsx.fun)')
      return
    }

    setIsAddingToken(true)
    try {
      const meta = await fetchTokenMetadata(input)
      if (!meta) {
        setCustomTokenError('Could not verify PRC-20 contract on PulseChain')
        return
      }

      const updated = [...customTokens, meta]
      setCustomTokens(updated)
      writeScoped('custom_tokens', account, updated)
      setCustomTokenInput('')
      setShowAddTokenModal(false)
    } catch (err) {
      console.error(err)
      setCustomTokenError('Error querying contract metadata')
    } finally {
      setIsAddingToken(false)
    }
  }

  const handleTrackTokenFromExplorer = (tokenMeta) => {
    if (!tokenMeta || !tokenMeta.address) return
    const exists = customTokens.some((t) => t.address.toLowerCase() === tokenMeta.address.toLowerCase())
    if (!exists) {
      const updated = [...customTokens, tokenMeta]
      setCustomTokens(updated)
      writeScoped('custom_tokens', account, updated)
    }
    setSubTab('portfolio')
  }

  const handleCopy = (text) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedAddr(text)
    setTimeout(() => setCopiedAddr(''), 2000)
  }

  const formatUsd = (val) => {
    if (preferences.privacyMode) return '$••••••'
    const num = parseFloat(val || 0)
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatBalance = (val) => {
    if (preferences.privacyMode) return '••••••'
    const num = Number(val || 0)
    if (num === 0) return '0.00'
    if (num < 0.0001) return num.toFixed(6)
    if (num < 1) return num.toFixed(4)
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }

  return (
    <div className="portfolio-container">
      {/* Top View Switcher Tabs */}
      <div className="portfolio-nav-switcher glass-panel">
        <div className="portfolio-nav-buttons font-mono">
          <button
            className={`btn-portfolio-tab ${subTab === 'portfolio' ? 'active' : ''}`}
            onClick={() => setSubTab('portfolio')}
          >
            <Wallet size={16} />
            <span>My Wallet Portfolio</span>
            <span className="tab-pill-count">{portfolioData.tokens.length}</span>
          </button>

          <button
            className={`btn-portfolio-tab ${subTab === 'explorer' ? 'active' : ''}`}
            onClick={() => setSubTab('explorer')}
          >
            <Compass size={16} className="text-pulse-cyan" />
            <span>PulseScan PRC-20 Explorer</span>
            <span className="live-api-chip">REST v2 API</span>
          </button>
        </div>
      </div>

      {subTab === 'explorer' ? (
        <PulseTokenExplorer
          onSelectTokenForChart={onSelectTokenForChart}
          onAddCustomToken={handleTrackTokenFromExplorer}
        />
      ) : (
        <>
          {/* Wallet Selector Bar */}
          <div className="portfolio-header glass-panel">
            <div className="portfolio-wallets-bar">
              <div className="wallet-chips-list font-mono">
                {wallets.length === 0 ? (
                  <span className="text-muted text-xs">No wallet connected or tracked. Connect wallet or add address.</span>
                ) : (
                  wallets.map((w, idx) => (
                    <div
                      key={w.address}
                      className={`wallet-pill ${activeWalletIndex === idx ? 'active' : ''}`}
                      onClick={() => setActiveWalletIndex(idx)}
                    >
                      <Wallet size={13} className="text-pulse-cyan" />
                      <span className="wallet-pill-label">{w.label}</span>
                      <span className="wallet-pill-addr">
                        ({w.address.slice(0, 4)}...{w.address.slice(-4)})
                      </span>
                      {w.address.toLowerCase() !== connectedAddress?.toLowerCase() && (
                        <button
                          className="pill-del-btn"
                          onClick={(e) => handleRemoveWallet(idx, e)}
                          title="Remove watch wallet"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="wallet-actions">
                {!isConnected && (
                  <button
                    className="btn-primary btn-sm font-mono btn-glow-pulse"
                    onClick={() => setShowConnectModal(true)}
                  >
                    <Wallet size={13} />
                    <span>Connect Wallet</span>
                  </button>
                )}
                <button
                  className="btn-secondary btn-sm font-mono"
                  onClick={() => setShowAddWalletModal(true)}
                >
                  <Plus size={13} />
                  <span>Watch Address</span>
                </button>
                <button
                  className="btn-secondary btn-sm font-mono"
                  onClick={() => setShowAddTokenModal(true)}
                  title="Track Custom ERC-20 Contract"
                >
                  <Layers size={13} />
                  <span>Track Token</span>
                </button>
                <button
                  className="btn-secondary btn-sm font-mono"
                  onClick={loadPortfolio}
                  disabled={isLoading}
                  title="Refresh Balances"
                >
                  <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
                <button
                  className="btn-secondary btn-sm font-mono"
                  onClick={exportHoldingsCSV}
                  title="Export Portfolio CSV"
                >
                  <Download size={13} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>
          </div>

          {/* Add Wallet Modal */}
          {showAddWalletModal && (
            <div className="modal-overlay" onClick={() => { setShowAddWalletModal(false); setWalletError('') }}>
              <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
                <h3 className="modal-title">Track Watch-Only Wallet</h3>
                <p className="modal-desc">
                  Enter any PulseChain address (0x...) to track holdings, transactions, and live valuations.
                </p>
                <form onSubmit={handleAddWallet} className="modal-form font-mono">
                  <input
                    type="text"
                    placeholder="Wallet Label (e.g. Richard Heart Whale, Cold Stash)"
                    value={newWalletLabel}
                    onChange={(e) => setNewWalletLabel(e.target.value)}
                    className="modal-input"
                  />
                  <input
                    type="text"
                    placeholder="0x... (42-character PulseChain address)"
                    value={newWalletInput}
                    onChange={(e) => {
                      setNewWalletInput(e.target.value)
                      if (walletError) setWalletError('')
                    }}
                    className="modal-input"
                    required
                  />
                  {walletError && (
                    <p className="modal-error" role="alert">{walletError}</p>
                  )}

                  <div className="modal-buttons">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => { setShowAddWalletModal(false); setWalletError('') }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary">
                      Track Wallet
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Add Custom Token Modal */}
          {showAddTokenModal && (
            <div className="modal-overlay" onClick={() => setShowAddTokenModal(false)}>
              <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
                <h3 className="modal-title">Track Custom Token Contract</h3>
                <p className="modal-desc">
                  Enter a PulseChain contract address to inspect balances and live valuations.
                </p>
                <form onSubmit={handleAddCustomToken} className="modal-form font-mono">
                  <input
                    type="text"
                    placeholder="0x... Contract Address"
                    value={customTokenInput}
                    onChange={(e) => setCustomTokenInput(e.target.value)}
                    className="modal-input"
                    required
                  />
                  {customTokenError && <span className="text-pulse-red text-xs">{customTokenError}</span>}
                  <div className="modal-buttons">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowAddTokenModal(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary" disabled={isAddingToken}>
                      {isAddingToken ? 'Verifying...' : 'Start Tracking'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Portfolio Pro Dashboard or Clean Empty State */}
          {!currentWallet?.address ? (
            <div className="portfolio-empty-hero glass-panel font-mono">
              <div className="empty-hero-icon-box">
                <Wallet size={40} className="text-pulse-green" />
              </div>
              <h3 className="empty-hero-title">PulseChain Portfolio Tracker</h3>
              <p className="empty-hero-desc">
                Connect your Web3 wallet (Rabby, MetaMask, Internet Money, ZKX) or track any watch-only PulseChain address (0x...) to automatically discover on-chain token holdings, live valuations, and 24h PnL.
              </p>
              <div className="empty-hero-actions">
                <button
                  className="btn-primary font-mono btn-glow-pulse"
                  onClick={() => setShowConnectModal(true)}
                >
                  <Wallet size={15} />
                  <span>Connect Web3 Wallet</span>
                </button>
                <button
                  className="btn-secondary font-mono"
                  onClick={() => setShowAddWalletModal(true)}
                >
                  <Plus size={15} />
                  <span>Watch Pulse Address (0x...)</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Portfolio Pro Overview Grid */}
              <div className="portfolio-stats-grid">
                {/* Net Worth */}
                <div className="portfolio-card glass-panel">
                  <div className="card-top font-mono">
                    <span className="card-title">Total Net Worth</span>
                    <span className="badge badge-pulse">PulseChain Mainnet</span>
                  </div>
                  <div className="net-worth-val font-mono">
                    {isLoading ? '...' : formatUsd(portfolioData.totalUsd)}
                  </div>
                  <div className="net-worth-sub font-mono">
                    <span>≈ {portfolioData.totalPls ? Number(portfolioData.totalPls.toFixed(0)).toLocaleString() : '0'} PLS</span>
                  </div>
                </div>

                {/* 24h PnL Estimate */}
                <div className="portfolio-card glass-panel">
                  <div className="card-top font-mono">
                    <span className="card-title">24h Estimated PnL</span>
                    <span className={`pnl-badge ${pnl24h.usd >= 0 ? 'text-pulse-green' : 'text-pulse-red'}`}>
                      {pnl24h.usd >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      <span>{pnl24h.pct >= 0 ? '+' : ''}{pnl24h.pct.toFixed(2)}%</span>
                    </span>
                  </div>
                  <div className={`net-worth-val font-mono ${pnl24h.usd >= 0 ? 'text-pulse-green' : 'text-pulse-red'}`}>
                    {pnl24h.usd >= 0 ? '+' : ''}{formatUsd(pnl24h.usd)}
                  </div>
                  <div className="net-worth-sub font-mono text-muted">
                    <span>Weighted 24h market variance</span>
                  </div>
                </div>

                {/* Total Assets Discovered */}
                <div className="portfolio-card glass-panel">
                  <div className="card-top font-mono">
                    <span className="card-title">Discovered Tokens</span>
                    <span className="badge badge-cyan">Auto On-Chain</span>
                  </div>
                  <div className="net-worth-val font-mono">
                    {portfolioData.tokens.length} <span className="text-sm font-normal text-muted">assets</span>
                  </div>
                  <div className="net-worth-sub font-mono">
                    <span className="text-pulse-green">
                      {portfolioData.tokens.filter((t) => t.valueUsd > 0.01).length} with active liquidity
                    </span>
                  </div>
                </div>
              </div>

              {/* Sleek Animated Asset Allocation Breakdown */}
              {portfolioData.tokens.length > 0 && portfolioData.totalUsd > 0 && (
                <div className="portfolio-allocation-card glass-panel">
                  <div className="allocation-header font-mono">
                    <div className="alloc-title">
                      <div className="alloc-icon-badge">
                        <PieIcon size={15} className="text-pulse-cyan animate-pulse" />
                      </div>
                      <span className="alloc-main-heading">Portfolio Allocation Matrix</span>
                      <span className="alloc-total-chip">
                        {portfolioData.tokens.filter((t) => t.portfolioPct > 0.1).length} active assets
                      </span>
                    </div>
                    <div className="alloc-header-right">
                      <span className="alloc-top-val-label">
                        Dominant: <strong className="text-pulse-green">{portfolioData.tokens[0]?.symbol || 'PLS'} ({portfolioData.tokens[0]?.portfolioPct?.toFixed(1) || '0'}%)</strong>
                      </span>
                    </div>
                  </div>

                  {/* Glowing Multi-Segment Progress Bar */}
                  <div className="allocation-bar-wrapper">
                    <div className="allocation-bar-glow-bg"></div>
                    <div className="allocation-bar-track">
                      {portfolioData.tokens.slice(0, 8).map((token, idx) => {
                        if (token.portfolioPct <= 0) return null
                        const colors = [
                          { hex: '#00ff9d', name: 'green' },
                          { hex: '#00e5ff', name: 'cyan' },
                          { hex: '#d946ef', name: 'pink' },
                          { hex: '#fbbf24', name: 'yellow' },
                          { hex: '#a855f7', name: 'purple' },
                          { hex: '#60a5fa', name: 'blue' },
                          { hex: '#f43f5e', name: 'coral' },
                          { hex: '#34d399', name: 'emerald' },
                        ]
                        const colorObj = colors[idx % colors.length]
                        const widthPct = Math.max(token.portfolioPct, 2)
                        return (
                          <div
                            key={`bar-${token.address}-${idx}`}
                            className="allocation-segment"
                            style={{
                              width: `${widthPct}%`,
                              backgroundColor: colorObj.hex,
                              boxShadow: `0 0 10px ${colorObj.hex}66`,
                            }}
                            title={`${token.symbol}: ${token.portfolioPct.toFixed(1)}% (${formatUsd(token.valueUsd)})`}
                          >
                            <span className="segment-pulse-shimmer"></span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Asset Allocation Interactive Cards Grid */}
                  <div className="allocation-cards-grid font-mono">
                    {portfolioData.tokens.slice(0, 6).map((t, i) => {
                      if ((t.portfolioPct || 0) < 0.1 && i >= 4) return null
                      const colors = ['#00ff9d', '#00e5ff', '#d946ef', '#fbbf24', '#a855f7', '#60a5fa']
                      const color = colors[i % colors.length]
                      return (
                        <div
                          key={`card-${t.symbol}-${i}`}
                          className="alloc-token-card"
                          style={{ '--accent-color': color }}
                        >
                          <div className="alloc-card-top">
                            <div className="alloc-card-token">
                              <TokenLogo
                                symbol={t.symbol}
                                address={t.address}
                                customUrl={t.logo}
                                size={22}
                              />
                              <div className="alloc-card-names">
                                <span className="alloc-sym">{t.symbol}</span>
                                <span className="alloc-name text-muted">{t.name}</span>
                              </div>
                            </div>
                            <span
                              className="alloc-pct-badge"
                              style={{
                                color: color,
                                backgroundColor: `${color}18`,
                                borderColor: `${color}40`,
                              }}
                            >
                              {t.portfolioPct.toFixed(1)}%
                            </span>
                          </div>

                          <div className="alloc-card-bottom">
                            <span className="alloc-card-val text-white font-bold">
                              {formatUsd(t.valueUsd)}
                            </span>
                            <div className="alloc-card-mini-bar">
                              <div
                                className="alloc-card-fill"
                                style={{
                                  width: `${Math.min(100, t.portfolioPct)}%`,
                                  backgroundColor: color,
                                  boxShadow: `0 0 6px ${color}88`,
                                }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Dashboard Controls: Search, View Filter Modes, Spam Toggle */}
              <div className="portfolio-filter-toolbar glass-panel">
                <div className="filter-search-box">
                  <Search size={14} className="text-muted" />
                  <input
                    type="text"
                    placeholder="Filter by token name, ticker symbol, or contract address..."
                    value={tokenSearch}
                    onChange={(e) => setTokenSearch(e.target.value)}
                    className="filter-search-input font-mono"
                  />
                  {tokenSearch && (
                    <button className="filter-clear-btn" onClick={() => setTokenSearch('')}>
                      ✕
                    </button>
                  )}
                </div>

                <div className="filter-pills-row font-mono">
                  <button
                    className={`filter-pill-btn ${filterMode === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterMode('all')}
                  >
                    All Tokens ({portfolioData.tokens.length})
                  </button>
                  <button
                    className={`filter-pill-btn ${filterMode === 'valued' ? 'active' : ''}`}
                    onClick={() => setFilterMode('valued')}
                  >
                    Valued (&gt; $0.01)
                  </button>
                  <button
                    className={`filter-pill-btn ${filterMode === 'dust' ? 'active' : ''}`}
                    onClick={() => setFilterMode('dust')}
                  >
                    Dust / Unlisted
                  </button>

                  <button
                    className={`filter-pill-btn spam-toggle-btn ${hideSpam ? 'active' : ''}`}
                    onClick={() => setHideSpam(!hideSpam)}
                    title="Filter known scam and phishing airdrop tokens"
                  >
                    {hideSpam ? <Shield size={13} className="text-pulse-green" /> : <ShieldAlert size={13} className="text-pulse-red" />}
                    <span>{hideSpam ? 'Spam Hidden' : 'Showing All (Inc. Spam)'}</span>
                    {spamCount > 0 && <span className="spam-badge">{spamCount}</span>}
                  </button>
                </div>
              </div>

              {/* Holdings Table */}
              <div className="holdings-table-card glass-panel">
                <div className="table-responsive">
                  <table className="holdings-table font-mono">
                    <thead>
                      <tr>
                        <th onClick={() => { setSortBy('name'); setSortAsc(!sortAsc) }} className="cursor-pointer">
                          <div className="th-flex">
                            <span>Asset</span>
                            <ArrowUpDown size={12} />
                          </div>
                        </th>
                        <th onClick={() => { setSortBy('balance'); setSortAsc(!sortAsc) }} className="cursor-pointer">
                          <div className="th-flex">
                            <span>Balance</span>
                            <ArrowUpDown size={12} />
                          </div>
                        </th>
                        <th>Price (USD)</th>
                        <th onClick={() => { setSortBy('value'); setSortAsc(!sortAsc) }} className="cursor-pointer">
                          <div className="th-flex">
                            <span>Total Value</span>
                            <ArrowUpDown size={12} />
                          </div>
                        </th>
                        <th onClick={() => { setSortBy('change'); setSortAsc(!sortAsc) }} className="cursor-pointer">
                          <div className="th-flex">
                            <span>24h Change</span>
                            <ArrowUpDown size={12} />
                          </div>
                        </th>
                        <th>Portfolio %</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr>
                          <td colSpan="7" className="text-center py-8">
                            <div className="flex items-center justify-center gap-2">
                              <RefreshCw size={18} className="animate-spin text-pulse-cyan" />
                              <span>Scanning PulseChain on-chain balances...</span>
                            </div>
                          </td>
                        </tr>
                      ) : processedTokens.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="text-center py-8 text-muted">
                            {tokenSearch ? 'No matching tokens found' : 'No PRC-20 token holdings found for this wallet address.'}
                          </td>
                        </tr>
                      ) : (
                        processedTokens.map((token) => {
                          const isCopied = copiedAddr === token.address
                          return (
                            <tr key={token.address} className={token.isSpam ? 'row-spam' : ''}>
                              {/* Asset Cell */}
                              <td>
                                <div className="holding-token-cell">
                                  <TokenLogo
                                    symbol={token.symbol}
                                    address={token.address}
                                    customUrl={token.logo}
                                    size={28}
                                  />
                                  <div className="holding-names">
                                    <div className="flex items-center gap-1.5">
                                      <span className="holding-sym font-bold">{token.symbol}</span>
                                      {/* Same ticker, different contract, different
                                          price. The name does not separate them
                                          either - the forked and bridged DAI are both
                                          "Dai Stablecoin" - so the address does. */}
                                      {token.ambiguousSymbol && token.address && (
                                        <span className="dup-sym-tag" title={token.address}>
                                          {formatAddress(token.address)}
                                        </span>
                                      )}
                                      {token.isCustom && <span className="custom-tag">Custom</span>}
                                      {token.isSpam && <span className="spam-tag">Unverified</span>}
                                    </div>
                                    <span className="holding-name text-muted text-xs">{token.name}</span>
                                  </div>
                                </div>
                              </td>

                              {/* Balance */}
                              <td>
                                <span className="font-semibold">{formatBalance(token.balance)}</span>
                              </td>

                              {/* Price */}
                              <td>
                                <span>{token.priceUsd > 0 ? `$${token.priceUsd.toFixed(6)}` : '$0.00'}</span>
                              </td>

                              {/* Total Value */}
                              <td>
                                <span className="text-white font-bold">{formatUsd(token.valueUsd)}</span>
                              </td>

                              {/* 24h Change */}
                              <td>
                                <span
                                  className={`pnl-val font-semibold ${
                                    (token.change24h || 0) >= 0 ? 'text-pulse-green' : 'text-pulse-red'
                                  }`}
                                >
                                  {(token.change24h || 0) >= 0 ? '+' : ''}
                                  {token.change24h ? token.change24h.toFixed(2) : '0.00'}%
                                </span>
                              </td>

                              {/* Portfolio % */}
                              <td>
                                {token.portfolioPct ? token.portfolioPct.toFixed(2) : '0.00'}%
                              </td>

                              {/* Actions */}
                              <td className="text-right">
                                <div className="holding-actions-cell">
                                  {token.address !== '0xNativePLS' && (
                                    <>
                                      <button
                                        className="mini-copy-btn"
                                        onClick={() => handleCopy(token.address)}
                                        title="Copy Contract Address"
                                      >
                                        {isCopied ? <Check size={12} className="text-pulse-green" /> : <Copy size={12} />}
                                      </button>
                                      <a
                                        href={`https://scan.pulsechain.com/token/${token.address}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mini-ext-btn"
                                        title="View on PulseScan"
                                      >
                                        <ExternalLink size={12} />
                                      </a>
                                    </>
                                  )}

                                  {onSelectTokenForChart && (
                                    <button
                                      className="btn-action-sm btn-action-chart"
                                      onClick={() => onSelectTokenForChart(token.address)}
                                      title="View Chart"
                                    >
                                      <TrendingUp size={12} />
                                      <span>Chart</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Secure Wallet Connect Modal */}
      <WalletConnectModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
      />
    </div>
  )
}

