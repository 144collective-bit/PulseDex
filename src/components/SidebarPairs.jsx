import { useState, useMemo } from 'react'
import {
  Flame,
  Star,
  TrendingUp,
  TrendingDown,
  Zap,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import TokenLogo from './TokenLogo'
import { getCorePulseRank, deduplicatePairs, CORE_PULSE_CONTRACTS } from '../services/dexscreener'
import { formatCryptoPrice, formatUsd } from '../utils/formatters'
import { useWatchlistPairs } from '../hooks/useWatchlistPairs'

export default function SidebarPairs({
  pairs = [],
  currentPair,
  onSelectPair,
  watchlist = [],
  onToggleWatchlist,
  isCollapsed,
  onToggleCollapse,
}) {
  const [tab, setTab] = useState('hot') // 'hot' | 'gainers' | 'losers' | 'volume' | 'watchlist'
  const [search, setSearch] = useState('')
  const [dexFilter, setDexFilter] = useState('all') // 'all' | 'pulsex' | '9mm' | '9inch'

  const { watchlistPairs, isLoading: loadingWatchlist } = useWatchlistPairs(watchlist, pairs)

  const displayedPairs = useMemo(() => {
    let list = [...pairs]

    // Apply DEX filter if specific DEX is selected
    if (dexFilter !== 'all') {
      list = list.filter((p) => {
        const dexId = (p.dexId || '').toLowerCase()
        if (dexFilter === 'pulsex') return dexId.includes('pulsex')
        if (dexFilter === 'libertyswap') return dexId.includes('liberty')
        if (dexFilter === '9mm') return dexId.includes('9mm')
        if (dexFilter === '9inch') return dexId.includes('9inch')
        return true
      })
    }

    // Only deduplicate for Hot/Gainers/Losers to show primary liquidity pool
    if (tab !== 'watchlist') {
      list = deduplicatePairs(list)
    }

    if (tab === 'watchlist') {
      // Starred pairs come from the hook, which fills in anything the board's
      // feed is not currently carrying. Filtering the feed alone silently drops
      // a starred pair as soon as it stops trending.
      list = watchlistPairs
    } else if (tab === 'gainers') {
      list.sort((a, b) => (b.priceChange?.h24 || 0) - (a.priceChange?.h24 || 0))
    } else if (tab === 'losers') {
      list.sort((a, b) => (a.priceChange?.h24 || 0) - (b.priceChange?.h24 || 0))
    } else if (tab === 'volume') {
      list.sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
    } else {
      // Hot: 4 Core PulseChain Tokens strictly at top (WPLS, PLSX, HEX, INC), then by 24h volume
      list.sort((a, b) => {
        const rankA = getCorePulseRank(a)
        const rankB = getCorePulseRank(b)
        if (rankA !== rankB) return rankA - rankB
        return (b.volume?.h24 || 0) - (a.volume?.h24 || 0)
      })
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.baseToken?.symbol?.toLowerCase().includes(q) ||
          p.baseToken?.name?.toLowerCase().includes(q) ||
          p.quoteToken?.symbol?.toLowerCase().includes(q) ||
          p.pairAddress?.toLowerCase().includes(q) ||
          p.baseToken?.address?.toLowerCase().includes(q)
      )
    }

    return list.slice(0, 40)
  }, [pairs, tab, search, dexFilter, watchlistPairs])

  const isCoreAsset = (pair) => {
    return getCorePulseRank(pair) <= 4
  }

  const formatPrice = (val) => {
    return formatCryptoPrice(val)
  }

  const formatVol = (val) => {
    const num = parseFloat(val || '0')
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`
    return `$${num.toFixed(0)}`
  }

  const formatLiq = (val) => {
    const num = parseFloat(val || '0')
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`
    return `$${num.toFixed(0)}`
  }

  const getDexBadgeClass = (dexId = '') => {
    const d = dexId.toLowerCase()
    if (d.includes('pulsex')) return 'dex-badge-pulsex'
    if (d.includes('9mm')) return 'dex-badge-9mm'
    if (d.includes('9inch')) return 'dex-badge-9inch'
    if (d.includes('phux')) return 'dex-badge-phux'
    return 'dex-badge-generic'
  }

  if (isCollapsed) {
    return (
      <aside className="sidebar-pairs-collapsed glass-panel">
        <button
          className="sidebar-expand-btn"
          onClick={onToggleCollapse}
          title="Expand Pairs Sidebar"
        >
          <ChevronRight size={16} />
        </button>
        <div className="sidebar-collapsed-icons">
          <button
            className={`collapsed-icon-btn ${tab === 'hot' ? 'active' : ''}`}
            onClick={() => {
              setTab('hot')
              onToggleCollapse()
            }}
            title="🔥 Hot Pairs"
          >
            <Flame size={16} className="text-pulse-yellow" />
          </button>
          <button
            className={`collapsed-icon-btn ${tab === 'watchlist' ? 'active' : ''}`}
            onClick={() => {
              setTab('watchlist')
              onToggleCollapse()
            }}
            title={`⭐ Watchlist (${watchlist.length})`}
          >
            <Star size={16} fill={watchlist.length > 0 ? '#fbbf24' : 'none'} color="#fbbf24" />
          </button>
          <button
            className={`collapsed-icon-btn ${tab === 'gainers' ? 'active' : ''}`}
            onClick={() => {
              setTab('gainers')
              onToggleCollapse()
            }}
            title="🚀 Top Gainers"
          >
            <TrendingUp size={16} className="text-pulse-green" />
          </button>
          <button
            className={`collapsed-icon-btn ${tab === 'volume' ? 'active' : ''}`}
            onClick={() => {
              setTab('volume')
              onToggleCollapse()
            }}
            title="⚡ High Volume"
          >
            <Zap size={16} className="text-pulse-cyan" />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="sidebar-pairs-container glass-panel">
      {/* Header with Tabs & Collapse Button */}
      <div className="sidebar-header">
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab-btn ${tab === 'hot' ? 'active' : ''}`}
            onClick={() => setTab('hot')}
            title="Hot & Core Ecosystem Assets"
          >
            <Flame size={13} className={tab === 'hot' ? 'text-pulse-yellow' : ''} />
            <span>Hot</span>
          </button>
          <button
            className={`sidebar-tab-btn ${tab === 'gainers' ? 'active' : ''}`}
            onClick={() => setTab('gainers')}
            title="24h Gainers"
          >
            <TrendingUp size={13} className={tab === 'gainers' ? 'text-pulse-green' : ''} />
            <span>Gainers</span>
          </button>
          <button
            className={`sidebar-tab-btn ${tab === 'losers' ? 'active' : ''}`}
            onClick={() => setTab('losers')}
            title="24h Losers"
          >
            <TrendingDown size={13} className={tab === 'losers' ? 'text-pulse-red' : ''} />
            <span>Losers</span>
          </button>
          <button
            className={`sidebar-tab-btn ${tab === 'volume' ? 'active' : ''}`}
            onClick={() => setTab('volume')}
            title="Highest 24h Volume"
          >
            <Zap size={13} className={tab === 'volume' ? 'text-pulse-cyan' : ''} />
            <span>Vol</span>
          </button>
          <button
            className={`sidebar-tab-btn ${tab === 'watchlist' ? 'active' : ''}`}
            onClick={() => setTab('watchlist')}
            title="Pinned Watchlist"
          >
            <Star size={13} fill={tab === 'watchlist' ? '#fbbf24' : 'none'} color={tab === 'watchlist' ? '#fbbf24' : 'currentColor'} />
            <span>({watchlist.length})</span>
          </button>
        </div>
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title="Collapse Sidebar"
        >
          <ChevronLeft size={15} />
        </button>
      </div>

      {/* Mini Search & DEX Filters */}
      <div className="sidebar-controls-section">
        <div className="sidebar-search">
          <Search size={13} className="text-muted" />
          <input
            type="text"
            placeholder="Filter by token or symbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sidebar-search-input font-mono"
          />
          {search && (
            <button
              className="sidebar-search-clear"
              onClick={() => setSearch('')}
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Quick DEX Filter Pills */}
        <div className="sidebar-dex-pills font-mono">
          <button
            className={`sidebar-dex-pill ${dexFilter === 'all' ? 'active' : ''}`}
            onClick={() => setDexFilter('all')}
          >
            All
          </button>
          <button
            className={`sidebar-dex-pill ${dexFilter === 'pulsex' ? 'active' : ''}`}
            onClick={() => setDexFilter('pulsex')}
          >
            PulseX
          </button>
          <button
            className={`sidebar-dex-pill ${dexFilter === 'libertyswap' ? 'active' : ''}`}
            onClick={() => setDexFilter('libertyswap')}
          >
            Liberty
          </button>
          <button
            className={`sidebar-dex-pill ${dexFilter === '9mm' ? 'active' : ''}`}
            onClick={() => setDexFilter('9mm')}
          >
            9mm
          </button>
          <button
            className={`sidebar-dex-pill ${dexFilter === '9inch' ? 'active' : ''}`}
            onClick={() => setDexFilter('9inch')}
          >
            9inch
          </button>
        </div>
      </div>

      {/* Pairs Count Subtitle */}
      <div className="sidebar-sub-header font-mono">
        <span className="text-muted text-xs">
          {displayedPairs.length} {displayedPairs.length === 1 ? 'Pair' : 'Pairs'} Displayed
        </span>
        {tab === 'hot' && <span className="sidebar-core-indicator">✨ Verified PulseX Core</span>}
      </div>

      {/* Pairs List */}
      <div className="sidebar-list font-mono">
        {displayedPairs.length === 0 ? (
          <div className="sidebar-empty">
            {tab === 'watchlist'
              ? 'No watched pairs yet. Star any pair to pin it here!'
              : 'No matching pairs found on PulseChain.'}
          </div>
        ) : (
          displayedPairs.map((p, idx) => {
            const isSelected =
              currentPair?.pairAddress?.toLowerCase() === p.pairAddress?.toLowerCase()
            const base = p.baseToken?.symbol || 'TOKEN'
            const quote = p.quoteToken?.symbol || 'PLS'
            const baseAddr = p.baseToken?.address || ''
            const change = p.priceChange?.h24 || 0
            const isPos = change >= 0
            const isStarred = watchlist.includes(p.pairAddress?.toLowerCase())
            const core = isCoreAsset(p)
            const dexBadgeClass = getDexBadgeClass(p.dexId)

            return (
              <div
                key={p.pairAddress}
                className={`sidebar-pair-item ${isSelected ? 'selected' : ''} ${core ? 'is-core' : ''}`}
                onClick={() => onSelectPair(p)}
                title={`${base}/${quote} on ${p.dexId || 'PulseX'}\n24h Vol: ${formatVol(p.volume?.h24)} | Liq: ${formatLiq(p.liquidity?.usd)}`}
              >
                {/* Left side: Rank + Star + Logo + Pair symbols */}
                <div className="sidebar-pair-left">
                  <span className={`sidebar-rank-num ${idx < 3 && tab === 'hot' ? `rank-top rank-${idx + 1}` : ''}`}>
                    {idx + 1}
                  </span>

                  <button
                    className="sidebar-star-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleWatchlist(p.pairAddress)
                    }}
                    title={isStarred ? 'Remove from Watchlist' : 'Add to Watchlist'}
                  >
                    <Star
                      size={12}
                      fill={isStarred ? '#fbbf24' : 'none'}
                      color={isStarred ? '#fbbf24' : '#64748b'}
                    />
                  </button>

                  <div className="sidebar-logo-wrap">
                    <TokenLogo
                      symbol={base}
                      address={baseAddr}
                      customUrl={p.info?.imageUrl}
                      size={26}
                    />
                    {core && <span className="sidebar-core-sparkle" title="Official PulseChain Core Token">✦</span>}
                  </div>

                  <div className="sidebar-pair-names">
                    <div className="sidebar-pair-title-row">
                      <span className="sidebar-base-sym">{base}</span>
                      <span className="sidebar-quote-sym">/{quote}</span>
                      {core && <span className="sidebar-core-pill">CORE</span>}
                    </div>
                    <div className="sidebar-pair-sub-row">
                      <span className={`sidebar-dex-badge ${dexBadgeClass}`}>
                        {p.dexId || 'PulseX'}
                      </span>
                      <span className="sidebar-liq-meta text-muted">
                        Liq: {formatLiq(p.liquidity?.usd)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side: Price + 24h Change % + 24h Vol */}
                <div className="sidebar-pair-right">
                  <div className="sidebar-pair-price">{formatPrice(p.priceUsd)}</div>
                  <div className="sidebar-pair-meta">
                    <span className={`sidebar-change-badge ${isPos ? 'pos' : 'neg'}`}>
                      {isPos ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                      {Math.abs(change).toFixed(2)}%
                    </span>
                    <span className="sidebar-vol text-muted">{formatVol(p.volume?.h24)}</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
