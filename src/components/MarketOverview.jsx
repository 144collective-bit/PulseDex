import { useState, useMemo } from 'react'
import {
  Flame,
  TrendingUp,
  TrendingDown,
  Droplets,
  Zap,
  Star,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Coins,
  Copy,
  Check,
  Layers,
  ExternalLink,
  X,
  ArrowRight,
} from 'lucide-react'
import TokenLogo from './TokenLogo'

export default function MarketOverview({
  pairs = [],
  isLoading = false,
  onSelectPair,
  watchlist = [],
  onToggleWatchlist,
}) {
  const [activeCategory, setActiveCategory] = useState('trending') // 'trending' | 'gainers' | 'losers' | 'volume' | 'liquidity' | 'bluechips' | 'watchlist'
  const [searchFilter, setSearchFilter] = useState('')
  const [dexFilter, setDexFilter] = useState('all') // 'all' | 'pulsex' | '9mm' | '9inch' | 'phux'
  const [quoteFilter, setQuoteFilter] = useState('all') // 'all' | 'wpls' | 'dai' | 'usdc' | 'hex' | 'inc'
  const [minLiquidity, setMinLiquidity] = useState(0)
  const [sortField, setSortField] = useState('volume') // 'volume' | 'liquidity' | 'price' | 'change24' | 'change1' | 'change5m' | 'txns'
  const [sortDirection, setSortDirection] = useState('desc') // 'asc' | 'desc'
  const [copiedAddr, setCopiedAddr] = useState('')
  const [activePoolsModalToken, setActivePoolsModalToken] = useState(null)

  const handleCopy = (e, text) => {
    e.stopPropagation()
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedAddr(text)
    setTimeout(() => setCopiedAddr(''), 2000)
  }

  // Handle column header click for sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  // Deduplicate pairs so that each token only appears ONCE in the markets list
  // Group all liquidity pools for any token with multiple pools
  const uniqueTokenMarkets = useMemo(() => {
    const tokenMap = new Map()

    pairs.forEach((p) => {
      const baseAddr = p.baseToken?.address?.toLowerCase()
      const baseSym = (p.baseToken?.symbol || '').toUpperCase()
      const key = baseAddr || baseSym

      if (!key) return

      if (!tokenMap.has(key)) {
        tokenMap.set(key, {
          primaryPair: p,
          allPools: [p],
        })
      } else {
        const item = tokenMap.get(key)
        item.allPools.push(p)
        // Set the pool with the largest liquidity as the primary display representative
        const currentLiq = parseFloat(p.liquidity?.usd || 0)
        const maxLiq = parseFloat(item.primaryPair.liquidity?.usd || 0)
        if (currentLiq > maxLiq) {
          item.primaryPair = p
        }
      }
    })

    return Array.from(tokenMap.values()).map(({ primaryPair, allPools }) => ({
      ...primaryPair,
      allPools,
      poolCount: allPools.length,
    }))
  }, [pairs])

  // Global Market Stats computed from unique tokens
  const marketStats = useMemo(() => {
    let totalVolume = 0
    let totalLiquidity = 0
    let topGainer = null
    let topVolumePair = null

    uniqueTokenMarkets.forEach((p) => {
      const vol = parseFloat(p.volume?.h24 || 0)
      const liq = parseFloat(p.liquidity?.usd || 0)
      const chg = parseFloat(p.priceChange?.h24 || 0)

      totalVolume += vol
      totalLiquidity += liq

      if (!topGainer || chg > parseFloat(topGainer.priceChange?.h24 || 0)) {
        if (liq > 5000) {
          topGainer = p
        }
      }

      if (!topVolumePair || vol > parseFloat(topVolumePair.volume?.h24 || 0)) {
        topVolumePair = p
      }
    })

    return {
      totalVolume,
      totalLiquidity,
      topGainer: topGainer || uniqueTokenMarkets[0],
      topVolumePair: topVolumePair || uniqueTokenMarkets[0],
      uniqueTokenCount: uniqueTokenMarkets.length,
      totalPoolCount: pairs.length,
    }
  }, [uniqueTokenMarkets, pairs])

  // Filter and sort deduplicated tokens
  const processedTokens = useMemo(() => {
    let list = [...uniqueTokenMarkets]

    // 1. Text filter
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase()
      list = list.filter(
        (p) =>
          p.baseToken?.symbol?.toLowerCase().includes(q) ||
          p.baseToken?.name?.toLowerCase().includes(q) ||
          p.quoteToken?.symbol?.toLowerCase().includes(q) ||
          p.pairAddress?.toLowerCase().includes(q) ||
          p.baseToken?.address?.toLowerCase().includes(q)
      )
    }

    // 2. DEX filter
    if (dexFilter !== 'all') {
      list = list.filter((p) => (p.dexId || '').toLowerCase().includes(dexFilter.toLowerCase()))
    }

    // 3. Quote Token filter
    if (quoteFilter !== 'all') {
      list = list.filter((p) => (p.quoteToken?.symbol || '').toLowerCase().includes(quoteFilter.toLowerCase()))
    }

    // 4. Min Liquidity filter
    if (minLiquidity > 0) {
      list = list.filter((p) => parseFloat(p.liquidity?.usd || 0) >= minLiquidity)
    }

    // 5. Category filter
    if (activeCategory === 'gainers') {
      list = list.filter((p) => (p.priceChange?.h24 || 0) > 0)
    } else if (activeCategory === 'losers') {
      list = list.filter((p) => (p.priceChange?.h24 || 0) < 0)
    } else if (activeCategory === 'liquidity') {
      list = list.filter((p) => parseFloat(p.liquidity?.usd || 0) >= 50000)
    } else if (activeCategory === 'bluechips') {
      const bluechips = ['wpls', 'pls', 'hex', 'plsx', 'inc', 'dai', 'usdc', 'usdt', 'hdrn']
      list = list.filter((p) =>
        bluechips.includes(p.baseToken?.symbol?.toLowerCase())
      )
    } else if (activeCategory === 'watchlist') {
      list = list.filter((p) => watchlist.includes(p.pairAddress?.toLowerCase()))
    }

    // 6. Custom Column Sorting
    list.sort((a, b) => {
      let valA = 0
      let valB = 0

      switch (sortField) {
        case 'volume':
          valA = parseFloat(a.volume?.h24 || 0)
          valB = parseFloat(b.volume?.h24 || 0)
          break
        case 'liquidity':
          valA = parseFloat(a.liquidity?.usd || 0)
          valB = parseFloat(b.liquidity?.usd || 0)
          break
        case 'price':
          valA = parseFloat(a.priceUsd || 0)
          valB = parseFloat(b.priceUsd || 0)
          break
        case 'change24':
          valA = parseFloat(a.priceChange?.h24 || 0)
          valB = parseFloat(b.priceChange?.h24 || 0)
          break
        case 'change1':
          valA = parseFloat(a.priceChange?.h1 || 0)
          valB = parseFloat(b.priceChange?.h1 || 0)
          break
        case 'change5m':
          valA = parseFloat(a.priceChange?.m5 || 0)
          valB = parseFloat(b.priceChange?.m5 || 0)
          break
        case 'txns':
          valA = (a.txns?.h24?.buys || 0) + (a.txns?.h24?.sells || 0)
          valB = (b.txns?.h24?.buys || 0) + (b.txns?.h24?.sells || 0)
          break
        case 'name':
          return sortDirection === 'desc'
            ? (b.baseToken?.symbol || '').localeCompare(a.baseToken?.symbol || '')
            : (a.baseToken?.symbol || '').localeCompare(b.baseToken?.symbol || '')
        default:
          valA = parseFloat(a.volume?.h24 || 0)
          valB = parseFloat(b.volume?.h24 || 0)
      }

      return sortDirection === 'desc' ? valB - valA : valA - valB
    })

    return list
  }, [uniqueTokenMarkets, activeCategory, searchFilter, dexFilter, quoteFilter, minLiquidity, sortField, sortDirection, watchlist])

  const exportCSV = () => {
    const headers = 'Rank,TokenSymbol,TokenName,BaseContract,PrimaryPair,PrimaryDEX,PriceUSD,5mChangePct,1hChangePct,24hChangePct,24hVolumeUSD,LiquidityUSD,TotalPools\n'
    const rows = processedTokens
      .map(
        (p, idx) =>
          `"${idx + 1}","${p.baseToken?.symbol}","${p.baseToken?.name}","${p.baseToken?.address}","${p.baseToken?.symbol}/${p.quoteToken?.symbol}","${p.dexId}","${p.priceUsd}","${p.priceChange?.m5 || 0}","${p.priceChange?.h1 || 0}","${p.priceChange?.h24 || 0}","${p.volume?.h24 || 0}","${p.liquidity?.usd || 0}","${p.poolCount || 1}"`
      )
      .join('\n')
    const blob = new Blob([headers + rows], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pulsechain_unique_tokens_${Date.now()}.csv`
    a.click()
  }

  const formatUsd = (num) => {
    const val = parseFloat(num || '0')
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`
    if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`
    return `$${val.toFixed(2)}`
  }

  const formatPrice = (val) => {
    const p = parseFloat(val || '0')
    if (p === 0) return '$0.00'
    if (p < 0.000001) return `$${p.toFixed(8)}`
    if (p < 0.01) return `$${p.toFixed(6)}`
    if (p < 1) return `$${p.toFixed(4)}`
    return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const renderSortIcon = (field) => {
    if (sortField !== field) return <ArrowUpDown size={11} className="text-muted opacity-40 ml-1" />
    return sortDirection === 'desc' ? (
      <ArrowDown size={11} className="text-pulse-green ml-1" />
    ) : (
      <ArrowUp size={11} className="text-pulse-green ml-1" />
    )
  }

  return (
    <div className="markets-container">
      {/* Top Hero Ecosystem Overview Cards */}
      <div className="markets-hero-grid">
        {/* 24h DEX Volume Card */}
        <div className="market-hero-card glass-panel glow-cyan">
          <div className="hero-card-header font-mono">
            <div className="hero-card-icon bg-cyan">
              <Zap size={16} className="text-pulse-cyan" />
            </div>
            <span className="hero-card-title">24h PulseChain Volume</span>
            <span className="badge badge-pulse">DEX Screener</span>
          </div>
          <div className="hero-card-val font-mono">
            {formatUsd(marketStats.totalVolume)}
          </div>
          <div className="hero-card-sub font-mono">
            <span className="text-muted">Aggregated across all verified tokens</span>
          </div>
        </div>

        {/* Top 24h Gainer Card */}
        {marketStats.topGainer && (
          <div
            className="market-hero-card glass-panel glow-green cursor-pointer"
            onClick={() => onSelectPair(marketStats.topGainer)}
            title="Click to view pair chart"
          >
            <div className="hero-card-header font-mono">
              <div className="hero-card-icon bg-green">
                <TrendingUp size={16} className="text-pulse-green" />
              </div>
              <span className="hero-card-title">Top 24h Gainer</span>
              <span className="badge badge-green">
                +{(marketStats.topGainer.priceChange?.h24 || 0).toFixed(1)}%
              </span>
            </div>
            <div className="hero-card-token-line font-mono">
              <TokenLogo
                symbol={marketStats.topGainer.baseToken?.symbol}
                address={marketStats.topGainer.baseToken?.address}
                customUrl={marketStats.topGainer.info?.imageUrl}
                size={24}
              />
              <span className="hero-token-sym">{marketStats.topGainer.baseToken?.symbol}</span>
              <span className="hero-token-price font-bold text-pulse-green">
                {formatPrice(marketStats.topGainer.priceUsd)}
              </span>
            </div>
            <div className="hero-card-sub font-mono">
              <span className="text-muted">Liq: {formatUsd(marketStats.topGainer.liquidity?.usd)}</span>
              <span className="text-pulse-cyan text-xs">View Chart →</span>
            </div>
          </div>
        )}

        {/* Volume Leader Card */}
        {marketStats.topVolumePair && (
          <div
            className="market-hero-card glass-panel glow-yellow cursor-pointer"
            onClick={() => onSelectPair(marketStats.topVolumePair)}
            title="Click to view pair chart"
          >
            <div className="hero-card-header font-mono">
              <div className="hero-card-icon bg-yellow">
                <Flame size={16} className="text-pulse-yellow" />
              </div>
              <span className="hero-card-title">Volume Leader</span>
              <span className="badge badge-cyan">{marketStats.topVolumePair.dexId || 'PulseX'}</span>
            </div>
            <div className="hero-card-token-line font-mono">
              <TokenLogo
                symbol={marketStats.topVolumePair.baseToken?.symbol}
                address={marketStats.topVolumePair.baseToken?.address}
                customUrl={marketStats.topVolumePair.info?.imageUrl}
                size={24}
              />
              <span className="hero-token-sym">{marketStats.topVolumePair.baseToken?.symbol}</span>
              <span className="hero-token-price font-bold text-white">
                {formatUsd(marketStats.topVolumePair.volume?.h24)}
              </span>
            </div>
            <div className="hero-card-sub font-mono">
              <span className="text-muted">Price: {formatPrice(marketStats.topVolumePair.priceUsd)}</span>
              <span className="text-pulse-cyan text-xs">View Chart →</span>
            </div>
          </div>
        )}

        {/* Ecosystem Pool Depth Card */}
        <div className="market-hero-card glass-panel glow-purple">
          <div className="hero-card-header font-mono">
            <div className="hero-card-icon bg-purple">
              <Droplets size={16} className="text-pulse-purple" />
            </div>
            <span className="hero-card-title">Tracked Tokens</span>
            <span className="badge badge-purple">{marketStats.uniqueTokenCount} Tokens ({marketStats.totalPoolCount} Pools)</span>
          </div>
          <div className="hero-card-val font-mono">
            {formatUsd(marketStats.totalLiquidity)}
          </div>
          <div className="hero-card-sub font-mono">
            <span className="text-pulse-green">Deduplicated Token Feed</span>
          </div>
        </div>
      </div>

      {/* Markets Filter Toolbar */}
      <div className="markets-toolbar glass-panel">
        {/* Main Category Preset Tabs */}
        <div className="market-category-tabs font-mono">
          <button
            className={`market-cat-btn ${activeCategory === 'trending' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('trending')
              setSortField('volume')
              setSortDirection('desc')
            }}
          >
            <Flame size={14} className="text-pulse-yellow" />
            <span>🔥 Trending</span>
          </button>

          <button
            className={`market-cat-btn ${activeCategory === 'gainers' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('gainers')
              setSortField('change24')
              setSortDirection('desc')
            }}
          >
            <TrendingUp size={14} className="text-pulse-green" />
            <span>🚀 24h Gainers</span>
          </button>

          <button
            className={`market-cat-btn ${activeCategory === 'losers' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('losers')
              setSortField('change24')
              setSortDirection('asc')
            }}
          >
            <TrendingDown size={14} className="text-pulse-red" />
            <span>🩸 24h Losers</span>
          </button>

          <button
            className={`market-cat-btn ${activeCategory === 'volume' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('volume')
              setSortField('volume')
              setSortDirection('desc')
            }}
          >
            <Zap size={14} className="text-pulse-cyan" />
            <span>⚡ Volume</span>
          </button>

          <button
            className={`market-cat-btn ${activeCategory === 'liquidity' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('liquidity')
              setSortField('liquidity')
              setSortDirection('desc')
            }}
          >
            <Droplets size={14} className="text-pulse-purple" />
            <span>💧 Deep Liq ($50K+)</span>
          </button>

          <button
            className={`market-cat-btn ${activeCategory === 'bluechips' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('bluechips')
              setSortField('liquidity')
              setSortDirection('desc')
            }}
          >
            <Coins size={14} className="text-pulse-cyan" />
            <span>💎 Bluechips</span>
          </button>

          <button
            className={`market-cat-btn ${activeCategory === 'watchlist' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('watchlist')
              setSortField('volume')
              setSortDirection('desc')
            }}
          >
            <Star size={14} className="text-pulse-yellow" fill={watchlist.length > 0 ? '#fbbf24' : 'none'} />
            <span>⭐ Watchlist ({watchlist.length})</span>
          </button>
        </div>

        {/* Secondary Filter Controls */}
        <div className="markets-controls-right">
          {/* DEX Selection Tabs */}
          <div className="dex-selection-tabs">
            <button
              className={`dex-tab-btn ${dexFilter === 'all' ? 'active' : ''}`}
              onClick={() => setDexFilter('all')}
            >
              All DEXs
            </button>
            <button
              className={`dex-tab-btn ${dexFilter === 'pulsex' ? 'active' : ''}`}
              onClick={() => setDexFilter('pulsex')}
            >
              PulseX
            </button>
            <button
              className={`dex-tab-btn ${dexFilter === '9mm' ? 'active' : ''}`}
              onClick={() => setDexFilter('9mm')}
            >
              9mm V3
            </button>
            <button
              className={`dex-tab-btn ${dexFilter === '9inch' ? 'active' : ''}`}
              onClick={() => setDexFilter('9inch')}
            >
              9inch
            </button>
            <button
              className={`dex-tab-btn ${dexFilter === 'phux' ? 'active' : ''}`}
              onClick={() => setDexFilter('phux')}
            >
              Phux
            </button>
          </div>

          {/* Quote Dropdown */}
          <select
            value={quoteFilter}
            onChange={(e) => setQuoteFilter(e.target.value)}
            className="market-select-filter font-mono"
          >
            <option value="all">All Quote Pairs</option>
            <option value="wpls">/WPLS</option>
            <option value="dai">/DAI</option>
            <option value="usdc">/USDC</option>
            <option value="hex">/HEX</option>
            <option value="inc">/INC</option>
          </select>

          {/* Min Liquidity Selector */}
          <select
            value={minLiquidity}
            onChange={(e) => setMinLiquidity(Number(e.target.value))}
            className="market-select-filter font-mono"
          >
            <option value="0">Min Liq: All</option>
            <option value="10000">&gt; $10K Liq</option>
            <option value="50000">&gt; $50K Liq</option>
            <option value="250000">&gt; $250K Liq</option>
            <option value="1000000">&gt; $1M Liq</option>
          </select>

          {/* Search Box */}
          <div className="markets-search-box">
            <Search size={13} className="text-muted" />
            <input
              type="text"
              placeholder="Search token, symbol, address..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="market-filter-input font-mono"
            />
            {searchFilter && (
              <button className="market-clear-search" onClick={() => setSearchFilter('')}>✕</button>
            )}
          </div>

          {/* Export CSV */}
          <button
            className="btn-icon"
            onClick={exportCSV}
            title="Download Unique Tokens CSV"
          >
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* Markets Table */}
      <div className="markets-table-wrapper glass-panel">
        <div className="markets-table-top-bar font-mono">
          <span className="markets-results-count">
            Showing <strong>{processedTokens.length}</strong> unique tokens on PulseChain (no repeated assets)
          </span>
          <span className="markets-live-indicator">
            <span className="live-indicator-dot"></span>
            1-Token-1-Row Verified Feed
          </span>
        </div>

        {isLoading ? (
          <div className="markets-loading">
            <Zap size={28} className="animate-spin text-pulse-green" />
            <span className="font-mono">Streaming live PulseChain markets from DexScreener...</span>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="markets-table font-mono">
              <thead>
                <tr>
                  <th style={{ width: '42px' }}>#</th>
                  <th onClick={() => handleSort('name')} className="sortable-th">
                    <span className="th-content">Token Asset {renderSortIcon('name')}</span>
                  </th>
                  <th onClick={() => handleSort('price')} className="sortable-th text-right">
                    <span className="th-content justify-end">Price (USD) {renderSortIcon('price')}</span>
                  </th>
                  <th onClick={() => handleSort('change5m')} className="sortable-th text-right">
                    <span className="th-content justify-end">5m % {renderSortIcon('change5m')}</span>
                  </th>
                  <th onClick={() => handleSort('change1')} className="sortable-th text-right">
                    <span className="th-content justify-end">1h % {renderSortIcon('change1')}</span>
                  </th>
                  <th onClick={() => handleSort('change24')} className="sortable-th text-right">
                    <span className="th-content justify-end">24h % {renderSortIcon('change24')}</span>
                  </th>
                  <th onClick={() => handleSort('volume')} className="sortable-th text-right">
                    <span className="th-content justify-end">24h Volume {renderSortIcon('volume')}</span>
                  </th>
                  <th onClick={() => handleSort('liquidity')} className="sortable-th text-right">
                    <span className="th-content justify-end">Liquidity {renderSortIcon('liquidity')}</span>
                  </th>
                  <th onClick={() => handleSort('txns')} className="sortable-th text-right">
                    <span className="th-content justify-end">24h Swaps {renderSortIcon('txns')}</span>
                  </th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {processedTokens.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="text-center py-12 text-muted">
                      <div className="empty-state-box">
                        <Layers size={32} className="text-muted opacity-40 mb-2" />
                        <p>No tokens found matching your active filter criteria.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  processedTokens.map((pair, index) => {
                    const isStarred = watchlist.includes(pair.pairAddress?.toLowerCase())
                    const base = pair.baseToken || {}
                    const quote = pair.quoteToken || {}
                    const change24 = pair.priceChange?.h24 || 0
                    const change1 = pair.priceChange?.h1 || 0
                    const change5m = pair.priceChange?.m5 || 0
                    const buys = pair.txns?.h24?.buys || 0
                    const sells = pair.txns?.h24?.sells || 0
                    const totalTxns = buys + sells
                    const isCopied = copiedAddr === (base.address || pair.pairAddress)
                    const hasMultiplePools = pair.poolCount > 1

                    return (
                      <tr
                        key={base.address || pair.pairAddress || index}
                        className="market-row"
                        onClick={() => onSelectPair(pair)}
                      >
                        {/* Star Button & Rank */}
                        <td onClick={(e) => e.stopPropagation()} className="rank-star-cell">
                          <button
                            className="table-star-btn"
                            onClick={() => onToggleWatchlist(pair.pairAddress)}
                            title={isStarred ? 'Remove from Watchlist' : 'Add to Watchlist'}
                          >
                            <Star
                              size={14}
                              fill={isStarred ? '#fbbf24' : 'none'}
                              color={isStarred ? '#fbbf24' : '#64748b'}
                            />
                          </button>
                          <span className="rank-num">{index + 1}</span>
                        </td>

                        {/* Token Symbol, Name, Primary DEX & Multi-Pool Badge */}
                        <td>
                          <div className="table-pair-cell">
                            <TokenLogo
                              symbol={base.symbol}
                              address={base.address}
                              customUrl={pair.info?.imageUrl}
                              size={26}
                            />
                            <div className="table-pair-symbols">
                              <div className="pair-line">
                                <span className="base-sym font-bold text-white">{base.symbol}</span>
                                <span className="quote-sym text-muted">/{quote.symbol}</span>
                              </div>
                              <span className="pair-fullname text-muted">{base.name}</span>
                            </div>

                            <span className={`table-dex-pill dex-${(pair.dexId || 'pulsex').toLowerCase()}`}>
                              {pair.dexId || 'PulseX'}
                            </span>

                            {hasMultiplePools && (
                              <button
                                type="button"
                                className="badge badge-purple font-mono cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setActivePoolsModalToken(pair)
                                }}
                                title={`View all ${pair.poolCount} liquidity pools for ${base.symbol}`}
                              >
                                <Layers size={10} className="mr-0.5" />
                                <span>{pair.poolCount} Pools</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Price */}
                        <td className="text-right font-bold text-white">
                          {formatPrice(pair.priceUsd)}
                        </td>

                        {/* 5M */}
                        <td className="text-right">
                          <span className={`mini-change-tag ${change5m >= 0 ? 'text-pulse-green bg-green-subtle' : 'text-pulse-red bg-red-subtle'}`}>
                            {change5m >= 0 ? '+' : ''}{change5m}%
                          </span>
                        </td>

                        {/* 1H */}
                        <td className="text-right">
                          <span className={`mini-change-tag ${change1 >= 0 ? 'text-pulse-green bg-green-subtle' : 'text-pulse-red bg-red-subtle'}`}>
                            {change1 >= 0 ? '+' : ''}{change1}%
                          </span>
                        </td>

                        {/* 24H Change Badge */}
                        <td className="text-right">
                          <span
                            className={`table-change-badge ${
                              change24 >= 0 ? 'badge-green' : 'badge-red'
                            }`}
                          >
                            {change24 >= 0 ? '+' : ''}{Number(change24).toFixed(2)}%
                          </span>
                        </td>

                        {/* 24h Volume */}
                        <td className="text-right font-bold text-secondary">
                          {formatUsd(pair.volume?.h24)}
                        </td>

                        {/* Liquidity */}
                        <td className="text-right text-secondary">
                          {formatUsd(pair.liquidity?.usd)}
                        </td>

                        {/* Swaps Buys/Sells Breakdown */}
                        <td className="text-right">
                          <div className="swaps-breakdown-box">
                            <span className="swaps-total">{totalTxns.toLocaleString()}</span>
                            <div className="swaps-sub-ratio">
                              <span className="text-pulse-green">{buys}B</span>
                              <span className="text-muted">/</span>
                              <span className="text-pulse-red">{sells}S</span>
                            </div>
                          </div>
                        </td>

                        {/* Trade / Screener Button */}
                        <td onClick={(e) => e.stopPropagation()} className="text-right">
                          <div className="table-actions-group">
                            <button
                              className="mini-copy-btn"
                              onClick={(e) => handleCopy(e, base.address || pair.pairAddress)}
                              title="Copy Token Contract Address"
                            >
                              {isCopied ? <Check size={12} className="text-pulse-green" /> : <Copy size={12} />}
                            </button>
                            <button
                              className="btn-primary table-trade-btn"
                              onClick={() => onSelectPair(pair)}
                            >
                              Chart
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Other Pools Modal for Multi-Pool Tokens in Markets */}
      {activePoolsModalToken && (
        <div className="modal-backdrop" onClick={() => setActivePoolsModalToken(null)}>
          <div className="modal-card glass-panel max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-subtle">
              <div className="flex items-center gap-2.5">
                <TokenLogo
                  symbol={activePoolsModalToken.baseToken?.symbol}
                  address={activePoolsModalToken.baseToken?.address}
                  size={28}
                />
                <div>
                  <h3 className="text-white font-bold text-base flex items-center gap-2">
                    <span>{activePoolsModalToken.baseToken?.symbol} Liquidity Pools</span>
                    <span className="badge badge-purple text-xs">{activePoolsModalToken.allPools?.length} Pools</span>
                  </h3>
                  <span className="text-xs text-muted font-mono">{activePoolsModalToken.baseToken?.name} ({activePoolsModalToken.baseToken?.address?.slice(0, 8)}...{activePoolsModalToken.baseToken?.address?.slice(-6)})</span>
                </div>
              </div>
              <button
                className="wallet-modal-close-btn"
                onClick={() => setActivePoolsModalToken(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="my-4 flex flex-col gap-2.5 max-h-[380px] overflow-y-auto pr-1 font-mono">
              {activePoolsModalToken.allPools?.map((pool, idx) => (
                <div
                  key={pool.pairAddress || idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-subtle hover:border-pulse-cyan/40 hover:bg-pulse-cyan/5 transition-all cursor-pointer"
                  onClick={() => {
                    onSelectPair(pool)
                    setActivePoolsModalToken(null)
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <TokenLogo symbol={pool.quoteToken?.symbol} address={pool.quoteToken?.address} size={22} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{pool.baseToken?.symbol} / {pool.quoteToken?.symbol}</span>
                        <span className="badge badge-pulse text-[10px]">{pool.dexId || 'PulseX'}</span>
                      </div>
                      <span className="text-[11px] text-muted">{pool.pairAddress?.slice(0, 6)}...{pool.pairAddress?.slice(-4)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <div className="font-bold text-white text-xs">{formatPrice(pool.priceUsd)}</div>
                      <div className="text-[11px] text-pulse-cyan">Liq: {formatUsd(pool.liquidity?.usd)}</div>
                    </div>

                    <span className={`badge ${parseFloat(pool.priceChange?.h24 || 0) >= 0 ? 'badge-green' : 'badge-red'} text-[10.5px]`}>
                      {parseFloat(pool.priceChange?.h24 || 0) >= 0 ? '+' : ''}{(pool.priceChange?.h24 || 0).toFixed(1)}%
                    </span>

                    <button
                      type="button"
                      className="btn-secondary btn-xs flex items-center gap-1 font-sans"
                    >
                      <span>Chart</span>
                      <ArrowRight size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
