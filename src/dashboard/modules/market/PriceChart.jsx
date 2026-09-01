import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  createChart,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
} from 'lightweight-charts'
import { usePairMarket, usePoolCandles } from '../../services/marketData'
import { ModuleEmpty, ModuleError, ModuleLoading } from '../../components/ModuleStates'

/**
 * A chart of any pair.
 *
 * Not HEX-specific and not pinned to a pool: it takes whichever pair it is
 * pointed at - by the dashboard context or by its own settings - finds the
 * deepest market for it, and draws that.
 *
 * This is a deliberately lighter chart than the screener's. That one carries
 * drawing tools, studies and a full toolbar because it is the whole page; a
 * module sized four rows high needs a legible series, not an instrument panel.
 */

const UP = '#00ff9d'
const DOWN = '#f43f5e'
const ACCENT = '#00e5ff'

/** Timeframes, mapped to the ids the OHLCV service expects. */
export const TIMEFRAMES = [
  { value: '15m', label: '15M' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
]

function formatPrice(value) {
  const n = Number(value)
  if (!isFinite(n) || n === 0) return '0'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n >= 1) return n.toFixed(4)
  if (n >= 0.0001) return n.toFixed(6)
  return n.toExponential(4)
}

function seriesSpec(type) {
  switch (type) {
    case 'line':
      return [LineSeries, { color: ACCENT, lineWidth: 2 }]
    case 'area':
      return [AreaSeries, { lineColor: ACCENT, topColor: 'rgba(0,229,255,0.25)', bottomColor: 'rgba(0,229,255,0.02)', lineWidth: 2 }]
    case 'candles':
    default:
      return [
        CandlestickSeries,
        { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN },
      ]
  }
}

export default function PriceChart({ config, context }) {
  const pair = context.following ? context.pair : config.pair
  const { data: market, isLoading: loadingPair } = usePairMarket(pair)
  const poolAddress = market?.pairAddress

  const {
    data: candles,
    isFetching,
    isError,
    error,
    refetch,
  } = usePoolCandles(poolAddress, config.timeframe ?? '1h')

  const containerRef = useRef(null)
  const chartRef = useRef(null)

  /*
   * The series is state, not a ref, and that is load-bearing.
   *
   * StrictMode mounts, tears down and remounts effects in development, so the
   * chart is created, removed and created again. Held in a ref, the second
   * series would be invisible to the effect that feeds it - that effect only
   * re-runs when the candles change, and they have not - so the chart would
   * stay permanently blank. As state, recreating the series re-runs the feed.
   */
  const [series, setSeries] = useState(null)

  /**
   * The container's measured size, and the gate on building the chart.
   *
   * A module is positioned by the grid after its first paint, so on the render
   * that mounts this component the container is still zero-sized. Building the
   * chart then leaves the library holding canvases at their default 300x150
   * bitmap while their CSS box is the full width - a chart that is laid out
   * correctly, reports the right size, and paints nothing. Resizing afterwards
   * does not recover it.
   *
   * So the chart is not created until the container is real, which is the same
   * conclusion the screener's chart reached.
   */
  const [size, setSize] = useState({ w: 0, h: 0 })

  /*
   * Measured in a layout effect, then kept current with a ResizeObserver.
   *
   * Explicitly *not* an animation-frame loop, which is what the screener's
   * chart uses. Frames stop entirely while the document is hidden - a
   * background tab, a restored session, a window behind another - and a chart
   * gated on a frame that never arrives is a chart that never appears. The
   * layout effect runs synchronously after the grid has positioned the module,
   * so the first measurement is already the real one.
   */
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    // A zero here is a module that is genuinely collapsed or hidden; keeping
    // the last real size means a hidden tab does not tear the chart down.
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w > 0 && h > 0) {
        setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
      }
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const ready = size.w > 0 && size.h > 0

  /*
   * Built once the container is real, and once per series type. Rebuilding it
   * when data arrives would throw away the user's zoom and pan on every
   * refresh, which on a polling chart makes it unusable for anything but a
   * glance - so the data goes into the existing series instead.
   */
  useEffect(() => {
    const el = containerRef.current
    if (!el || !ready) return undefined

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { priceFormatter: formatPrice },
    })

    const [Series, options] = seriesSpec(config.chartType)
    const created = chart.addSeries(Series, {
      ...options,
      priceFormat: { type: 'price', precision: 8, minMove: 0.00000001 },
    })
    chartRef.current = chart
    setSeries(created)

    return () => {
      chart.remove()
      chartRef.current = null
      setSeries(null)
    }
  }, [config.chartType, ready])

  /*
   * Resizing is separate from building, so that dragging a module's corner
   * moves the chart rather than tearing it down and rebuilding it on every
   * frame of the drag.
   */
  useEffect(() => {
    if (!chartRef.current || !ready) return
    chartRef.current.resize(size.w, size.h)
  }, [size, ready])

  useEffect(() => {
    if (!series || !candles?.length) return
    const isCandles = (config.chartType ?? 'candles') === 'candles'
    series.setData(
      isCandles ? candles : candles.map((c) => ({ time: c.time, value: c.close })),
    )
    chartRef.current?.timeScale().fitContent()
  }, [series, candles, config.chartType])

  /*
   * Which state to show over the chart, if any.
   *
   * Deliberately computed rather than returned early. The effect above needs
   * `containerRef` to be attached to a real element, and a `return <Loading/>`
   * before the container is rendered means the ref is null when the effect
   * runs - and the effect does not run again when data arrives, so the chart is
   * never created and the module stays permanently blank. The container is
   * always mounted; states are drawn on top of it.
   */
  let state = null
  if (!pair?.base || !pair?.quote) {
    state = (
      <ModuleEmpty
        label="No pair selected"
        hint="Choose one in the toolbar or this module's settings."
      />
    )
  } else if (loadingPair) {
    state = <ModuleLoading label="Loading chart" />
  } else if (!poolAddress) {
    state = (
      <ModuleEmpty
        label={`No pool found for ${pair.base.symbol} / ${pair.quote.symbol}`}
        hint="These two assets may not trade directly against each other."
      />
    )
  } else if (isError) {
    state = <ModuleError onRetry={refetch} detail={error?.message} />
  } else if (!candles?.length) {
    /*
     * Keyed on "is there anything to draw", not on the query's status flags.
     *
     * `placeholderData` keeps the previous response on screen across a refresh,
     * and the cost of that is a window where the query counts as neither
     * loading nor failed while its data is still undefined. Testing the flags
     * let that window through and drew an empty chart with no explanation,
     * which reads as a broken module. Asking about the data instead has no
     * such gap.
     */
    state = isFetching ? (
      <ModuleLoading label="Loading chart" />
    ) : (
      <ModuleEmpty label="No price history for this pool" />
    )
  }

  return (
    <div className="dash-chart-wrap">
      <div className="dash-chart" ref={containerRef} aria-hidden={state ? 'true' : undefined} />
      {state ? <div className="dash-chart-state">{state}</div> : null}
    </div>
  )
}
