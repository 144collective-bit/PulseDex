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
import { buildPulseXSwapUrl } from '../utils/formatters'

const CHART_HEIGHT_KEY = 'pulsedex_chart_height'
const MIN_CHART_HEIGHT = 260
const MAX_CHART_HEIGHT = 1400
const HEIGHT_STEP = 40

export default function TradingChart({ pair, pairAddress }) {
  const chartWrapperRef = useRef(null)
  const frameRef = useRef(null)
  const dragRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [keyCounter, setKeyCounter] = useState(0)
  const [isReloading, setIsReloading] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  // null = follow the responsive default height from CSS
  const [chartHeight, setChartHeight] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(CHART_HEIGHT_KEY))
      return saved >= MIN_CHART_HEIGHT && saved <= MAX_CHART_HEIGHT ? saved : null
    } catch {
      return null
    }
  })

  const clampHeight = (h) => Math.min(MAX_CHART_HEIGHT, Math.max(MIN_CHART_HEIGHT, Math.round(h)))

  const persistHeight = (h) => {
    try {
      localStorage.setItem(CHART_HEIGHT_KEY, String(h))
    } catch {
      // Storage unavailable (private mode) — the height still applies for this session.
    }
  }

  const startResize = (e) => {
    if (isFullscreen || !frameRef.current) return
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startHeight: frameRef.current.offsetHeight }
    setIsResizing(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onResizeMove = (e) => {
    if (!dragRef.current) return
    const { startY, startHeight } = dragRef.current
    setChartHeight(clampHeight(startHeight + (e.clientY - startY)))
  }

  const endResize = (e) => {
    if (!dragRef.current) return
    dragRef.current = null
    setIsResizing(false)
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (frameRef.current) persistHeight(frameRef.current.offsetHeight)
  }

  // Keyboard resizing so the handle is usable without a pointer
  const onHandleKeyDown = (e) => {
    if (!frameRef.current) return
    const current = frameRef.current.offsetHeight
    let next = null
    if (e.key === 'ArrowUp') next = clampHeight(current - HEIGHT_STEP)
    else if (e.key === 'ArrowDown') next = clampHeight(current + HEIGHT_STEP)
    else if (e.key === 'Home') next = MIN_CHART_HEIGHT
    else if (e.key === 'End') next = MAX_CHART_HEIGHT
    if (next === null) return
    e.preventDefault()
    setChartHeight(next)
    persistHeight(next)
  }

  // Double-click the handle to return to the responsive default
  const resetHeight = () => {
    setChartHeight(null)
    try {
      localStorage.removeItem(CHART_HEIGHT_KEY)
    } catch {
      // Nothing to clear if storage is unavailable.
    }
  }

  const activePairAddress =
    pairAddress || pair?.pairAddress || '0x1b45b9148791d3a104184Cd5DFE5CE57193a3ee9'
  const baseSymbol = pair?.baseToken?.symbol || 'TOKEN'
  const quoteSymbol = pair?.quoteToken?.symbol || 'PLS'

  // Official DexScreener Real-Time Live Embed URL for PulseChain (Sound Muted)
  const embedUrl = `https://dexscreener.com/pulsechain/${activePairAddress}?embed=1&theme=dark&trades=0&info=0&sound=0`
  const swapUrl = buildPulseXSwapUrl(pair?.quoteToken?.address, pair?.baseToken?.address)

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
      className={`trading-chart-wrapper glass-panel ${isFullscreen ? 'fullscreen-chart' : ''} ${isResizing ? 'is-resizing' : ''}`}
      ref={chartWrapperRef}
      style={chartHeight ? { '--chart-h': `${chartHeight}px` } : undefined}
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
      <div className="chart-iframe-container" ref={frameRef}>
        <iframe
          key={`${activePairAddress}-${keyCounter}`}
          src={embedUrl}
          title="DexScreener Real-Time Live Chart"
          className="dexscreener-iframe"
          allow="clipboard-write"
          loading="eager"
        ></iframe>
      </div>

      {/* Drag to resize the chart; the panels below take up the slack. */}
      {!isFullscreen && (
        <div
          className="chart-resize-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize chart height"
          tabIndex={0}
          onPointerDown={startResize}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onKeyDown={onHandleKeyDown}
          onDoubleClick={resetHeight}
          title="Drag to resize · double-click to reset"
        >
          <span className="chart-resize-grip" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}
