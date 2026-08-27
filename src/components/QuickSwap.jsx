import { useState, useEffect } from 'react'
import {
  ArrowDownUp,
  Zap,
  Settings,
  ExternalLink,
  Layers,
} from 'lucide-react'
import TokenLogo from './TokenLogo'
import { buildPulseXSwapUrl } from '../utils/formatters'
import { getNativePlsPrice } from '../services/dexscreener'
import { useUserProfile } from '../context/UserProfileContext'

export default function QuickSwap({ pair }) {
  const { preferences, triggerSound } = useUserProfile()
  const [fromAmount, setFromAmount] = useState('100000')
  const [slippage, setSlippage] = useState(preferences?.slippage || '0.5')
  const [customSlippage, setCustomSlippage] = useState(preferences?.customSlippage || '')
  const [showSettings, setShowSettings] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState('swap') // 'swap' | 'route'
  const [isReversed, setIsReversed] = useState(false)

  useEffect(() => {
    if (preferences) {
      setSlippage(preferences.slippage || '0.5')
      setCustomSlippage(preferences.customSlippage || '')
    }
  }, [preferences])

  const base = pair?.baseToken || { symbol: 'PLSX' }
  const quote = pair?.quoteToken || { symbol: 'PLS' }
  const priceUsd = parseFloat(pair?.priceUsd || '0')

  // Live PLS/USD off the WPLS-DAI pool, refreshed on the market-data cadence.
  // Quotes stay blank until it arrives rather than showing a stale constant.
  const [plsPrice, setPlsPrice] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadPlsPrice() {
      const price = await getNativePlsPrice()
      if (!cancelled && price > 0) setPlsPrice(price)
    }
    loadPlsPrice()
    const interval = setInterval(loadPlsPrice, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const fromToken = isReversed ? base : quote
  const toToken = isReversed ? quote : base

  // Calculation — only meaningful once both legs have a live price
  const numericFrom = parseFloat(fromAmount || '0')
  const canQuote = plsPrice !== null && priceUsd > 0
  const fromPrice = isReversed ? priceUsd : plsPrice
  const toPrice = isReversed ? plsPrice : priceUsd

  let estimatedTo = ''
  if (canQuote && numericFrom > 0) {
    estimatedTo = ((numericFrom * fromPrice) / toPrice).toFixed(2)
  }

  const formatUsdEstimate = (amount, price) =>
    canQuote && amount > 0 ? `≈ ${(amount * price).toFixed(2)} USD` : '—'

  const effectiveSlippage = customSlippage.trim() !== '' ? customSlippage : slippage
  const pulseXSwapUrl = buildPulseXSwapUrl(quote.address, base.address)

  const handleQuickPercent = (pct) => {
    const maxVal = isReversed ? 10000 : 500000
    setFromAmount((maxVal * (pct / 100)).toFixed(0))
  }

  return (
    <div className="quick-swap-panel glass-panel">
      {/* Header & Subtabs */}
      <div className="swap-header">
        <div className="swap-tabs font-mono">
          <button
            className={`swap-tab-btn ${activeSubTab === 'swap' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('swap')}
          >
            <Zap size={14} className="text-pulse-green" />
            <span>Instant Swap</span>
          </button>
          <button
            className={`swap-tab-btn ${activeSubTab === 'route' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('route')}
          >
            <Layers size={13} />
            <span>Routing</span>
          </button>
        </div>

        <button
          className={`btn-icon-subtle ${showSettings ? 'active' : ''}`}
          onClick={() => setShowSettings(!showSettings)}
          title="Swap Slippage Settings"
        >
          <Settings size={15} />
        </button>
      </div>

      {/* Slippage Drawer */}
      {showSettings && (
        <div className="slippage-box font-mono">
          <div className="slippage-title-row">
            <span className="slippage-label">Slippage Tolerance</span>
            <span className="slippage-curr-val text-pulse-cyan">{effectiveSlippage}%</span>
          </div>
          <div className="slippage-options">
            {['0.1', '0.5', '1', '3'].map((val) => (
              <button
                key={val}
                className={`slippage-pill ${slippage === val && !customSlippage ? 'active' : ''}`}
                onClick={() => {
                  setSlippage(val)
                  setCustomSlippage('')
                }}
              >
                {val}%
              </button>
            ))}
            <input
              type="number"
              placeholder="Custom"
              value={customSlippage}
              onChange={(e) => setCustomSlippage(e.target.value)}
              className="slippage-custom-input font-mono"
            />
          </div>
        </div>
      )}

      {activeSubTab === 'swap' ? (
        <>
          {/* Pay Input */}
          <div className="swap-input-card">
            <div className="swap-input-top">
              <span className="swap-input-label font-mono">You Pay</span>
              <div className="quick-pct-group font-mono">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className="quick-pct-btn"
                    onClick={() => handleQuickPercent(pct)}
                  >
                    {pct === 100 ? 'MAX' : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>
            <div className="swap-input-row">
              <input
                type="number"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                className="swap-number-input font-mono"
                placeholder="0.0"
              />
              <div className="swap-token-badge font-mono flex items-center gap-1.5">
                <TokenLogo
                  symbol={fromToken.symbol}
                  address={fromToken.address}
                  size={18}
                />
                <span>{fromToken.symbol}</span>
              </div>
            </div>
            <div className="swap-usd-estimate font-mono text-muted text-xs mt-1">
              {formatUsdEstimate(numericFrom, fromPrice)}
            </div>
          </div>

          {/* Switch Direction Icon */}
          <div className="swap-divider-icon">
            <button
              type="button"
              className="swap-icon-circle"
              onClick={() => setIsReversed(!isReversed)}
              title="Reverse direction"
            >
              <ArrowDownUp size={14} className="text-pulse-cyan hover:scale-110 transition-transform" />
            </button>
          </div>

          {/* Receive Input */}
          <div className="swap-input-card">
            <div className="swap-input-top">
              <span className="swap-input-label font-mono">You Receive (Est.)</span>
              <span className="swap-balance font-mono text-muted text-xs">
                {formatUsdEstimate(parseFloat(estimatedTo || '0'), toPrice)}
              </span>
            </div>
            <div className="swap-input-row">
              <input
                type="text"
                readOnly
                value={estimatedTo}
                placeholder={canQuote ? '0.0' : 'Fetching price…'}
                className="swap-number-input font-mono readonly"
              />
              <div className="swap-token-badge font-mono flex items-center gap-1.5">
                <TokenLogo
                  symbol={toToken.symbol}
                  address={toToken.address}
                  size={18}
                />
                <span>{toToken.symbol}</span>
              </div>
            </div>
          </div>

          {/* Rate & Fee Info */}
          <div className="swap-rate-info font-mono text-xs">
            <div className="rate-row">
              <span className="text-muted">Rate</span>
              <span>
                {canQuote ? `1 ${base.symbol} ≈ ${(priceUsd / plsPrice).toFixed(4)} PLS` : 'Fetching live rate…'}
              </span>
            </div>
            <div className="rate-row">
              <span className="text-muted">Routing DEX</span>
              <span className="text-pulse-green font-semibold">PulseX v2 Router</span>
            </div>
          </div>

          {/* CTA Button */}
          <a
            href={pulseXSwapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary swap-submit-btn font-mono"
          >
            <span>Trade on PulseX</span>
            <ExternalLink size={15} />
          </a>
        </>
      ) : (
        /* Routing Subtab */
        <div className="routing-tab-content font-mono text-xs">
          <div className="route-step">
            <div className="route-node text-pulse-green">1</div>
            <div className="route-info">
              <span className="route-name">Input: {fromToken.symbol}</span>
              <span className="route-desc text-muted">User Wallet on PulseChain</span>
            </div>
          </div>
          <div className="route-connector"></div>
          <div className="route-step">
            <div className="route-node text-pulse-cyan">2</div>
            <div className="route-info">
              <span className="route-name">Router: PulseX v2 Automated Market Maker</span>
              <span className="route-desc text-muted">0x165C...52d9 (Optimal Path)</span>
            </div>
          </div>
          <div className="route-connector"></div>
          <div className="route-step">
            <div className="route-node text-pulse-purple">3</div>
            <div className="route-info">
              <span className="route-name">Output: {toToken.symbol}</span>
              <span className="route-desc text-muted">Direct transfer to connected wallet</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
