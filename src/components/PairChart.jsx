import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart,
  CrosshairMode,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
} from 'lightweight-charts'
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { getPoolCandles, CHART_INTERVALS, DEFAULT_INTERVAL } from '../services/geckoterminal'
import { legendForCandle, activeCandle, DIRECTION } from '../utils/chartLegend'
import { EMA_PERIODS, SMA_PERIODS, RSI_BANDS, PANES } from '../config/chartTools'
import { sma, ema, bollinger, rsi, macd } from '../utils/indicators'
import ChartToolbar from './ChartToolbar'
import ChartDrawingTools from './ChartDrawingTools'
import ChartStudyButtons from './ChartStudyButtons'
import { useChartSettings } from '../hooks/useChartSettings'
import { useChartDrawings, attachDrawingHandlers } from '../hooks/useChartDrawings'
import { createDrawingPrimitive, makeProjector } from './chart/drawingPrimitive'

/** Axis and crosshair prices, tuned for values that run to eight decimals. */
function formatPrice(value) {
  const n = Number(value)
  if (!isFinite(n) || n === 0) return '0'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n >= 1) return n.toFixed(4)
  if (n >= 0.0001) return n.toFixed(6)
  return n.toExponential(4)
}

const UP = '#00ff9d'
const DOWN = '#f43f5e'
const ACCENT = '#00e5ff'

/** Which series constructor and options each chart type needs. */
function priceSeriesSpec(type, priceFormat) {
  switch (type) {
    case 'bars':
      return [BarSeries, { upColor: UP, downColor: DOWN, thinBars: false, priceFormat }]
    case 'line':
      return [LineSeries, { color: ACCENT, lineWidth: 2, priceFormat }]
    case 'area':
      return [
        AreaSeries,
        {
          lineColor: ACCENT,
          lineWidth: 2,
          topColor: 'rgba(0,229,255,0.28)',
          bottomColor: 'rgba(0,229,255,0.02)',
          priceFormat,
        },
      ]
    default:
      return [
        CandlestickSeries,
        {
          upColor: UP,
          downColor: DOWN,
          // No border: at this bar width a 1px border eats most of the body.
          borderVisible: false,
          wickUpColor: 'rgba(0,255,157,0.8)',
          wickDownColor: 'rgba(244,63,94,0.8)',
          priceFormat,
        },
      ]
  }
}

/** Candlestick and bar series want OHLC; line and area want a single value. */
function priceData(type, candles) {
  if (type === 'line' || type === 'area') {
    return candles.map((c) => ({ time: c.time, value: c.close }))
  }
  return candles
}

/**
 * The pair chart, drawn from pool data.
 *
 * Replaces the DexScreener iframe as the default view. That embed renders fine
 * as a top-level page but hangs inside a cross-origin frame - re-tested and
 * still hanging - so the chart that shipped could silently show nothing at
 * all, which is the one thing a chart must not do.
 *
 * Series are managed in two effects rather than one. The first owns which
 * series exist and rebuilds them when the reader changes a setting; the second
 * only feeds them data. Kept together, every thirty-second refresh would tear
 * down and rebuild every study, losing the reader's zoom each time.
 */
