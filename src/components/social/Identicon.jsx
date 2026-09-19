import { useMemo } from 'react'
import { identicon, IDENTICON_GRID } from '../../utils/identicon'

/**
 * An address, drawn.
 *
 * Inline SVG rather than a canvas or an image: it scales without blurring, it
 * costs no network request, and it inherits the page's colour handling. A room
 * of fifty messages draws fifty of these, so each is a handful of rects and
 * nothing more.
 *
 * Marked aria-hidden. It carries no information the row does not already state
 * in text - the handle and the address are both beside it - and announcing "a
 * pattern of squares" to a screen reader is noise between two useful lines.
 */
export default function Identicon({ address, size = 32 }) {
  const { color, background, cells } = useMemo(() => identicon(address), [address])

  return (
    <svg
      className="chat-identicon"
      width={size}
      height={size}
      viewBox={`0 0 ${IDENTICON_GRID} ${IDENTICON_GRID}`}
      aria-hidden="true"
      focusable="false"
      /* shape-rendering keeps the cells crisp: at 32px each cell is 6.4 device
         pixels, and antialiasing on that leaves a grey seam between squares. */
      shapeRendering="crispEdges"
    >
      <rect width={IDENTICON_GRID} height={IDENTICON_GRID} fill={background} opacity="0.22" />
      {cells.map((filled, i) =>
        filled ? (
          <rect
            key={i}
            x={i % IDENTICON_GRID}
            y={Math.floor(i / IDENTICON_GRID)}
            width="1"
            height="1"
            fill={color}
          />
        ) : null,
      )}
    </svg>
  )
}
