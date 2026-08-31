/**
 * Drawings on the price chart: trend lines, rays, price levels and channels.
 *
 * Every anchor is stored as a time and a price - never a pixel, and never a
 * bar index. Pixels are meaningless the moment the chart is panned or resized;
 * a bar index shifts under the drawing every time a new candle closes or the
 * interval changes. A time and a price are what the reader actually meant, and
 * they survive all three. It is the one modelling decision here that would be
 * expensive to change later, so it is made once, at the bottom.
 */

export const TOOLS = [
  { id: 'trend', label: 'Trend line', points: 2, hint: 'Click two points', key: 't' },
  { id: 'ray', label: 'Ray', points: 2, hint: 'Extends past the second point', key: 'r' },
  { id: 'hline', label: 'Price level', points: 1, hint: 'Click a price', key: 'h' },
  { id: 'channel', label: 'Channel', points: 3, hint: 'Two points, then the width', key: 'c' },
]

/** Line weights offered in the style menu. */
export const LINE_WIDTHS = [1, 1.5, 2, 3]

/** Dash patterns, as the renderer understands them. */
export const LINE_STYLES = [
  { id: 'solid', label: 'Solid', dash: null },
  { id: 'dashed', label: 'Dashed', dash: [6, 4] },
  { id: 'dotted', label: 'Dotted', dash: [2, 3] },
]

export const DRAWING_COLORS = ['#00e5ff', '#fbbf24', '#00ff9d', '#f43f5e', '#a78bfa', '#e2e8f0']

export const DEFAULT_COLOR = DRAWING_COLORS[0]

/** How close a click must be, in pixels, to land on a drawing. */
export const HIT_TOLERANCE = 7

let seq = 0

export function createDrawing(tool, points, style = {}) {
  seq += 1
  return {
    id: `d${Date.now().toString(36)}${seq}`,
    tool,
    points,
    color: style.color || DEFAULT_COLOR,
    width: style.width || 1.5,
    lineStyle: style.lineStyle || 'solid',
  }
}

/**
 * The time under a fractional bar position.
 *
 * Drawings are no longer pinned to candles, so a click between two bars has to
 * resolve to a time between their timestamps rather than to whichever is
 * nearer. Outside the loaded range it extrapolates at the local bar spacing,
 * which is what lets a line be anchored past the newest candle and still hold
 * its place as new ones arrive.
 */
export function timeAtLogical(candles, logical) {
  const n = candles?.length || 0
  if (!n) return null

  const at = (i) => candles[i].time

  if (n === 1) return at(0)

  if (logical <= 0) {
    const step = at(1) - at(0)
    return at(0) + logical * step
  }
  if (logical >= n - 1) {
    const step = at(n - 1) - at(n - 2)
    return at(n - 1) + (logical - (n - 1)) * step
  }

  const i = Math.floor(logical)
  return at(i) + (logical - i) * (at(i + 1) - at(i))
}

/**
 * Pull an anchor onto the nearest open, high, low or close.
 *
 * What the magnet is for: a trend line off a wick is only useful if it lands
 * exactly on the wick, and by hand it never quite does. Only the bar under the
 * cursor is considered - snapping to a neighbour would move the anchor
 * somewhere the reader was not pointing.
 */
export function magnetize(candles, logical, price) {
  const n = candles?.length || 0
  if (!n) return null

  const candle = candles[Math.max(0, Math.min(n - 1, Math.round(logical)))]
  const levels = [candle.open, candle.high, candle.low, candle.close].filter((v) =>
    Number.isFinite(v)
  )
  if (!levels.length) return null

  let best = levels[0]
  for (const level of levels) {
    if (Math.abs(level - price) < Math.abs(best - price)) best = level
  }

  return { time: candle.time, price: best }
}

/** Anything hand-edited in storage has to survive reaching the renderer. */
export function normalizeDrawings(raw) {
  if (!Array.isArray(raw)) return []

  const ids = new Set()
  const out = []

  for (const d of raw) {
    const spec = TOOLS.find((t) => t.id === d?.tool)
    if (!spec) continue

    const points = Array.isArray(d.points)
      ? d.points
          .filter((p) => Number.isFinite(p?.time) && Number.isFinite(p?.price))
          .map((p) => ({ time: p.time, price: p.price }))
      : []
    if (points.length !== spec.points) continue

    // A duplicated id would make selection and deletion ambiguous.
    const id = typeof d.id === 'string' && !ids.has(d.id) ? d.id : `d${out.length}${Date.now()}`
    ids.add(id)

    out.push({
      id,
      tool: d.tool,
      points,
      color: DRAWING_COLORS.includes(d.color) ? d.color : DEFAULT_COLOR,
      width: LINE_WIDTHS.includes(d.width) ? d.width : 1.5,
      lineStyle: LINE_STYLES.some((l) => l.id === d.lineStyle) ? d.lineStyle : 'solid',
    })
  }

  return out
}

/* --------------------------------------------------------------------------
   Geometry, in screen space
   -------------------------------------------------------------------------- */

/** Distance from a point to a segment, for hit-testing a trend line. */
export function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy

  // A zero-length segment is a point; fall back to point distance rather than
  // dividing by zero.
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1)

  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))

  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/**
 * Distance to an infinite-to-the-right ray through two points.
 *
 * Clamped only at the near end: past the second point the ray keeps going, so
 * a click out there should still find it.
 */
export function distanceToRay(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1)

  const t = Math.max(0, ((px - x1) * dx + (py - y1) * dy) / lengthSq)
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/**
 * Which drawing a click lands on, and on what part of it.
 *
 * Handles win over bodies, and later drawings win over earlier ones, so a
 * click on an overlap grabs the thing drawn most recently - which is what the
 * reader was last looking at.
 */
export function hitTest(drawings, x, y, project) {
  for (let i = drawings.length - 1; i >= 0; i -= 1) {
    const d = drawings[i]
    const pts = d.points.map(project).filter(Boolean)
    if (pts.length !== d.points.length) continue

    for (let h = 0; h < pts.length; h += 1) {
      if (Math.hypot(x - pts[h].x, y - pts[h].y) <= HIT_TOLERANCE + 2) {
        return { drawing: d, handle: h }
      }
    }

    if (d.tool === 'hline') {
      if (Math.abs(y - pts[0].y) <= HIT_TOLERANCE) return { drawing: d, handle: null }
      continue
    }

    const [a, b] = pts
    const dist =
      d.tool === 'ray'
        ? distanceToRay(x, y, a.x, a.y, b.x, b.y)
        : distanceToSegment(x, y, a.x, a.y, b.x, b.y)

    if (dist <= HIT_TOLERANCE) return { drawing: d, handle: null }

    // A channel is two parallel lines; the second is the first plus an offset.
    if (d.tool === 'channel' && pts[2]) {
      const offset = pts[2].y - pts[0].y
      const far = distanceToSegment(x, y, a.x, a.y + offset, b.x, b.y + offset)
      if (far <= HIT_TOLERANCE) return { drawing: d, handle: null }
    }
  }

  return null
}
