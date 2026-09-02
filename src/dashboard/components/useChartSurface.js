import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'

/**
 * The lifecycle every chart module needs, in one place.
 *
 * This exists because getting a lightweight-charts instance to appear inside a
 * resizable grid module took three separate corrections, none of them obvious,
 * and every new chart module would otherwise rediscover them:
 *
 *  1. The container must be mounted before the chart is built, so a module that
 *     returns a loading state instead of its container never gets a chart at
 *     all - the effect runs once against a null ref and never again.
 *  2. The chart must not be built until the container has a real size. Built at
 *     zero it keeps its canvases at the library's default 300x150 bitmap while
 *     reporting the right CSS size: laid out correctly, painting nothing, and
 *     unrecoverable by resizing afterwards.
 *  3. The series has to be state rather than a ref. StrictMode builds, tears
 *     down and rebuilds in development, and a series held in a ref leaves the
 *     effect that feeds it pointing at the discarded one.
 *
 * Measurement is a layout effect plus a ResizeObserver, deliberately not an
 * animation-frame loop: frames stop entirely while the document is hidden, and
 * a chart gated on a frame that never arrives never appears.
 *
 * @param {object} options
 * @param {import('lightweight-charts').SeriesDefinition} options.seriesType
 * @param {object} [options.seriesOptions]
 * @param {object} [options.chartOptions] Merged over the shared PulseDEX styling.
 * @param {unknown} [options.rebuildKey] Change to rebuild the chart and series.
 * @returns {{containerRef: React.RefObject<HTMLDivElement>, chart: object|null, series: object|null}}
 */
export function useChartSurface({ seriesType, seriesOptions, chartOptions, rebuildKey }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const [series, setSeries] = useState(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      // A zero is a collapsed or hidden module; keeping the last real size means
      // switching tabs does not tear the chart down.
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
      ...chartOptions,
    })

    const created = chart.addSeries(seriesType, seriesOptions)
    chartRef.current = chart
    setSeries(created)

    return () => {
      chart.remove()
      chartRef.current = null
      setSeries(null)
    }
    // `seriesOptions` and `chartOptions` are intentionally not dependencies:
    // callers pass object literals, and rebuilding the chart on every render
    // would throw away the user's zoom continuously. `rebuildKey` is the
    // explicit way to ask for a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rebuildKey, seriesType])

  /* Resizing is separate from building, so dragging a module's corner moves the
     chart rather than tearing it down on every frame of the drag. */
  useEffect(() => {
    if (!chartRef.current || !ready) return
    chartRef.current.resize(size.w, size.h)
  }, [size, ready])

  return { containerRef, chart: chartRef.current, series }
}
