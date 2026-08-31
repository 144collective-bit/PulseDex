/**
 * The layer that paints drawings onto the price pane.
 *
 * lightweight-charts has no drawing tools - that is the paid product - but it
 * does expose series primitives, which is the supported way to render over a
 * pane with correct time and price coordinates. This is that: one primitive
 * holding every drawing, rather than one per drawing, because each primitive
 * costs a pane view and a renderer and they would all be drawing into the same
 * canvas anyway.
 *
 * State arrives through a mutable ref rather than a constructor argument. The
 * chart outlives any single React render, and rebuilding the primitive on
 * every state change would detach and reattach the layer several times a
 * second while a line is being dragged.
 */

import { LINE_STYLES } from '../../utils/chartDrawings'

const HANDLE_RADIUS = 4

/**
 * Where a stored anchor sits on screen right now.
 *
 * Goes through logical coordinates rather than `timeToCoordinate`, which only
 * answers for times that exist in the loaded data and returns null otherwise -
 * so a trend line anchored off the left edge would vanish as soon as it
 * scrolled out of range, instead of continuing off the side of the chart the
 * way a drawing should. Logical coordinates extrapolate, so the line keeps
 * going and only its visible part is drawn.
 */
export function makeProjector({ chart, series, candles }) {
  const timeScale = chart.timeScale()

  // Times are ascending, so an index lookup is a binary search rather than a
  // map rebuilt on every frame.
  const times = candles?.map((c) => c.time) || []

  const logicalForTime = (time) => {
    if (!times.length) return null

    let lo = 0
    let hi = times.length - 1

    if (time <= times[0]) {
      // Before the data: extrapolate at the spacing of the first two bars.
      const step = times.length > 1 ? times[1] - times[0] : 1
      return step > 0 ? (time - times[0]) / step : 0
    }
    if (time >= times[hi]) {
      const step = times.length > 1 ? times[hi] - times[hi - 1] : 1
      return step > 0 ? hi + (time - times[hi]) / step : hi
    }

    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (times[mid] === time) return mid
      if (times[mid] < time) lo = mid + 1
      else hi = mid - 1
    }

    // Between two bars: interpolate so a drawing does not jump to a candle.
    const before = hi
    const span = times[before + 1] - times[before]
    return span > 0 ? before + (time - times[before]) / span : before
  }

  /*
   * Logical position to pixel, computed rather than asked for.
   *
   * `logicalToCoordinate` is the obvious call and returns 0 for every
   * fractional input - it wants a whole bar index, so every anchor collapsed
   * onto the left edge while its price coordinate stayed perfectly correct.
   * The visible range and the scale's width give the mapping directly, and it
   * is the exact inverse of the one the pointer handlers use to read a
   * position in, so a point drawn at a pixel projects back to that pixel.
   */
  const range = timeScale.getVisibleLogicalRange()
  const width = timeScale.width()
  const span = range ? range.to - range.from : 0

  return (point) => {
    const logical = logicalForTime(point.time)
    if (logical === null) return null

    const y = series.priceToCoordinate(point.price)
    if (y === null) return null

    if (!range || !(span > 0) || !(width > 0)) return null

    return { x: ((logical - range.from) / span) * width, y }
  }
}

/** Extend a segment to the right edge, for rays and channels. */
function extendRight(a, b, width) {
  const dx = b.x - a.x
  if (dx === 0) return { x: b.x, y: b.y }

  const slope = (b.y - a.y) / dx
  // Only ever extended forwards; a ray drawn right-to-left keeps its end.
  if (dx < 0) return { x: b.x, y: b.y }

  return { x: width, y: b.y + slope * (width - b.x) }
}

function strokeLine(ctx, a, b, color, width, dash = null) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  if (dash) ctx.setLineDash(dash)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  ctx.restore()
}

function drawHandles(ctx, points, color) {
  ctx.save()
  for (const p of points) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = '#0b0f18'
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = color
    ctx.stroke()
  }
  ctx.restore()
}

/** The points each shape needs before there is anything to draw. */
const MIN_POINTS = { hline: 1, trend: 2, ray: 2, channel: 2 }

