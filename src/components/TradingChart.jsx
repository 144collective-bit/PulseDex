import { useState, useRef } from 'react'
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  RefreshCw,
  Zap,
  ArrowLeftRight,
  Share2,
  Check,
} from 'lucide-react'

export default function TradingChart({ pair, pairAddress }) {
  const chartWrapperRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [keyCounter, setKeyCounter] = useState(0)
  const [isReloading, setIsReloading] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const activePairAddress =
    pairAddress || pair?.pairAddress || '0x1b45b9148791d3a104184Cd5DFE5CE57193a3ee9'
  const baseSymbol = pair?.baseToken?.symbol || 'TOKEN'
  const quoteSymbol = pair?.quoteToken?.symbol || 'PLS'

  // Official DexScreener Real-Time Live Embed URL for PulseChain (Sound Muted)
  const embedUrl = `https://dexscreener.com/pulsechain/${activePairAddress}?embed=1&theme=dark&trades=0&info=0&sound=0`
  const swapUrl = `https://app.pulsex.com/swap?inputCurrency=${pair?.quoteToken?.address || 'PLS'}&outputCurrency=${pair?.baseToken?.address || ''}`

  // Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!chartWrapperRef.current) return
    if (!isFullscreen) {
      if (chartWrapperRef.current.requestFullscreen) {
        chartWrapperRef.current.requestFullscreen()
      }
      setIsFullscreen(true)
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
      setIsFullscreen(false)
    }
  }

  const reloadChart = () => {
    setIsReloading(true)
    setKeyCounter((prev) => prev + 1)
    setTimeout(() => setIsReloading(false), 600)
  }

  const handleShare = () => {
    const url = window.location.href
    navigator.clipboard.writeText(url)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  return (
    <div
      className={`trading-chart-wrapper glass-panel ${isFullscreen ? 'fullscreen-chart' : ''}`}
      ref={chartWrapperRef}
    >
      {/* Pro Chart Top Header */}
      <div className="chart-header">
        <div className="chart-header-left">
          {/* Real-Time DexScreener Engine Indicator */}
          <div className="dex-chart-engine-badge font-mono">
            <Zap size={13} className="text-pulse-green" />
            <span className="font-bold text-pulse-green">DEXSCREENER CHART</span>
          </div>

          <div className="chart-v-sep"></div>

          {/* Clean Live Status Indicator */}
          <div className="chart-live-status font-mono">
            <span className="live-dot"></span>
            <span className="chart-live-text">LIVE</span>
          </div>

          {pair && (
            <div className="chart-pair-chip font-mono">
              <span className="chart-pair-sym">{baseSymbol}/{quoteSymbol}</span>
              <span className="chart-dex-name">{pair.dexId?.toUpperCase() || 'PULSEX'}</span>
            </div>
          )}
        </div>

        {/* Header Right: Controls & Direct Link */}
        <div className="chart-header-right font-mono">
          <button
            className={`btn-icon ${isReloading ? 'is-loading' : ''}`}
            onClick={reloadChart}
            title="Reload Live Chart"
          >
            <RefreshCw size={13} className={isReloading ? 'animate-spin' : ''} />
            <span className="btn-icon-label">Reload</span>
          </button>

          <button
            className="btn-icon"
            onClick={handleShare}
            title="Copy Direct Link to Pair"
          >
            {copiedLink ? <Check size={13} className="text-pulse-green" /> : <Share2 size={13} />}
            <span className="btn-icon-label">{copiedLink ? 'Copied' : 'Share'}</span>
          </button>

          {pair?.baseToken?.address && (
            <a
              href={swapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-icon text-pulse-green chart-trade-btn"
              title="Trade on PulseX"
            >
              <ArrowLeftRight size={13} />
              <span className="btn-icon-label">Trade</span>
            </a>
          )}

          <a
            href={`https://dexscreener.com/pulsechain/${activePairAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-icon text-pulse-cyan"
            title="Open in DexScreener"
          >
            <ExternalLink size={13} />
            <span className="btn-icon-label">DexScreener</span>
          </a>

          <button
            className="btn-icon ml-1"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Chart'}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Embedded Real-Time DexScreener Chart Frame */}
      <div className="chart-iframe-container">
        <iframe
          key={`${activePairAddress}-${keyCounter}`}
          src={embedUrl}
          title="DexScreener Real-Time Live Chart"
          className="dexscreener-iframe"
          allow="clipboard-write"
          loading="eager"
        ></iframe>
      </div>
    </div>
  )
}
