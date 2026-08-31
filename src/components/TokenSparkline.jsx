import { useId, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPoolCandles } from '../services/geckoterminal'

/**
 * How much of the box the line is allowed to use.
 *
 * A series drawn edge to edge clips its own stroke at the extremes and reads
 * as if it ran off the top. This keeps the peak and the trough inside.
 */
const PAD_TOP = 0.14
const PAD_BOTTOM = 0.1

/**
 * Points needed before a line is worth drawing.
 *
 * Not a rounding-up of "more is better": eHEX resolves to a pool holding
 * $995K of parked liquidity and one sell a day, and the API returned four
 * prints for its last 24 hours. Those four ran from 0.00052 to 0.00168, so the
 * card drew a confident 220% rally for a token with $0.18 of volume. A handful
 * of prints is not a trend and should not be drawn as one.
 */
const MIN_POINTS = 8

/**
 * The viewBox the path is built in.
 *
 * Arbitrary - the SVG is stretched to whatever box it is given. Round numbers
 * keep the path readable in the DOM.
 */
const VB_W = 100
const VB_H = 100

function buildPaths(values) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min

  const usable = VB_H * (1 - PAD_TOP - PAD_BOTTOM)
  const top = VB_H * PAD_TOP

  const y = (v) =>
    // A flat series has no span to scale against; it sits on the midline
    // rather than dividing by zero.
    span === 0 ? top + usable / 2 : top + usable - ((v - min) / span) * usable

  const step = VB_W / (values.length - 1)
  const points = values.map((v, i) => [i * step, y(v)])

  const line = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`).join(' ')
  const area = `${line} L${VB_W} ${VB_H} L0 ${VB_H} Z`

  return { line, area, last: points[points.length - 1] }
}

/**
 * A live price line for one token.
 *
 * Draws the token's recent closes as a line over a fading area - the shape of
 * the last few hours, not a chart to read values off. There are no axes and no
 * crosshair on purpose: it belongs in a header beside the figures it
 * summarises, and anything more would compete with them.
 *
 * Built as an SVG path rather than through the charting library. A card
 * carries several of these at once, each of them a couple of hundred pixels
 * wide, and a chart instance apiece would cost a canvas, a resize observer and
 * a render loop for something with no interaction at all.
 *
 * `tokenAddress` matters more than it looks: the series comes back in the
 * pool's own orientation, and for a token that sits on the quote side that is
 * the wrong one - see the note in getPoolCandles.
 */
export default function TokenSparkline({
  poolAddress,
  tokenAddress,
  interval = '1h',
  variant = 'inline',
  showDot = true,
  className = '',
  label,
}) {
  // Unique per instance: two cards on a page would otherwise share one
  // gradient id and the second would silently take the first's fill.
  const gradientId = useId()

  const { data: candles, isLoading, isError } = useQuery({
    queryKey: ['sparkline', poolAddress?.toLowerCase(), tokenAddress?.toLowerCase(), interval],
    queryFn: () => getPoolCandles(poolAddress, interval, { tokenAddress }),
    enabled: Boolean(poolAddress),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  })

  const shape = useMemo(() => {
    const usable = (candles || []).filter((c) => Number.isFinite(c.close) && c.close > 0)
    if (usable.length < MIN_POINTS) return null

    /*
     * A window with no volume in it has no prices, only quotes.
     *
     * The dead pools carry a price the whole time and trade none of it, and a
     * line drawn from that says a market moved when nothing changed hands.
     * Summed across the window, not per candle - a quiet hour inside an active
     * day is ordinary.
     */
    const traded = usable.reduce((sum, c) => sum + (c.volume || 0), 0)
    if (traded <= 0) return null

    const closes = usable.map((c) => c.close)
    const paths = buildPaths(closes)
    return { ...paths, rising: closes[closes.length - 1] >= closes[0] }
  }, [candles])

  /*
   * Nothing is drawn until there is a shape to draw.
   *
   * No spinner and no error text either: this sits behind a card's own
   * figures, which are already telling the reader whether the data arrived.
   * A failed sparkline should leave the card exactly as it was without it.
   */
  if (isLoading || isError || !shape) {
    return <span className={`sparkline is-${variant} is-empty ${className}`} aria-hidden="true" />
  }

  const [lastX, lastY] = shape.last

  return (
    <span
      className={`sparkline is-${variant} ${shape.rising ? 'is-rising' : 'is-falling'} ${className}`}
      /* Decoration beside figures that already say all of this in words. */
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
             stretched with it - thick on a wide card, thin on a narrow one. */
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/*
        The head of the line, as an element rather than a <circle>.

        The viewBox is stretched independently on each axis, which turns a
        circle into an ellipse - wide and flat on a card header. Positioned in
        percentages outside the SVG it stays round at any size.
      */}
      {showDot && (
        <span
          className="sparkline-dot"
          style={{ left: `${lastX}%`, top: `${lastY}%` }}
        />
      )}
    </span>
  )
}