export default function PairChart({
  pairAddress,
  tokenAddress,
  baseSymbol,
  quoteSymbol,
  height = 460,
  onDataError,
}) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef({ price: null, overlays: [], panes: [] })

  /** Set the instant teardown begins, before the chart is actually removed. */
  const disposedRef = useRef(false)

  const [interval, setInterval] = useState(DEFAULT_INTERVAL)
  // The candle under the crosshair. Null means the pointer is off the chart,
  // which the readout treats as "the latest" rather than as nothing.
  const [hoveredTime, setHoveredTime] = useState(null)
  const { settings, update, toggleMa, togglePane, setRsiPeriod, reset } = useChartSettings()
  const draw = useChartDrawings(pairAddress)

  /*
   * What the drawing layer reads, held in a ref.
   *
   * The primitive is attached to the chart and outlives React's renders; if it
   * closed over state it would need detaching and reattaching on every pointer
   * move during a drag. Instead the ref is updated and the layer is asked to
   * repaint.
   */
  const drawStateRef = useRef({ drawings: [], draft: null, selectedId: null, candles: [] })
  const primitiveRef = useRef(null)

  /*
   * A live view of the drawing state for the pointer handlers.
   *
   * They are attached once per chart rather than per render, so they cannot
   * close over the values directly - this ref is what keeps them current.
   */
  const drawApiRef = useRef({ state: {}, actions: {} })
  drawApiRef.current = {
    state: {
      tool: draw.tool,
      draft: draw.draft,
      style: draw.style,
      magnet: draw.magnet,
      drawings: draw.drawings,
    },
    actions: {
      commit: draw.commit,
      setDraft: draw.setDraft,
      setTool: draw.setTool,
      setSelectedId: draw.setSelectedId,
    },
  }

  /*
   * Bumped whenever the series are rebuilt, so the data effect knows to feed
   * the new ones. Without it, a settings change would create empty series and
   * nothing would draw until the next poll.
   */
  const [seriesVersion, setSeriesVersion] = useState(0)

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
    queryKey: ['poolCandles', pairAddress?.toLowerCase(), tokenAddress?.toLowerCase(), interval],
    queryFn: () => getPoolCandles(pairAddress, interval, { tokenAddress }),
    enabled: Boolean(pairAddress),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  })

  /*
   * Measure once, synchronously, before paint.
   *
   * The frame loop below cannot be the only way this happens. Animation frames
   * do not run in a background tab or a hidden pane, so a chart opened while
   * the tab was not in front waited for focus before it built at all - it sat
   * as an empty box with no spinner and no error, because as far as the
   * component was concerned it had simply never been measured. When the
   * container already has a size there is nothing to wait for.
   */
  useLayoutEffect(() => {
    const el = containerRef.current
    if (el && el.clientWidth > 0 && el.clientHeight > 0) setMeasured(true)
  }, [])

  /**
   * Then watch for changes on an animation frame.
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

        /*
         * Resizing a disposed chart throws from inside the library, and the
         * ref alone does not prove the chart is alive: it is nulled in a
         * cleanup that runs after `remove()`, leaving a window in which the
         * ref still points at a dead object.
         */
        if (!disposedRef.current) chartRef.current?.resize(w, h)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Build the chart once the container is real. Series are added separately.
  useEffect(() => {
    const el = containerRef.current
    if (!el || !measured) return undefined

    disposedRef.current = false

    const chart = createChart(el, {
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
        /*
         * Follows the cursor, and only snaps when the magnet is on.
         *
         * This was set to Magnet - which is also the library's own default, so
         * it would have been wrong even left unset. The crosshair jumped to the
         * nearest candle whatever the pointer was doing, which makes reading a
         * price between bars impossible and fights every drawing placed at a
         * free position. The magnet button now drives it, below.
         */
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(0,229,255,0.4)', width: 1, style: 3, labelBackgroundColor: ACCENT },
        horzLine: { color: 'rgba(0,229,255,0.4)', width: 1, style: 3, labelBackgroundColor: ACCENT },
      },
      localization: { priceFormatter: formatPrice },
    })

    chartRef.current = chart

    /*
     * Track which candle the pointer is over, for the readout.
     *
     * `param.time` is absent whenever the crosshair leaves the data - off the
     * plot, or past the last bar - and that is reported as null rather than
     * held at the last value, so the readout falls back to the latest candle
     * instead of freezing on whatever was under the cursor when it left.
     */
    const onCrosshair = (param) => {
      if (disposedRef.current) return
      setHoveredTime(param?.time ?? null)
    }
    chart.subscribeCrosshairMove(onCrosshair)

    return () => {
      // Flagged before the removal, not after, so nothing can reach a chart
      // that is mid-teardown.
      disposedRef.current = true
      chart.unsubscribeCrosshairMove(onCrosshair)
      chart.remove()
      chartRef.current = null
      seriesRef.current = { price: null, overlays: [], panes: [] }
    }
  }, [measured])

  // Derived rather than stored: the readout is a view of the candles, and
  // keeping a second copy in state is how the two drift apart.
  const legend = legendForCandle(activeCandle(candles, hoveredTime))

  /*
   * Own the set of series.
   *
   * Re-runs only when the reader changes something structural - chart type, an
   * overlay, a study pane - and rebuilds every series from scratch. Rebuilding
   * rather than patching keeps pane indices honest: panes are addressed by
   * position, so switching volume off has to move RSI up a slot rather than
   * leave a hole.
   */
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !measured) return undefined

    const priceFormat = { type: 'custom', formatter: formatPrice, minMove: 0.0000000001 }
    const [Ctor, options] = priceSeriesSpec(settings.type, priceFormat)
    const price = chart.addSeries(Ctor, options)

    const line = (color, extra = {}) =>
      chart.addSeries(LineSeries, {
        color,
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: false,
        ...extra,
      })

    const colorFor = (list, period) => list.find((o) => o.period === period)?.color || ACCENT

    const overlays = [
      ...settings.ema.map((period) => ({
        kind: 'ema',
        period,
        series: line(colorFor(EMA_PERIODS, period)),
      })),
      ...settings.sma.map((period) => ({
        kind: 'sma',
        period,
        series: line(colorFor(SMA_PERIODS, period)),
      })),
      // Three lines belonging to one toggle, created and removed together.
      ...(settings.bollinger
        ? ['upper', 'middle', 'lower'].map((band) => ({
            kind: 'bollinger',
            band,
            series: line('#7c8b99', {
              lineWidth: 1,
              lineStyle: band === 'middle' ? 0 : 2,
              crosshairMarkerVisible: false,
            }),
          }))
        : []),
    ]

    // Panes are numbered from the price pane down, over whichever are enabled.
    const enabledPanes = PANES.filter((p) => settings.panes[p.id])
    const panes = enabledPanes.map((p, i) => {
      const index = i + 1
      const made = { spec: p, index, series: [] }

      if (p.id === 'volume') {
        made.series.push(
          chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' }, index)
        )
      }

      if (p.id === 'rsi') {
        const line = chart.addSeries(
          LineSeries,
          {
            color: ACCENT,
            lineWidth: 1.5,
            priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
            lastValueVisible: true,
          },
          index
        )
        // The bands that make the number mean something.
        for (const level of RSI_BANDS) {
          line.createPriceLine({
            price: level,
            color: 'rgba(255,255,255,0.18)',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: '',
          })
        }
        made.series.push(line)
      }

      if (p.id === 'macd') {
        const fmt = { type: 'price', precision: 8, minMove: 0.00000001 }
        made.series.push(
          chart.addSeries(HistogramSeries, { priceFormat: fmt, priceScaleId: '' }, index),
          chart.addSeries(LineSeries, { color: ACCENT, lineWidth: 1.5, priceFormat: fmt, lastValueVisible: false }, index),
          chart.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 1.5, priceFormat: fmt, lastValueVisible: false }, index)
        )
      }

      return made
    })

    // Give each study pane a height; the price pane keeps the rest.
    const allPanes = chart.panes()
    enabledPanes.forEach((p, i) => allPanes[i + 1]?.setHeight(p.height))

    // The drawing layer rides on the price series, so it repaints with it and
    // sits above every study.
    const primitive = createDrawingPrimitive(drawStateRef)
    price.attachPrimitive(primitive)
    primitiveRef.current = primitive

    seriesRef.current = { price, overlays, panes }
    setSeriesVersion((v) => v + 1)

    return () => {
      // Remove by hand rather than leaning on chart teardown: the chart
      // outlives this effect, and a leaked series keeps drawing.
      try {
        price.detachPrimitive(primitive)
        primitiveRef.current = null
        for (const p of panes) for (const s of p.series) chart.removeSeries(s)
        for (const o of overlays) chart.removeSeries(o.series)
        chart.removeSeries(price)
      } catch {
        // The chart was disposed first; nothing left to detach from.
      }
      seriesRef.current = { price: null, overlays: [], panes: [] }
    }
  }, [measured, settings.type, settings.ema, settings.sma, settings.bollinger, settings.panes])

  /*
   * The crosshair follows the magnet button.
   *
   * `MagnetOHLC` rather than plain `Magnet`: it snaps to the open, high, low
   * and close, which is exactly where drawing anchors snap when the magnet is
   * on. Plain Magnet snaps to the series value alone, so the crosshair and the
   * anchor it is helping to place would disagree about where the candle is.
   */
  useEffect(() => {
    if (!chartRef.current || !measured) return
    chartRef.current.applyOptions({
      crosshair: { mode: draw.magnet ? CrosshairMode.MagnetOHLC : CrosshairMode.Normal },
    })
  }, [draw.magnet, measured])

  // Log or linear, applied without rebuilding anything.
  useEffect(() => {
    if (!chartRef.current || !measured) return
    // 1 is logarithmic, 0 normal - the library's PriceScaleMode.
    chartRef.current.priceScale('right').applyOptions({ mode: settings.logScale ? 1 : 0 })
  }, [settings.logScale, measured, seriesVersion])

  // Feed whatever series currently exist.
  useEffect(() => {
    const chart = chartRef.current
    const refs = seriesRef.current
    if (!chart || !refs.price || !candles?.length) return

    refs.price.setData(priceData(settings.type, candles))

    // Computed once per refresh even when three averages are on, because the
    // bands come as a set.
    const bands = settings.bollinger ? bollinger(candles, 20, 2) : null

    for (const { kind, period, band, series } of refs.overlays) {
      if (kind === 'ema') series.setData(ema(candles, period))
      else if (kind === 'sma') series.setData(sma(candles, period))
      else if (kind === 'bollinger') series.setData(bands?.[band] || [])
    }

    for (const pane of refs.panes) {
      if (pane.spec.id === 'volume') {
        pane.series[0].setData(
          candles.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(0,255,157,0.35)' : 'rgba(244,63,94,0.35)',
          }))
        )
      }

      if (pane.spec.id === 'rsi') pane.series[0].setData(rsi(candles, settings.rsiPeriod))

      if (pane.spec.id === 'macd') {
        const m = macd(candles, 12, 26, 9)
        pane.series[0].setData(
          m.histogram.map((h) => ({
            time: h.time,
            value: h.value,
            color: h.value >= 0 ? 'rgba(0,255,157,0.45)' : 'rgba(244,63,94,0.45)',
          }))
        )
        pane.series[1].setData(m.macd)
        pane.series[2].setData(m.signal)
      }
    }

    chart.timeScale().scrollToRealTime()
  }, [candles, settings.type, settings.bollinger, settings.rsiPeriod, seriesVersion])

  // Push drawing state to the layer and ask it to repaint.
  useEffect(() => {
    drawStateRef.current = {
      drawings: draw.drawings,
      draft: draw.draft,
      selectedId: draw.selectedId,
      candles: candles || [],
    }
    primitiveRef.current?.refresh()
  }, [draw.drawings, draw.draft, draw.selectedId, candles, seriesVersion])

  /*
   * Pointer handling, wired once the chart and its series exist.
   *
   * The handlers need to convert pixels into a time and a price, which only
   * the live chart can do, so they are attached here rather than in the hook
   * and torn down whenever the series are rebuilt.
   */
  useEffect(() => {
    const el = containerRef.current
    const chart = chartRef.current
    const price = seriesRef.current.price
    if (!el || !chart || !price) return undefined

    return attachDrawingHandlers({
      element: el,
      getContext: () => {
        const series = seriesRef.current.price
        if (!chartRef.current || !series) return null
        return {
          chart: chartRef.current,
          series,
          candles: drawStateRef.current.candles,
          project: () =>
            makeProjector({
              chart: chartRef.current,
              series,
              candles: drawStateRef.current.candles,
            }),
        }
      },
      state: () => drawApiRef.current.state,
      actions: drawApiRef.current.actions,
    })
    /*
     * Deliberately not keyed on the drawing state.
     *
     * The handlers read it through `state()` on every event, so they never go
     * stale - and keying the effect on it would tear them down and rebuild
     * them on every commit, which during a drag means every pointer move.
     * The in-progress gesture lives inside the closure, so that rebuild would
     * drop it and the drag would stop after one step.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesVersion])

  /*
   * Tell the owner when there is nothing to draw.
   *
   * Reported only when the failure leaves the chart blank - a refresh that
   * fails over candles already on screen is not worth swapping the whole chart
   * for. The owner uses this to fall back to the embed.
   */
  const blankFailure = isError && !candles?.length
  useEffect(() => {
    if (blankFailure) onDataError?.(error)
  }, [blankFailure, error, onDataError])

  const empty = !isLoading && !isError && candles && candles.length === 0

  return (
    <div className="pair-chart">
      <div className="pair-chart-bar">
        <span className="pair-chart-pair">
          {baseSymbol}/{quoteSymbol}
        </span>

        <span className="bar-sep" aria-hidden="true" />

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

        <span className="bar-sep" aria-hidden="true" />

        <ChartToolbar
          settings={settings}
          onTypeChange={(type) => update({ type })}
          onToggleLog={() => update({ logScale: !settings.logScale })}
          onTogglePane={togglePane}
          onReset={reset}
        />

        {/* Quiet marker for a failed refresh over data we still hold. */}
        {isError && candles?.length > 0 && (
          <span className="pair-chart-stale" title={error?.message || 'Last refresh failed'}>
            <AlertTriangle size={11} />
          </span>
        )}

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

      <div className={`pair-chart-body ${draw.tool ? 'is-drawing' : ''}`} style={{ height }}>
        <ChartDrawingTools
          tool={draw.tool}
          onToolChange={draw.setTool}
          style={draw.activeStyle}
          onStyleChange={draw.applyStyle}
          magnet={draw.magnet}
          onToggleMagnet={() => draw.setMagnet((v) => !v)}
          selectedId={draw.selectedId}
          onDeleteSelected={() => draw.remove(draw.selectedId)}
          onClearAll={draw.clearAll}
          hasDrawings={draw.hasDrawings}
        >
          <ChartStudyButtons
            settings={settings}
            onToggleMa={toggleMa}
            onTogglePane={togglePane}
            onSetRsiPeriod={setRsiPeriod}
            onToggleBollinger={() => update({ bollinger: !settings.bollinger })}
          />
        </ChartDrawingTools>

        <div ref={containerRef} className="pair-chart-canvas" />

        {/* The OHLC readout.
            Sits over the plot rather than in the bar above it, because it
            describes whatever the pointer is on and belongs next to it. Pointer
            events pass straight through - a readout that swallowed the
            crosshair would blank itself wherever it sat. */}
        {legend && (
          <div className="pair-chart-legend" aria-live="off">
            <span className="pcl-pair">
              {baseSymbol}/{quoteSymbol}
            </span>
            <span className="pcl-tf">{interval.toUpperCase()}</span>
            <span className="pcl-cell">
              <em>O</em>
              {legend.open}
            </span>
            <span className="pcl-cell">
              <em>H</em>
              {legend.high}
            </span>
            <span className="pcl-cell">
              <em>L</em>
              {legend.low}
            </span>
            <span className="pcl-cell">
              <em>C</em>
              {legend.close}
            </span>
            {legend.changeLabel && (
              <span
                className={`pcl-change ${
                  legend.direction === DIRECTION.up
                    ? 'is-up'
                    : legend.direction === DIRECTION.down
                      ? 'is-down'
                      : ''
                }`}
              >
                {legend.changeLabel}
              </span>
            )}
            {legend.volume && (
              <span className="pcl-cell pcl-vol">
                <em>Vol</em>
                {legend.volume}
              </span>
            )}
          </div>
        )}

        {isLoading && (
          <div className="pair-chart-state">
            <Loader2 size={17} className="dex-spin" />
            <span>Loading chart…</span>
          </div>
        )}

        {/*
          A chart that fails says so and offers a way out, rather than sitting
          on a spinner the way the embed did - but only when it has nothing to
          show. A failed refresh over candles already drawn is not an outage:
          covering a good chart, and the reader's own drawings, with a blocking
          error because the next poll was rate limited is worse than quietly
          keeping the last good data.
        */}
        {isError && !candles?.length && (
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
