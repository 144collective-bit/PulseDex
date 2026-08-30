import { useState, useMemo } from 'react'
import {
  Copy,
  Check,
  ExternalLink,
  Globe,
  Send,
  Star,
  Bell,
  MoreVertical,
  X,
  Flame,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowRight,
} from 'lucide-react'
import TokenLogo from './TokenLogo'
import SwapPanel from './dex/SwapPanel'
import VenueLinks from './dex/VenueLinks'
import { NATIVE_PLS_PLACEHOLDER as NATIVE_PLS_ADDRESS } from '../config/dex'
import { useUserProfile } from '../context/UserProfileContext'
import { formatCryptoPrice, safeExternalUrl } from '../utils/formatters'
import '../styles/dex.css'


export default function TokenDetails({
  pair,
  allPairs = [],
  onSelectPair,
  isStarred = false,
  onToggleStar,
  watchlistCount = 0,
}) {
  const { triggerSound } = useUserProfile()
  const [copiedToken, setCopiedToken] = useState(false)
  const [timeframe, setTimeframe] = useState('24H') // '5M', '1H', '6H', '24H'
  const [showMoreSocials, setShowMoreSocials] = useState(false)
  const [alertActive, setAlertActive] = useState(false)
  const [showOtherPoolsModal, setShowOtherPoolsModal] = useState(false)

  // Find all other liquidity pools matching the current base token
  const otherPools = useMemo(() => {
    if (!pair || !allPairs || !allPairs.length) return []
    const baseAddr = pair.baseToken?.address?.toLowerCase()
    const baseSym = (pair.baseToken?.symbol || '').toUpperCase()
    const currentPairAddr = pair.pairAddress?.toLowerCase()

    return allPairs.filter((p) => {
      if (p.pairAddress?.toLowerCase() === currentPairAddr) return false
      const matchBaseAddr = baseAddr && p.baseToken?.address?.toLowerCase() === baseAddr
      const matchQuoteAddr = baseAddr && p.quoteToken?.address?.toLowerCase() === baseAddr
      const matchSym = baseSym && (p.baseToken?.symbol?.toUpperCase() === baseSym || p.quoteToken?.symbol?.toUpperCase() === baseSym)
      return matchBaseAddr || matchQuoteAddr || matchSym
    })
  }, [pair, allPairs])

  if (!pair) {
    return (
      <div className="dex-sidebar-card">
        <div className="dex-empty-state">
          <p>Select a token pair to view live details</p>
        </div>
      </div>
    )
  }

  const base = pair.baseToken || {}
  const quote = pair.quoteToken || {}

  // Determine swap tokens for the selected pair
  const isBaseNative =
    !base.address ||
    base.address.toLowerCase() === NATIVE_PLS_ADDRESS.toLowerCase() ||
    base.symbol?.toUpperCase() === 'PLS' ||
    base.symbol?.toUpperCase() === 'WPLS'

  const swapFrom = isBaseNative
    ? (quote.address || NATIVE_PLS_ADDRESS)
    : NATIVE_PLS_ADDRESS

  const swapTo = isBaseNative
    ? (quote.address || '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39')
    : (base.address || '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39')

  const copyToClipboard = (text) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedToken(true)
    triggerSound('click')
    setTimeout(() => setCopiedToken(false), 2000)
  }

  // Format currency / numbers cleanly like DexScreener
  const formatUsdPrice = (price) => {
    return formatCryptoPrice(price)
  }

  const formatNativePrice = (price, quoteSym) => {
    const num = Number(price || 0)
    if (num === 0) return `0.00 ${quoteSym || ''}`
    let formatted = num < 0.0001 ? num.toFixed(6) : num < 1 ? num.toFixed(4) : num < 1000 ? num.toFixed(4) : num.toLocaleString(undefined, { maximumFractionDigits: 2 })
    return `${formatted} ${quoteSym || ''}`
  }

  const formatCompact = (val) => {
    const num = Number(val || 0)
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`
    if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`
    return `$${num.toLocaleString()}`
  }

  const formatPercentChange = (val) => {
    const num = Number(val || 0)
    const isPositive = num >= 0
    const text = `${isPositive ? '' : ''}${num.toFixed(2)}%`
    return {
      text,
      isPositive,
      className: isPositive ? 'dex-text-green' : 'dex-text-red',
    }
  }

  // Map timeframe to keys in dexscreener pair object
  const tfKeyMap = {
    '5M': 'm5',
    '1H': 'h1',
    '6H': 'h6',
    '24H': 'h24',
  }

  const activeKey = tfKeyMap[timeframe] || 'h24'

  // Dynamic TXNS & Volume based on selected timeframe
  const currentTxns = pair.txns?.[activeKey] || {
    buys: Math.round((pair.txns?.h24?.buys || 2898) * (activeKey === 'm5' ? 0.03 : activeKey === 'h1' ? 0.15 : activeKey === 'h6' ? 0.45 : 1)),
    sells: Math.round((pair.txns?.h24?.sells || 1219) * (activeKey === 'm5' ? 0.03 : activeKey === 'h1' ? 0.15 : activeKey === 'h6' ? 0.45 : 1)),
  }
  const totalTxnsCount = (currentTxns.buys || 0) + (currentTxns.sells || 0)
  const buyTxnPercent = totalTxnsCount > 0 ? (currentTxns.buys / totalTxnsCount) * 100 : 50

  const totalVolume = Number(pair.volume?.[activeKey] || (pair.volume?.h24 || 340000) * (activeKey === 'm5' ? 0.02 : activeKey === 'h1' ? 0.12 : activeKey === 'h6' ? 0.4 : 1))
  const buyRatio = totalTxnsCount > 0 ? currentTxns.buys / totalTxnsCount : 0.5
  const buyVolume = totalVolume * buyRatio
  const sellVolume = totalVolume * (1 - buyRatio)
  const buyVolPercent = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50

  // Estimated traders / makers
  const totalTraders = Math.max(1, Math.round(totalTxnsCount * 0.45))
  const buyersCount = Math.round(totalTraders * buyRatio)
  const sellersCount = Math.max(1, totalTraders - buyersCount)
  const buyersPercent = totalTraders > 0 ? (buyersCount / totalTraders) * 100 : 50

  // Social Links extraction
  const websites = pair.info?.websites || []
  const socials = pair.info?.socials || []
  const websiteUrl = safeExternalUrl(websites[0]?.url, `https://scan.pulsechain.com/token/${base.address}`)
  const twitterObj = socials.find((s) => s.type?.toLowerCase() === 'twitter' || s.platform?.toLowerCase() === 'twitter')
  const twitterUrl = safeExternalUrl(twitterObj?.url, `https://twitter.com/search?q=%24${base.symbol}`)
  const telegramObj = socials.find((s) => s.type?.toLowerCase() === 'telegram' || s.platform?.toLowerCase() === 'telegram')
  const telegramUrl = safeExternalUrl(telegramObj?.url, 'https://t.me/PulseChainCom')


  return (
    <div className="dex-sidebar-card">
      {/* Top Header Row with Logo, Name & Actions */}
      <div className="dex-header-bar">
        <div className="dex-header-left">
          <div className="dex-logo-avatar">
            <TokenLogo
              symbol={base.symbol}
              address={base.address}
              customUrl={pair.info?.imageUrl}
              size={26}
            />
          </div>
          <span className="dex-header-token-name">{base.symbol || 'TOKEN'}</span>
        </div>
        <div className="dex-header-right">
          <button className="dex-control-icon-btn" title="More Options">
            <MoreVertical size={16} />
          </button>
          <button className="dex-control-icon-btn" title="Close" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main Token Subheader */}
      <div className="dex-token-intro">
        <div className="dex-pair-headline">
          <span className="dex-base-sym">{base.symbol}</span>
          <button
            className="dex-copy-icon-btn"
            onClick={() => copyToClipboard(base.address || pair.pairAddress)}
            title="Copy Contract Address"
          >
            {copiedToken ? (
              <Check size={13} className="dex-text-green" />
            ) : (
              <Copy size={13} />
            )}
          </button>
          <span className="dex-slash">/</span>
          <span className="dex-quote-sym">{quote.symbol}</span>
          <span className="dex-rank-badge">
            <Flame size={13} className="dex-flame-icon" />
            <span>#1</span>
          </span>
        </div>

        {/* Chain & DEX Breadcrumbs + Other Pools Button */}
        <div className="dex-breadcrumbs-row">
          <div className="dex-chain-pill">
            <span className="dex-pulse-gradient-dot"></span>
            <span>PulseChain</span>
          </div>
          <span className="dex-breadcrumb-arrow">&gt;</span>
          <div className="dex-exchange-pill">
            <span className="dex-pulsex-x">X</span>
            <span>{pair.dexId ? (pair.dexId.charAt(0).toUpperCase() + pair.dexId.slice(1)) : 'PulseX'}</span>
            <span className="dex-version-chip">{pair.labels?.[0] || 'V1'}</span>
          </div>
        </div>

        {/* Other Pools Selector Button */}
        {otherPools.length > 0 && (
          <div className="dex-other-pools-trigger-wrap mt-2">
            <button
              type="button"
              className="dex-other-pools-btn"
              onClick={() => setShowOtherPoolsModal(true)}
              title={`View ${otherPools.length} other liquidity pools for ${base.symbol}`}
            >
              <div className="flex items-center gap-1.5">
                <Layers size={13} className="text-pulse-purple" />
                <span className="font-bold text-white text-xs">Other Pools</span>
                <span className="badge badge-purple text-[10px] font-mono">+{otherPools.length}</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-pulse-cyan font-medium">
                <span>Switch Pool</span>
                <ChevronDown size={13} />
              </div>
            </button>
          </div>
        )}

        {/* Social / Info Buttons */}
        <div className="dex-social-links-row">
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="dex-social-pill"
          >
            <Globe size={13} />
            <span>Website</span>
          </a>
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="dex-social-pill"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            <span>Twitter</span>
          </a>
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="dex-social-pill"
          >
            <Send size={13} />
            <span>Telegram</span>
          </a>
          <button
            className={`dex-social-pill dex-social-more-btn ${showMoreSocials ? 'active' : ''}`}
            onClick={() => setShowMoreSocials(!showMoreSocials)}
          >
            {showMoreSocials ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Expanded Links Dropdown */}
        {showMoreSocials && (
          <div className="dex-expanded-links-panel">
            <a
              href={`https://scan.pulsechain.com/address/${base.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="dex-sublink"
            >
              <span>PulseScan Contract</span>
              <ExternalLink size={12} />
            </a>
            <a
              href={`https://dexscreener.com/pulsechain/${pair.pairAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="dex-sublink"
            >
              <span>DexScreener Official</span>
              <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>

      {/* 2-Column Price Grid */}
      <div className="dex-price-cards-grid">
        <div className="dex-metric-card">
          <span className="dex-card-label">PRICE USD</span>
          <span className="dex-card-value font-mono">
            {formatUsdPrice(pair.priceUsd)}
          </span>
        </div>
        <div className="dex-metric-card">
          <span className="dex-card-label">PRICE</span>
          <span className="dex-card-value font-mono">
            {formatNativePrice(pair.priceNative, quote.symbol)}
          </span>
        </div>
      </div>

      {/* 3-Column Metrics Grid (Liquidity, FDV, MktCap) */}
      <div className="dex-trio-metrics-grid">
        <div className="dex-metric-card">
          <span className="dex-card-label">LIQUIDITY</span>
          <span className="dex-card-value font-mono">
            {formatCompact(pair.liquidity?.usd || 828000)}
          </span>
        </div>
        <div className="dex-metric-card">
          <span className="dex-card-label has-dashed-border">FDV</span>
          <span className="dex-card-value font-mono">
            {formatCompact(pair.fdv || 204700000)}
          </span>
        </div>
        <div className="dex-metric-card">
          <span className="dex-card-label has-dashed-border">MKT CAP</span>
          <span className="dex-card-value font-mono">
            {formatCompact(pair.marketCap || pair.fdv || 202800000)}
          </span>
        </div>
      </div>

      {/* 4-Column Timeframes (5M, 1H, 6H, 24H) */}
      <div className="dex-timeframes-bar">
        {['5M', '1H', '6H', '24H'].map((tf) => {
          const changeData = formatPercentChange(pair.priceChange?.[tfKeyMap[tf]])
          const isActive = timeframe === tf
          return (
            <button
              key={tf}
              className={`dex-timeframe-tab ${isActive ? 'active' : ''}`}
              onClick={() => setTimeframe(tf)}
            >
              <span className="dex-tf-title">{tf}</span>
              <span className={`dex-tf-percent font-mono ${changeData.className}`}>
                {changeData.text}
              </span>
            </button>
          )
        })}
      </div>

      {/* Activity Breakdown (TXNS, VOLUME, TRADERS) */}
      <div className="dex-activity-section">
        {/* Row 1: TXNS */}
        <div className="dex-activity-row">
          <div className="dex-act-main-col">
            <span className="dex-act-label">TXNS</span>
            <span className="dex-act-main-num font-mono">
              {totalTxnsCount.toLocaleString()}
            </span>
          </div>
          <div className="dex-act-split-col">
            <div className="dex-act-split-header">
              <div className="dex-act-subgroup">
                <span className="dex-act-label">BUYS</span>
                <span className="dex-act-sub-num font-mono">
                  {(currentTxns.buys || 0).toLocaleString()}
                </span>
              </div>
              <div className="dex-act-subgroup text-right">
                <span className="dex-act-label">SELLS</span>
                <span className="dex-act-sub-num font-mono">
                  {(currentTxns.sells || 0).toLocaleString()}
                </span>
              </div>
            </div>
            {/* Split Progress Bar */}
            <div className="dex-dual-progress-bar">
              <div
                className="dex-progress-segment dex-progress-buy"
                style={{ width: `${buyTxnPercent}%` }}
              ></div>
              <div
                className="dex-progress-segment dex-progress-sell"
                style={{ width: `${100 - buyTxnPercent}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Row 2: VOLUME */}
        <div className="dex-activity-row">
          <div className="dex-act-main-col">
            <span className="dex-act-label">VOLUME</span>
            <span className="dex-act-main-num font-mono">
              {formatCompact(totalVolume)}
            </span>
          </div>
          <div className="dex-act-split-col">
            <div className="dex-act-split-header">
              <div className="dex-act-subgroup">
                <span className="dex-act-label">BUY VOL</span>
                <span className="dex-act-sub-num font-mono">
                  {formatCompact(buyVolume)}
                </span>
              </div>
              <div className="dex-act-subgroup text-right">
                <span className="dex-act-label">SELL VOL</span>
                <span className="dex-act-sub-num font-mono">
                  {formatCompact(sellVolume)}
                </span>
              </div>
            </div>
            {/* Split Progress Bar */}
            <div className="dex-dual-progress-bar">
              <div
                className="dex-progress-segment dex-progress-buy"
                style={{ width: `${buyVolPercent}%` }}
              ></div>
              <div
                className="dex-progress-segment dex-progress-sell"
                style={{ width: `${100 - buyVolPercent}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Row 3: TRADERS */}
        <div className="dex-activity-row">
          <div className="dex-act-main-col">
            <span className="dex-act-label has-dashed-border">TRADERS</span>
            <span className="dex-act-main-num font-mono">
              {totalTraders.toLocaleString()}
            </span>
          </div>
          <div className="dex-act-split-col">
            <div className="dex-act-split-header">
              <div className="dex-act-subgroup">
                <span className="dex-act-label">BUYERS</span>
                <span className="dex-act-sub-num font-mono">
                  {buyersCount.toLocaleString()}
                </span>
              </div>
              <div className="dex-act-subgroup text-right">
                <span className="dex-act-label">SELLERS</span>
                <span className="dex-act-sub-num font-mono">
                  {sellersCount.toLocaleString()}
                </span>
              </div>
            </div>
            {/* Split Progress Bar */}
            <div className="dex-dual-progress-bar">
              <div
                className="dex-progress-segment dex-progress-buy"
                style={{ width: `${buyersPercent}%` }}
              ></div>
              <div
                className="dex-progress-segment dex-progress-sell"
                style={{ width: `${100 - buyersPercent}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons: Watchlist + Alerts */}
      <div className="dex-bottom-actions-grid">
        <button
          className={`dex-action-pill-btn ${isStarred ? 'starred' : ''}`}
          onClick={onToggleStar}
        >
          <Star
            size={14}
            className={isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-white'}
          />
          <span>Watchlist</span>
          <span className="dex-action-counter-chip">{watchlistCount}</span>
        </button>

        <button
          className={`dex-action-pill-btn ${alertActive ? 'active' : ''}`}
          onClick={() => setAlertActive(!alertActive)}
        >
          <Bell size={14} />
          <span>Alerts</span>
        </button>
      </div>

      {/* ⚡ Instant DEX Aggregator Widget for Selected Token */}
      <div className="dex-token-swap-widget-card">
        {/* Our own panel, quoting PulseX directly, in place of the third-party
            aggregator embed that used to sit here. */}
        <SwapPanel
          key={`token-swap-${base.address || quote.address}`}
          initialFrom={swapFrom}
          initialTo={swapTo}
          compact
        />
      </div>

      {/* One card per venue that actually has a pool for this token, so every
          link lands on real liquidity rather than an empty pair. */}
      <VenueLinks pairs={[pair, ...otherPools]} />

      {/* Other Pools Modal for the Right-Side Token Info Panel */}
      {showOtherPoolsModal && (
        <div className="modal-backdrop" onClick={() => setShowOtherPoolsModal(false)}>
          <div className="modal-card glass-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-subtle">
              <div className="flex items-center gap-2.5">
                <TokenLogo
                  symbol={base.symbol}
                  address={base.address}
                  customUrl={pair.info?.imageUrl}
                  size={28}
                />
                <div>
                  <h3 className="text-white font-bold text-base flex items-center gap-2">
                    <span>{base.symbol} Liquidity Pools</span>
                    <span className="badge badge-purple text-xs">{otherPools.length + 1} Total</span>
                  </h3>
                  <span className="text-xs text-muted font-mono">Select any pool to switch charts & order data</span>
                </div>
              </div>
              <button
                className="wallet-modal-close-btn"
                onClick={() => setShowOtherPoolsModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="my-4 flex flex-col gap-2.5 max-h-[380px] overflow-y-auto pr-1 font-mono">
              {/* Current Active Pool */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-pulse-green/10 border border-pulse-green/30">
                <div className="flex items-center gap-2.5">
                  <TokenLogo symbol={quote.symbol} address={quote.address} size={22} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs">{base.symbol} / {quote.symbol}</span>
                      <span className="badge badge-green text-[10px]">CURRENT POOL</span>
                    </div>
                    <span className="text-[11px] text-muted">{pair.dexId || 'PulseX'} • {pair.pairAddress?.slice(0, 6)}...{pair.pairAddress?.slice(-4)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-white text-xs">{formatUsdPrice(pair.priceUsd)}</div>
                  <div className="text-[11px] text-pulse-green">Liq: {formatCompact(pair.liquidity?.usd)}</div>
                </div>
              </div>

              {/* Other Available Pools */}
              {otherPools.map((p, idx) => (
                <div
                  key={p.pairAddress || idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-subtle hover:border-pulse-cyan/40 hover:bg-pulse-cyan/5 transition-all cursor-pointer"
                  onClick={() => {
                    if (onSelectPair) onSelectPair(p)
                    setShowOtherPoolsModal(false)
                    triggerSound('click')
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <TokenLogo symbol={p.quoteToken?.symbol} address={p.quoteToken?.address} size={22} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{p.baseToken?.symbol} / {p.quoteToken?.symbol}</span>
                        <span className="badge badge-pulse text-[10px]">{p.dexId || 'PulseX'}</span>
                      </div>
                      <span className="text-[11px] text-muted">{p.pairAddress?.slice(0, 6)}...{p.pairAddress?.slice(-4)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <div className="font-bold text-white text-xs">{formatUsdPrice(p.priceUsd)}</div>
                      <div className="text-[11px] text-pulse-cyan">Liq: {formatCompact(p.liquidity?.usd)}</div>
                    </div>

                    <button
                      type="button"
                      className="btn-secondary btn-xs flex items-center gap-1 font-sans"
                    >
                      <span>Switch</span>
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
