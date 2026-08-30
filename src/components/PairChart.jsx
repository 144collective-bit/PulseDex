import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { getPoolCandles, CHART_INTERVALS, DEFAULT_INTERVAL } from '../services/geckoterminal'

/** Axis and crosshair prices, tuned for values that run to eight decimals. */
function formatPrice(value) {
  const n = Number(value)
  if (!isFinite(n) || n === 0) return '0'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n >= 1) return n.toFixed(4)
  if (n >= 0.0001) return n.toFixed(6)
  return n.toExponential(4)
}

/**
 * Candlestick chart drawn from pool data.
 *
 * Replaces the DexScreener iframe as the default view. That embed renders
 * fine as a top-level page but hangs inside a cross-origin frame, so the chart
 * that shipped could silently show nothing at all - which is the one thing a
 * chart must not do.
 */
export default function PairChart({ pairAddress, baseSymbol, quoteSymbol, height = 460 }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const [interval, setInterval] = useState(DEFAULT_INTERVAL)

  /*
   * Whether the container has real dimensions yet.
   *
   * The screener mounts this inside a sub-tab that starts `display: none`, so
   * the box is 0x0 at mount. A chart built at that size stayed at the
   * library's 300x150 default and never recovered when the tab was opened -
   * resizing it afterwards did not repaint it. So it is not built until there
   * is something to build it into.
   */
  const [measured, setMeasured] = useState(false)

  const { data: candles, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['poolCandles', pairAddress?.toLowerCase(), interval],
    queryFn: () => getPoolCandles(pairAddress, interval),
    enabled: Boolean(pairAddress),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  })

  /**
   * Watch the container's size on an animation frame.
   *
   * ResizeObserver was the obvious tool and proved unreliable here: for an
   * element inside a `display: none` sub-tab it did not deliver even the
   * initial callback, so the chart was either never built or built at the
   * library's default size and left drawing nothing at full width. A frame
   * loop cannot miss the transition, costs two integer comparisons, and stops
   * as soon as the component unmounts.
   */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    let raf = 0
    let lastW = 0
    let lastH = 0

    const tick = () => {
      const w = el.clientWidth
      const h = el.clientHeight

      if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
        lastW = w
        lastH = h
        setMeasured(true)
        chartRef.current?.chart.resize(w, h)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Build the chart once the container is real; data arrives via setData below.
  useEffect(() => {
    const el = containerRef.current
    if (!el || !measured) return undefined

    const chart = createChart(el, {
      /*
       * Sized explicitly by the observer below rather than by `autoSize`.
       * The screener builds this chart inside a sub-tab that starts
       * `display: none`, so the container is 0x0 at creation; autoSize left
       * the canvases at their 300x150 default and they never recovered when
       * the tab was shown - a full-width panel drawing nothing.
       */
      width: Math.max(el.clientWidth, 1),
      height: Math.max(el.clientHeight, 1),
      layout: {
        background: { color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 11,
        panes: { separatorColor: 'rgba(255,255,255,0.08)' },
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        // A real width per bar rather than squeezing the whole range in.
        barSpacing: 9,
        minBarSpacing: 3,
      },
      crosshair: {
        mode: 1,
        vertLine: { color: 'rgba(0,229,255,0.4)', width: 1, style: 3, labelBackgroundColor: '#00e5ff' },
        horzLine: { color: 'rgba(0,229,255,0.4)', width: 1, style: 3, labelBackgroundColor: '#00e5ff' },
      },
      localization: { priceFormatter: formatPrice },
    })

    const priceFormat = { type: 'custom', formatter: formatPrice, minMove: 0.0000000001 }

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00ff9d',
      downColor: '#f43f5e',
      // No border: at this bar width a 1px border eats most of the body.
      borderVisible: false,
      wickUpColor: 'rgba(0,255,157,0.8)',
      wickDownColor: 'rgba(244,63,94,0.8)',
      priceFormat,
    })

    // Volume in its own pane, so the price scale never reserves room for it -
    // that reservation is what used to drag the price axis below zero.
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'volume' }, priceScaleId: '' },
      1
    )
    chart.panes()[1]?.setHeight(64)

    chartRef.current = { chart, candleSeries, volumeSeries }
    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [measured])

  useEffect(() => {
    const refs = chartRef.current
    if (!refs || !candles?.length) return

    refs.candleSeries.setData(candles)
    refs.volumeSeries.setData(
      candles.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(0,255,157,0.35)' : 'rgba(244,63,94,0.35)',
      }))
    )
    refs.chart.timeScale().scrollToRealTime()
  }, [candles, measured])

  const empty = !isLoading && !isError && candles && candles.length === 0

  return (
    <div className="pair-chart">
      <div className="pair-chart-bar">
        <span className="pair-chart-pair">
          {baseSymbol}/{quoteSymbol}
        </span>

        <div className="pair-chart-intervals" role="group" aria-label="Chart interval">
          {CHART_INTERVALS.map((i) => (
            <button
              key={i.id}
              type="button"
              className={`pair-chart-interval ${interval === i.id ? 'active' : ''}`}
              onClick={() => setInterval(i.id)}
            >
              {i.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="pair-chart-refresh"
          onClick={() => refetch()}
          disabled={isFetching}
          title="Refresh"
          aria-label="Refresh chart"
        >
          <RefreshCw size={13} className={isFetching ? 'dex-spin' : ''} />
        </button>
      </div>

      <div className="pair-chart-body" style={{ height }}>
        <div ref={containerRef} className="pair-chart-canvas" />

        {isLoading && (
          <div className="pair-chart-state">
            <Loader2 size={17} className="dex-spin" />
            <span>Loading chart…</span>
          </div>
        )}

        {/* A chart that fails says so and offers a way out, rather than sitting
            on a spinner the way the embed did. */}
        {isError && (
          <div className="pair-chart-state is-error">
            <AlertTriangle size={17} />
            <span>{error?.message || 'Chart data could not be loaded.'}</span>
            <button type="button" className="btn-sm" onClick={() => refetch()}>
              Try again
            </button>
          </div>
        )}

        {empty && (
          <div className="pair-chart-state">
            <span>No price history for this pool yet.</span>
          </div>
        )}
      </div>
    </div>
  )
}
