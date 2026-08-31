import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  RefreshCw,
  Zap,
  ArrowLeftRight,
  Share2,
  Check,
  CandlestickChart,
  AlertTriangle,
} from 'lucide-react'
import { buildPulseXSwapUrl } from '../utils/formatters'
import PairChart from './PairChart'
import '../styles/dex.css'

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

  /*
   * Which chart to show. Ours by default: the DexScreener embed renders fine
   * as a top-level page but hangs on "Loading pair…" inside a cross-origin
   * frame, whatever permissions the frame is given, because its chart needs
   * storage the browser partitions away from third-party frames. The embed
   * stays available for anyone who prefers it, but it cannot be the thing the
   * page depends on.
   */
  const [source, setSource] = useState('native')

  /*
   * Whether the fallback below has already fired for this pair.
   *
   * Once only: if the embed also fails to render there is nothing to be gained
   * by bouncing between two blank charts, and a reader who switches back
   * deliberately should stay switched back.
   */
  const [autoSwitched, setAutoSwitched] = useState(false)

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
  // A new pair deserves a fresh attempt at our own chart.
  useEffect(() => {
    setAutoSwitched(false)
    setSource('native')
  }, [pairAddress, pair?.pairAddress])

  const baseSymbol = pair?.baseToken?.symbol || 'TOKEN'
  /*
   * Which token the series should price.
   *
   * The two APIs do not agree on which side of a pool is the base. DexScreener
   * calls the pinned PLS pool WPLS/DAI; GeckoTerminal, which serves the chart,
   * calls the same pool DAI/WPLS - so the chart plotted DAI at about $1.00
   * under a WPLS heading, beside a price that said $0.0000113. Naming the
   * token settles it, and the chart then always plots whatever the header says
   * it is showing.
   */
  const baseTokenAddress = pair?.baseToken?.address || null
  const quoteSymbol = pair?.quoteToken?.symbol || 'PLS'

  // Official DexScreener Real-Time Live Embed URL for PulseChain (Sound Muted)
  /**
   * Fall back to the embed when our own chart comes up empty.
   *
   * The data behind the live chart is rate limited by address, and it signals
   * a limit by dropping its CORS header rather than returning a status - so
   * from here it is indistinguishable from being offline. Rather than leave
   * the reader looking at an error, the embed gets a turn.
   *
   * It is not a guaranteed rescue: DexScreener's embed needs storage the
   * browser partitions away from third-party frames, and in many browsers it
   * hangs on its own loading state. Hence the notice, and the way back.
   */
  const handleDataError = useCallback(() => {
    setAutoSwitched((already) => {
      if (already) return already
      setSource('embed')
      return true
    })
  }, [])

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
            {/* Names whichever chart is actually on screen. Left as
                "DEXSCREENER CHART" it labelled our own chart as someone
                else's. */}
            <span className="font-bold text-pulse-green">
              {source === 'native' ? 'LIVE CHART' : 'DEXSCREENER CHART'}
            </span>
          </div>

          <div className="chart-v-sep"></div>

          <div className="chart-source-toggle font-mono" role="group" aria-label="Chart source">
            <button
              type="button"
              className={`chart-source-btn ${source === 'native' ? 'active' : ''}`}
              onClick={() => setSource('native')}
            >
              PulseDex
            </button>
            <button
              type="button"
              className={`chart-source-btn ${source === 'embed' ? 'active' : ''}`}
              onClick={() => setSource('embed')}
              title="DexScreener's own embed. It does not render in every browser."
            >
              DexScreener
            </button>
          </div>

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

          {/*
            Switches the chart in place rather than sending the reader away.
            The link out survives as the icon beside it, because that is the
            path that always works when the embed will not render.
          */}
          <button
            type="button"
            className={`btn-icon ${source === 'embed' ? 'text-pulse-cyan is-active' : ''}`}
            onClick={() => setSource(source === 'embed' ? 'native' : 'embed')}
            aria-pressed={source === 'embed'}
            title={
              source === 'embed'
                ? 'Showing the DexScreener chart — switch back to the live chart'
                : "Show DexScreener's chart here instead"
            }
          >
            <CandlestickChart size={13} />
            <span className="btn-icon-label">
              {source === 'embed' ? 'Live chart' : 'DexScreener'}
            </span>
          </button>

          <a
            href={`https://dexscreener.com/pulsechain/${activePairAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-icon"
            title="Open this pair on DexScreener in a new tab"
            aria-label="Open on DexScreener"
          >
            <ExternalLink size={13} />
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

      {/*
        Says why the chart changed under the reader.
        A silent swap to a different provider's chart is the kind of thing that
        reads as a bug.
      */}
      {autoSwitched && source === 'embed' && (
        <div className="chart-fallback-note font-mono">
          <AlertTriangle size={12} />
          <span>
            Live chart data is rate limited — showing DexScreener&apos;s chart instead.
          </span>
          <button type="button" className="chart-fallback-back" onClick={() => setSource('native')}>
            Try the live chart
          </button>
        </div>
      )}

      <div className="chart-iframe-container" ref={frameRef}>
        {source === 'native' ? (
          <PairChart
            key={activePairAddress}
            pairAddress={activePairAddress}
            tokenAddress={baseTokenAddress}
            baseSymbol={baseSymbol}
            quoteSymbol={quoteSymbol}
            height="100%"
            onDataError={handleDataError}
          />
        ) : (
          <iframe
            key={`${activePairAddress}-${keyCounter}`}
            src={embedUrl}
            title="DexScreener Real-Time Live Chart"
            className="dexscreener-iframe"
            allow="clipboard-write"
            loading="eager"
          ></iframe>
        )}
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
