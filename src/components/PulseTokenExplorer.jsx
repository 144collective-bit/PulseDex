import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search,
  Copy,
  Check,
  ExternalLink,
  Users,
  TrendingUp,
  RefreshCw,
  Layers,
  Sparkles,
  AlertCircle,
  X,
  Plus,
  Flame,
  ShieldCheck,
} from 'lucide-react'
import {
  fetchPulseTokens,
  searchPulseScan,
  fetchTokenHolders,
  formatTokenSupply,
} from '../services/pulsescan'
import TokenLogo from './TokenLogo'

export default function PulseTokenExplorer({ onSelectTokenForChart, onAddCustomToken }) {
  const [tokens, setTokens] = useState([])
  const [nextPageParams, setNextPageParams] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState('')

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isSearchActive, setIsSearchActive] = useState(false)

  // Copy feedback state
  const [copiedAddr, setCopiedAddr] = useState('')

  // Holder distribution modal state
  const [selectedTokenForHolders, setSelectedTokenForHolders] = useState(null)
  const [holdersList, setHoldersList] = useState([])
  const [isLoadingHolders, setIsLoadingHolders] = useState(false)

  const debounceTimerRef = useRef(null)

  // 1. Initial Load of Tokens via PulseScan v2
  const loadInitialTokens = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await fetchPulseTokens(null, 'ERC-20')
      setTokens(response.items || [])
      setNextPageParams(response.next_page_params || null)
      setIsSearchActive(false)
    } catch (err) {
      console.error('Error loading initial tokens:', err)
      setError('Failed to connect to PulseScan v2 API. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInitialTokens()
  }, [loadInitialTokens])

  // 2. Infinite Pagination: Load More using next_page_params
  const handleLoadMore = async () => {
    if (!nextPageParams || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const response = await fetchPulseTokens(nextPageParams, 'ERC-20')
      setTokens((prev) => [...prev, ...(response.items || [])])
      setNextPageParams(response.next_page_params || null)
    } catch (err) {
      console.error('Error loading more tokens:', err)
    } finally {
      setIsLoadingMore(false)
    }
  };

  // 3. Debounced Search across all PRC-20 tokens
  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchQuery(value)

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    if (!value.trim()) {
      loadInitialTokens()
      return
    }

    debounceTimerRef.current = setTimeout(async () => {
      setIsSearching(true)
      setIsSearchActive(true)
      try {
        const searchResults = await searchPulseScan(value)
        setTokens(searchResults)
        setNextPageParams(null) // Search endpoint doesn't return pagination cursor
      } catch (err) {
        console.error('Error during token search:', err)
        setError('Failed to perform search. Please check your network.')
      } finally {
        setIsSearching(false)
      }
    }, 400)
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    loadInitialTokens()
  }

  const handleCopy = (address) => {
    navigator.clipboard.writeText(address)
    setCopiedAddr(address)
    setTimeout(() => setCopiedAddr(''), 2000)
  }

  // 4. Inspect Top Holders for a Token
  const handleInspectHolders = async (token) => {
    setSelectedTokenForHolders(token)
    setIsLoadingHolders(true)
    setHoldersList([])
    try {
      const response = await fetchTokenHolders(token.address)
      setHoldersList(response.items || [])
    } catch (err) {
      console.error('Error fetching holders:', err)
    } finally {
      setIsLoadingHolders(false)
    }
  }

  const formatNumber = (val) => {
    const num = Number(val || 0)
    if (isNaN(num)) return '0'
    return num.toLocaleString()
  }

  const formatPrice = (val) => {
    if (!val) return '—'
    const num = parseFloat(val)
    if (isNaN(num) || num === 0) return '—'
    if (num < 0.000001) return `$${num.toFixed(8)}`
    if (num < 0.01) return `$${num.toFixed(6)}`
    if (num < 1) return `$${num.toFixed(4)}`
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="pulse-token-explorer-container">
      {/* Top Banner / Header */}
      <div className="explorer-header-card glass-panel">
        <div className="explorer-header-left">
          <div className="explorer-title-badge">
            <Sparkles size={16} className="text-pulse-cyan animate-pulse" />
            <span>PulseScan v2 API Live Token Feed</span>
          </div>
          <h2 className="explorer-main-title">PulseChain PRC-20 Token Directory</h2>
          <p className="explorer-desc">
            Browse, search, and audit all tokens, PRC-20 meme coins, and verified contracts directly from the Blockscout-powered PulseScan REST API.
          </p>
        </div>

        <div className="explorer-header-actions">
          <button
            className="btn-secondary refresh-btn"
            onClick={isSearchActive ? handleClearSearch : loadInitialTokens}
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh Tokens</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="explorer-search-bar-wrapper glass-panel">
        <div className="explorer-search-input-box">
          <Search size={18} className="search-icon-dim" />
          <input
            type="text"
            placeholder="Search by token name, ticker symbol (e.g. HEX, PLSX, INC), or 0x contract address..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="explorer-search-input font-mono"
          />
          {isSearching && <div className="search-spinner-sm"></div>}
          {searchQuery && (
            <button className="clear-search-btn" onClick={handleClearSearch}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="explorer-stats-chips font-mono">
          <div className="stat-chip">
            <span className="chip-label">Loaded:</span>
            <span className="chip-value text-pulse-green">{tokens.length} tokens</span>
          </div>
          {nextPageParams && (
            <div className="stat-chip">
              <span className="chip-label">Status:</span>
              <span className="chip-value text-pulse-cyan">More Available</span>
            </div>
          )}
        </div>
      </div>

      {/* Error Notification */}
      {error && (
        <div className="explorer-error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={loadInitialTokens} className="retry-link">Try Again</button>
        </div>
      )}

      {/* Tokens Table View */}
      <div className="explorer-table-card glass-panel">
        <div className="table-responsive">
          <table className="explorer-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Token</th>
                <th>Contract Address</th>
                <th>Decimals</th>
                <th>Holders</th>
                <th>Total Supply</th>
                <th>Price (USD)</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                // Skeleton Rows
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="skeleton-row">
                    <td colSpan={8}>
                      <div className="skeleton-line"></div>
                    </td>
                  </tr>
                ))
              ) : tokens.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty-cell">
                    <div className="empty-state-box">
                      <Layers size={32} className="text-muted" />
                      <p>No tokens matched your search query on PulseScan.</p>
                      <button className="btn-secondary" onClick={handleClearSearch}>
                        Reset Search
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                tokens.map((token, index) => {
                  const isCopied = copiedAddr.toLowerCase() === token.address?.toLowerCase()
                  const formattedSupply = formatTokenSupply(token.total_supply, token.decimals)
                  const tokenName = token.name || 'Unknown Token'
                  const tokenSymbol = token.symbol || '???'

                  return (
                    <tr key={`${token.address}-${index}`} className="explorer-row">
                      <td className="row-index font-mono text-muted">{index + 1}</td>

                      {/* Token Logo & Name */}
                      <td className="token-cell">
                        <div className="token-cell-wrapper">
                          <TokenLogo
                            symbol={tokenSymbol}
                            address={token.address}
                            customUrl={token.icon_url}
                            size={28}
                          />
                          <div className="token-meta">
                            <span className="token-name-text">{tokenName}</span>
                            <div className="token-badge-line">
                              <span className="token-sym-badge font-mono">{tokenSymbol}</span>
                              {token.is_smart_contract_verified && (
                                <span className="verified-chip" title="Verified Contract">
                                  <ShieldCheck size={11} className="text-pulse-green" /> Verified
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contract Address */}
                      <td className="address-cell font-mono">
                        <div className="address-wrapper">
                          <span>{token.address?.slice(0, 6)}...{token.address?.slice(-4)}</span>
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
                        </div>
                      </td>

                      {/* Decimals */}
                      <td className="font-mono text-center">{token.decimals || '18'}</td>

                      {/* Holder Count */}
                      <td className="font-mono font-bold">
                        <div className="holders-cell">
                          <Users size={13} className="text-muted" />
                          <span>{formatNumber(token.holders)}</span>
                        </div>
                      </td>

                      {/* Total Supply */}
                      <td className="font-mono text-muted">
                        {formattedSupply > 0
                          ? formattedSupply >= 1e9
                            ? `${(formattedSupply / 1e9).toFixed(2)}B`
                            : formattedSupply >= 1e6
                            ? `${(formattedSupply / 1e6).toFixed(2)}M`
                            : formattedSupply >= 1e3
                            ? `${(formattedSupply / 1e3).toFixed(1)}K`
                            : formattedSupply.toLocaleString()
                          : '—'}
                      </td>

                      {/* Price */}
                      <td className="font-mono text-pulse-cyan font-bold">
                        {formatPrice(token.exchange_rate)}
                      </td>

                      {/* Actions */}
                      <td className="text-right">
                        <div className="action-buttons-group">
                          <button
                            className="btn-action-sm"
                            onClick={() => handleInspectHolders(token)}
                            title="View Top Holders"
                          >
                            <Users size={13} />
                            <span>Holders</span>
                          </button>

                          {onAddCustomToken && (
                            <button
                              className="btn-action-sm btn-action-add"
                              onClick={() =>
                                onAddCustomToken({
                                  address: token.address,
                                  symbol: tokenSymbol,
                                  name: tokenName,
                                  decimals: Number(token.decimals || 18),
                                })
                              }
                              title="Track in Portfolio"
                            >
                              <Plus size={13} />
                              <span>Track</span>
                            </button>
                          )}

                          {onSelectTokenForChart && (
                            <button
                              className="btn-action-sm btn-action-chart"
                              onClick={() => onSelectTokenForChart(token.address)}
                              title="Open in Screener"
                            >
                              <TrendingUp size={13} />
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

        {/* Load More Pagination Bar */}
        {!isLoading && nextPageParams && !isSearchActive && (
          <div className="table-pagination-bar">
            <button
              className="btn-primary load-more-btn font-mono"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>Fetching Next Page from PulseScan...</span>
                </>
              ) : (
                <>
                  <span>Load More Tokens</span>
                  <Flame size={15} className="text-pulse-yellow" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Top Holders Distribution Modal */}
      {selectedTokenForHolders && (
        <div className="modal-overlay" onClick={() => setSelectedTokenForHolders(null)}>
          <div className="modal-content glass-panel holders-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-left">
                <TokenLogo
                  symbol={selectedTokenForHolders.symbol}
                  address={selectedTokenForHolders.address}
                  size={32}
                />
                <div>
                  <h3 className="holders-modal-title">
                    {selectedTokenForHolders.name} ({selectedTokenForHolders.symbol})
                  </h3>
                  <span className="holders-modal-sub font-mono text-muted">
                    Top Holder Distribution • {formatNumber(selectedTokenForHolders.holders)} total holders
                  </span>
                </div>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedTokenForHolders(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="holders-modal-body">
              {isLoadingHolders ? (
                <div className="holders-loading">
                  <RefreshCw size={24} className="animate-spin text-pulse-green" />
                  <p className="font-mono">Auditing top wallet addresses on PulseScan...</p>
                </div>
              ) : holdersList.length === 0 ? (
                <div className="holders-empty font-mono">
                  <p>No holder records available for this token contract.</p>
                </div>
              ) : (
                <div className="holders-table-wrapper">
                  <table className="holders-table font-mono">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Holder Address</th>
                        <th>Type</th>
                        <th className="text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdersList.map((holder, idx) => {
                        const holderAddr = holder.address?.hash || ''
                        const isContract = holder.address?.is_contract
                        const nameTag = holder.address?.name || holder.address?.implementation_name
                        const rawBal = formatTokenSupply(holder.value, selectedTokenForHolders.decimals)

                        return (
                          <tr key={`${holderAddr}-${idx}`}>
                            <td className="text-muted">#{idx + 1}</td>
                            <td>
                              <div className="holder-addr-box">
                                <span>{holderAddr.slice(0, 8)}...{holderAddr.slice(-6)}</span>
                                <button
                                  className="mini-copy-btn"
                                  onClick={() => handleCopy(holderAddr)}
                                  title="Copy Holder Address"
                                >
                                  {copiedAddr === holderAddr ? <Check size={11} className="text-pulse-green" /> : <Copy size={11} />}
                                </button>
                                <a
                                  href={`https://scan.pulsechain.com/address/${holderAddr}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mini-ext-btn"
                                >
                                  <ExternalLink size={11} />
                                </a>
                              </div>
                            </td>
                            <td>
                              {isContract ? (
                                <span className="badge badge-purple">Contract</span>
                              ) : (
                                <span className="badge badge-green">Wallet</span>
                              )}
                              {nameTag && <span className="nametag-chip">{nameTag}</span>}
                            </td>
                            <td className="text-right font-bold text-white">
                              {rawBal >= 1e9
                                ? `${(rawBal / 1e9).toFixed(3)}B`
                                : rawBal >= 1e6
                                ? `${(rawBal / 1e6).toFixed(3)}M`
                                : rawBal.toLocaleString()}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <a
                href={`https://scan.pulsechain.com/token/${selectedTokenForHolders.address}?tab=holders`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                <span>View All on PulseScan</span>
                <ExternalLink size={14} />
              </a>
              <button
                className="btn-primary"
                onClick={() => setSelectedTokenForHolders(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
