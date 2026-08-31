import { useId, useMemo } from 'react'

/**
 * How much of the box the line is allowed to use.
 *
 * A series drawn edge to edge clips its own stroke at the extremes and reads
 * as if it ran off the top. This keeps the peak and the trough inside.
 */
const PAD_TOP = 0.14
const PAD_BOTTOM = 0.1

/** The viewBox the path is built in; the SVG is stretched to whatever box it gets. */
const VB_W = 100
const VB_H = 100

function buildPaths(values, positions) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min

  const usable = VB_H * (1 - PAD_TOP - PAD_BOTTOM)
  const top = VB_H * PAD_TOP

  const y = (v) =>
    // A flat series has no span to scale against; it sits on the midline
    // rather than dividing by zero.
    span === 0 ? top + usable / 2 : top + usable - ((v - min) / span) * usable

  /*
   * X from real positions when the caller has them, evenly spaced otherwise.
   *
   * A series sampled at 24h, 6h, 1h and 5m is not evenly spaced in time, and
   * drawing it as though it were turns most of a day into one step.
   */
  const step = VB_W / (values.length - 1)
  const points = values.map((v, i) => [
    positions ? positions[i] * VB_W : i * step,
    y(v),
  ])

  const line = points
    .map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`)
    .join(' ')
  const area = `${line} L${VB_W} ${VB_H} L0 ${VB_H} Z`

  return { line, area, last: points[points.length - 1] }
}

/**
 * A line drawn from values already in hand.
 *
 * Presentation only - it fetches nothing. That split exists because the same
 * shape is now wanted in three places with three different sources: the home
 * cards read candles from the chart API, the screener rows derive theirs from
 * momentum figures the market API already returned, and the summary tiles sum
 * several series into one. A component that fetched would have forced the two
 * derived cases to pretend they had a pool address.
 *
 * `tone` picks the colour: 'accent' is the house cyan, 'up' and 'down' follow
 * the direction. Left to the caller because it is a judgement about what the
 * number means, not about the shape.
 */
export default function Sparkline({
  values,
  positions = null,
  tone = 'accent',
  variant = 'inline',
  showDot = true,
  className = '',
  label,
  minPoints = 3,
}) {
  // Unique per instance: two on a page would otherwise share one gradient id
  // and the second would silently take the first's fill.
  const gradientId = useId()

  const shape = useMemo(() => {
    /*
     * Finite, not positive.
     *
     * Prices are guaranteed positive by whoever supplies them; a percentage
     * series is not, and filtering negatives out of one would silently redraw
     * a fall as a gap.
     */
    const raw = values || []
    const keep = raw.map((v, i) => i).filter((i) => Number.isFinite(raw[i]))
    if (keep.length < minPoints) return null

    return buildPaths(
      keep.map((i) => raw[i]),
      positions ? keep.map((i) => positions[i]) : null
    )
  }, [values, positions, minPoints])

  if (!shape) {
    return <span className={`sparkline is-${variant} is-empty ${className}`} aria-hidden="true" />
  }

  const [lastX, lastY] = shape.last

  return (
    <span
      className={`sparkline is-${variant} tone-${tone} ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        /* Stretched to the box it is given: the shape is what matters, not the
           aspect ratio it was computed in. */
        preserveAspectRatio="none"
        focusable="false"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="sparkline-stop-top" />
            <stop offset="100%" className="sparkline-stop-bottom" />
          </linearGradient>
        </defs>

        <path className="sparkline-area" d={shape.area} fill={`url(#${gradientId})`} />
        <path
          className="sparkline-line"
          d={shape.line}
          fill="none"
          /* The viewBox is stretched, so a plain stroke width would be
             stretched with it - thick on a wide box, thin on a narrow one. */
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/*
        The head of the line, as an element rather than a <circle>: the viewBox
        is stretched independently on each axis, which would turn a circle into
        an ellipse. In percentages outside the SVG it stays round at any size.
      */}
      {showDot && (
        <span className="sparkline-dot" style={{ left: `${lastX}%`, top: `${lastY}%` }} />
      )}
    </span>
  )
}