/**
 * Paint one drawing. Shared by the saved set and the one being drawn.
 *
 * The guard is not defensive padding: a shape mid-draw has fewer points than
 * its finished form, so between the first click and the second a trend line
 * arrives here with one. Reaching for the missing second point threw inside
 * the library's own render loop, which took the whole page down rather than
 * skipping a frame.
 */
function paint(ctx, drawing, pts, width, selected, ghost) {
  if (pts.length < (MIN_POINTS[drawing.tool] ?? 2)) return

  const color = drawing.color
  const lineWidth = (drawing.width || 1.5) + (selected ? 0.8 : 0)
  // A shape being placed is always dashed, whatever style it will end up with.
  const dash = ghost ? [5, 4] : LINE_STYLES.find((l) => l.id === drawing.lineStyle)?.dash || null

  if (drawing.tool === 'hline') {
    strokeLine(ctx, { x: 0, y: pts[0].y }, { x: width, y: pts[0].y }, color, lineWidth, dash)
  } else if (drawing.tool === 'ray') {
    strokeLine(ctx, pts[0], extendRight(pts[0], pts[1], width), color, lineWidth, dash)
  } else if (drawing.tool === 'channel') {
    strokeLine(ctx, pts[0], pts[1], color, lineWidth, dash)

    if (pts[2]) {
      const offset = pts[2].y - pts[0].y
      const a2 = { x: pts[0].x, y: pts[0].y + offset }
      const b2 = { x: pts[1].x, y: pts[1].y + offset }
      strokeLine(ctx, a2, b2, color, lineWidth, dash)

      // A wash between the rails, so the channel reads as a band.
      ctx.save()
      ctx.globalAlpha = 0.1
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      ctx.lineTo(pts[1].x, pts[1].y)
      ctx.lineTo(b2.x, b2.y)
      ctx.lineTo(a2.x, a2.y)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  } else {
    strokeLine(ctx, pts[0], pts[1], color, lineWidth, dash)
  }

  if (selected) drawHandles(ctx, pts, color)
}

/**
 * A primitive rendering every drawing on the pane.
 *
 * `stateRef.current` carries `{ drawings, draft, selectedId, candles }`; the
 * owner mutates it and calls `requestUpdate()`.
 */
export function createDrawingPrimitive(stateRef) {
  let chart = null
  let series = null
  let requestUpdate = null

  const renderer = {
    draw(target) {
      // Media coordinate space: CSS pixels, matching what the hit-testing and
      // the mouse handlers work in. The bitmap space would need every
      // coordinate scaled by device pixel ratio for no gain here.
      target.useMediaCoordinateSpace((scope) => {
        const state = stateRef.current
        if (!chart || !series || !state) return

        // `context`, not `ctx` - the rendering scope names it in full, and
        // destructuring the wrong key yields undefined rather than an error,
        // so the layer silently drew nothing at all.
        const { context: ctx, mediaSize } = scope
        const project = makeProjector({ chart, series, candles: state.candles })

        for (const d of state.drawings) {
          const pts = d.points.map(project)
          if (pts.some((p) => !p)) continue
          paint(ctx, d, pts, mediaSize.width, d.id === state.selectedId, false)
        }

        /*
         * The one under construction, dashed so it reads as provisional.
         *
         * Its anchors and the point under the pointer are joined only here,
         * for drawing - the draft itself keeps them apart so a click can never
         * mistake the preview for a placed anchor.
         */
        const draft = state.draft
        if (draft?.points?.length) {
          const live = draft.preview ? [...draft.points, draft.preview] : draft.points
          const pts = live.map(project)
          if (!pts.some((p) => !p)) {
            paint(ctx, draft, pts, mediaSize.width, false, true)
          }
        }
      })
    },
  }

  const paneView = {
    renderer: () => renderer,
    zOrder: () => 'top',
  }

  return {
    attached(param) {
      chart = param.chart
      series = param.series
      requestUpdate = param.requestUpdate
    },
    detached() {
      chart = null
      series = null
      requestUpdate = null
    },
    paneViews: () => [paneView],
    updateAllViews: () => {},
    /** Called by the owner when the drawing state changes. */
    refresh: () => requestUpdate?.(),
  }
}
