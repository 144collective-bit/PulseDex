import { useLayoutEffect, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Breathing room from the anchor, and from the edge of the screen. */
const GAP = 6
const MARGIN = 8

/**
 * A popover that renders outside the layout it belongs to.
 *
 * Every panel on this board sets `overflow: hidden` to cut its own rounded
 * corners, and every one of them sets `backdrop-filter`, which makes it both a
 * stacking context and a containing block for fixed positioning. A menu left
 * inside one is therefore clipped at the panel's edge, painted under the panels
 * that come after it, and cannot escape either by z-index or by
 * `position: fixed`. The column menus were being cut in half by exactly this
 * whenever a filter left a column short.
 *
 * So the menu is portalled to the body and positioned from the anchor's rect:
 * nothing above it in the tree can clip it, and it stacks against the page
 * rather than against a panel.
 */
export default function FloatingMenu({
  anchorRef,
  floatRef,
  align = 'left',
  onDismiss,
  className = '',
  children,
  ...rest
}) {
  const localRef = useRef(null)
  const ref = floatRef || localRef

  const [position, setPosition] = useState(null)

  // Measured before paint, so the menu never appears at one place and jumps.
  useLayoutEffect(() => {
    const anchor = anchorRef?.current
    const el = ref.current
    if (!anchor || !el) return

    const a = anchor.getBoundingClientRect()
    const { width, height } = el.getBoundingClientRect()

    let left = align === 'right' ? a.right - width : a.left
    left = Math.min(Math.max(MARGIN, left), window.innerWidth - width - MARGIN)

    let top = a.bottom + GAP
    if (top + height > window.innerHeight - MARGIN) {
      // Flip above the anchor when there is room there; otherwise sit against
      // the bottom edge and let the menu scroll inside itself.
      const above = a.top - GAP - height
      top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - height - MARGIN)
    }

    setPosition({ top, left })
  }, [anchorRef, ref, align])

  /*
   * Close rather than follow.
   *
   * The board is a scrolling page, and a menu anchored to a row of chips that
   * has scrolled away is worse than no menu. Capture phase so a scroll inside
   * any container counts, not only the document's.
   */
  useEffect(() => {
    if (!onDismiss) return undefined

    const onMove = () => onDismiss()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [onDismiss])

  return createPortal(
    <div
      ref={ref}
      className={className}
      style={{
        position: 'fixed',
        top: position ? `${position.top}px` : 0,
        left: position ? `${position.left}px` : 0,
        maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
        overflowY: 'auto',
        // Hidden for the single frame between mounting and being measured.
        visibility: position ? 'visible' : 'hidden',
      }}
      {...rest}
    >
      {children}
    </div>,
    document.body
  )
}
