import { useCallback, useEffect, useRef, useState } from 'react'
import { useSiweAuth } from '../context/SiweAuthContext'
import { readScoped, writeScoped } from '../utils/profileStorage'
import {
  createDrawing,
  normalizeDrawings,
  hitTest,
  timeAtLogical,
  magnetize,
  TOOLS,
  DEFAULT_COLOR,
} from '../utils/chartDrawings'

const STORE = 'chart_drawings'

/** Below this a press is a click, not a drag - a hand is never quite still. */
const DRAG_THRESHOLD = 3

/**
 * Drawings for one pool: state, interaction and storage.
 *
 * Stored per pool and per account, because a trend line means nothing on a
 * different pair. Guests keep theirs on the device; signing in scopes them to
 * the account, which is the same arrangement the watchlist and the board
 * filters use.
 */
export function useChartDrawings(poolAddress) {
  const { account } = useSiweAuth()
  const key = poolAddress ? `${STORE}:${poolAddress.toLowerCase()}` : null

  const [drawings, setDrawings] = useState([])
  const [tool, setTool] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [magnet, setMagnet] = useState(false)

  /*
   * The style new drawings take, and the one the style menu edits when nothing
   * is selected. Selecting a drawing points the menu at that drawing instead,
   * so one control serves both "what will I draw" and "restyle this".
   */
  const [style, setStyle] = useState({ color: DEFAULT_COLOR, width: 1.5, lineStyle: 'solid' })

  // Guards the write-back, so the first render after a pair or account change
  // cannot persist the previous one's drawings into the new scope.
  const loadedFor = useRef(null)

  useEffect(() => {
    if (!key) return
    const scope = `${key}|${account || 'guest'}`
    setDrawings(normalizeDrawings(readScoped(key, account, null)?.items))
    setSelectedId(null)
    setDraft(null)
    setTool(null)
    loadedFor.current = scope
  }, [key, account])

  const persist = useCallback(
    (items) => {
      if (!key || loadedFor.current !== `${key}|${account || 'guest'}`) return
      writeScoped(key, account, { items })
    },
    [key, account]
  )

  const commit = useCallback(
    (updater) => {
      setDrawings((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        persist(next)
        return next
      })
    },
    [persist]
  )

  const remove = useCallback(
    (id) => {
      commit((prev) => prev.filter((d) => d.id !== id))
      setSelectedId((cur) => (cur === id ? null : cur))
    },
    [commit]
  )

  const clearAll = useCallback(() => {
    commit([])
    setSelectedId(null)
    setDraft(null)
  }, [commit])

  /**
   * Apply a style change to the selection, or to the pen when nothing is held.
   *
   * Restyling the selection also moves the pen, so the next line drawn matches
   * the one just adjusted rather than reverting to whatever came before it.
   */
  const applyStyle = useCallback(
    (patch) => {
      setStyle((prev) => ({ ...prev, ...patch }))
      if (!selectedId) return
      commit((prev) => prev.map((d) => (d.id === selectedId ? { ...d, ...patch } : d)))
    },
    [selectedId, commit]
  )

  /** The style the menu should show: the selection's, or the pen's. */
  const activeStyle = selectedId
    ? drawings.find((d) => d.id === selectedId) || style
    : style

  /*
   * Delete removes the selected drawing.
   *
   * Ignored while the reader is typing: this listens on the document, and a
   * chart open behind the search box must not eat a backspace meant for it.
   */
  useEffect(() => {
    if (!selectedId) return undefined

    const onKeyDown = (e) => {
      const el = document.activeElement
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (typing) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        remove(selectedId)
      }
      if (e.key === 'Escape') setSelectedId(null)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selectedId, remove])

  /** Escape cancels a half-drawn shape and puts the pointer back. */
  useEffect(() => {
    if (!tool) return undefined
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      setDraft(null)
      setTool(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [tool])

  return {
    drawings,
    tool,
    setTool,
    style,
    activeStyle,
    applyStyle,
    magnet,
    setMagnet,
    selectedId,
    setSelectedId,
    draft,
    setDraft,
    commit,
    remove,
    clearAll,
    hasDrawings: drawings.length > 0,
  }
}

/**
 * Turn raw pointer events into drawing actions.
 *
 * Kept apart from the state above because it needs live access to the chart -
 * to convert pixels into a time and a price - which only exists once the chart
 * has been built. The caller wires it up when that happens and tears it down
 * when the chart goes.
 */
/**
 * The fractional bar position under a pixel.
 *
 * `coordinateToLogical` looks like the right call and is not: it rounds to the
 * nearest bar internally, so every anchor landed on a candle however carefully
 * it was placed - four clicks three pixels apart produced two distinct times.
 * The visible logical range is fractional, so interpolating across the time
 * scale's own width gives the real position.
 */
function logicalAtX(chart, x) {
  const ts = chart.timeScale()
  const range = ts.getVisibleLogicalRange()
  const width = ts.width()

  // Falls back to the rounded value rather than failing: a snapped anchor is
  // worse than a free one, but far better than no anchor at all.
  if (!range || !(width > 0)) return ts.coordinateToLogical(x)

  return range.from + (x / width) * (range.to - range.from)
}

export function attachDrawingHandlers({ element, getContext, state, actions }) {
  let press = null

  const toPoint = (event) => {
    const ctx = getContext()
    if (!ctx) return null

    const rect = element.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const price = ctx.series.coordinateToPrice(y)
    const logical = logicalAtX(ctx.chart, x)
    if (price === null || logical === null) return null

    const candles = ctx.candles || []
    if (!candles.length) return null

    /*
     * Anchors land wherever the reader put them.
     *
     * They used to snap to the nearest candle, which made a line impossible to
     * place between two bars or past the last one - and on a daily chart that
     * is a whole day of slack. The time is interpolated from the fractional
     * bar position instead, and extrapolated beyond either end, so a drawing
     * can sit anywhere on the plane. The magnet below is how snapping comes
     * back, when it is wanted.
     */
    const free = { x, y, time: timeAtLogical(candles, logical), price }
    if (free.time === null) return null

    if (!state().magnet) return free

    const snapped = magnetize(candles, logical, price)
    return snapped ? { x, y, ...snapped } : free
  }

  const onPointerDown = (event) => {
    if (event.button !== 0) return
    const ctx = getContext()
    const point = toPoint(event)
    if (!ctx || !point) return

    const s = state()

    // Placing a new shape.
    if (s.tool) {
      const spec = TOOLS.find((t) => t.id === s.tool)

      /*
       * Only committed anchors accumulate here.
       *
       * The rubber-band point the pointer drags around lives in `preview`, not
       * in `points`. It was being written into `points` so that the renderer
       * could see it, and the next click then appended to that - so moving the
       * mouse between the two clicks of a trend line, which everyone does,
       * saved it with three anchors instead of two.
       */
      const points = [
        ...(s.draft?.points || []),
        { time: point.time, price: point.price },
      ].slice(0, spec.points)

      if (points.length >= spec.points) {
        actions.commit((prev) => [...prev, createDrawing(s.tool, points, s.style)])
        actions.setDraft(null)
        // One shape per selection, like every charting package: the reader
        // goes back to the pointer rather than drawing a second by accident.
        actions.setTool(null)
      } else {
        actions.setDraft({ tool: s.tool, points, preview: null, ...s.style })
      }

      event.preventDefault()
      return
    }

    // Otherwise: select, and possibly begin a drag.
    const project = ctx.project()
    const hit = hitTest(s.drawings, point.x, point.y, project)

    actions.setSelectedId(hit ? hit.drawing.id : null)

    if (hit) {
      press = {
        id: hit.drawing.id,
        handle: hit.handle,
        startX: point.x,
        startY: point.y,
        origin: hit.drawing.points.map((p) => ({ ...p })),
        moved: false,
      }
      // Stop the chart panning under a drawing being dragged.
      event.preventDefault()
      event.stopPropagation()
      ctx.chart.applyOptions({ handleScroll: false, handleScale: false })
    }
  }

  const onPointerMove = (event) => {
    const s = state()

    // Rubber-band the shape being placed, without disturbing its anchors.
    if (s.tool && s.draft?.points?.length) {
      const point = toPoint(event)
      if (!point) return
      actions.setDraft({ ...s.draft, preview: { time: point.time, price: point.price } })
      return
    }

    if (!press) return

    const point = toPoint(event)
    if (!point) return

    if (!press.moved && Math.hypot(point.x - press.startX, point.y - press.startY) < DRAG_THRESHOLD) {
      return
    }
    press.moved = true

    const ctx = getContext()
    const candles = ctx.candles || []
    const startPrice = ctx.series.coordinateToPrice(press.startY)
    const startLogical = logicalAtX(ctx.chart, press.startX)
    const startTime = timeAtLogical(candles, startLogical ?? 0)
    if (startPrice === null || startLogical === null || startTime === null) return

    /*
     * Moved by a time difference rather than a whole number of bars.
     *
     * Shifting by bar index snapped the whole shape to the grid on every drag,
     * so a line nudged a few pixels either jumped a full bar or did not move
     * at all. A time delta moves it by exactly what the hand did.
     */
    const timeDelta = point.time - startTime
    const priceDelta = point.price - startPrice

    const shiftTime = (time) => time + timeDelta

    /*
     * Read the press into locals before handing the updater to React.
     *
     * `press` is cleared on pointerup, and React runs a state updater when it
     * gets to it rather than when it is called - so a drag that ended in the
     * same tick had the updater dereferencing null and taking the whole page
     * down with it. The values it needs are copied out while they still exist.
     */
    const { id: pressId, handle, origin } = press

    actions.commit((prev) =>
      prev.map((d) => {
        if (d.id !== pressId) return d

        // A handle moves one anchor; the body moves all of them together.
        const points =
          handle === null
            ? origin.map((p) => ({ time: shiftTime(p.time), price: p.price + priceDelta }))
            : d.points.map((p, i) => (i === handle ? { time: point.time, price: point.price } : p))

        return { ...d, points }
      })
    )
  }

  const endPress = () => {
    if (!press) return
    press = null
    getContext()?.chart.applyOptions({ handleScroll: true, handleScale: true })
  }

  /*
   * Both listeners capture, and the move one sits on the window.
   *
   * The chart library binds its own handlers to the same canvas for panning
   * and the crosshair, and they stop the event propagating - so a bubbling
   * `pointermove` listener never fired and a drag moved nothing at all, while
   * `pointerdown` worked because it was already capturing. On the window it
   * also keeps following a drag that leaves the chart, which is exactly when a
   * line is being stretched to the edge.
   */
  element.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('pointermove', onPointerMove, true)
  window.addEventListener('pointerup', endPress, true)
  window.addEventListener('pointercancel', endPress, true)

  return () => {
    element.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('pointermove', onPointerMove, true)
    window.removeEventListener('pointerup', endPress, true)
    window.removeEventListener('pointercancel', endPress, true)
    endPress()
  }
}
