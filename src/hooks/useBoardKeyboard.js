import { useCallback } from 'react'

/** Panels the arrow keys move between, in the order they appear on the board. */
const SLOT_ORDER = ['.slot-new', '.slot-koth', '.slot-grad', '.slot-activity', '.slot-movers']

function rowsIn(slot) {
  return slot ? [...slot.querySelectorAll('.trench-row')] : []
}

function focusRow(row) {
  if (!row) return
  row.focus({ preventScroll: true })
  // `nearest` rather than `center`: on a board where the whole page scrolls,
  // centring every step drags the viewport around under the reader.
  row.scrollIntoView({ block: 'nearest' })
}

/**
 * Arrow-key movement across the board.
 *
 * Every row is already a button, so Tab reaches them and Enter opens them -
 * but a column holds forty-five of them, which makes Tab a way through the
 * board rather than a way around it. Up and down walk a column, left and right
 * step between columns holding your place in the list, and Home and End jump
 * to its ends.
 *
 * One handler on the board rather than one per row: forty-five listeners per
 * column is a cost paid on every poll, and the target is in the event anyway.
 */
export function useBoardKeyboard() {
  return useCallback((event) => {
    const row = event.target.closest?.('.trench-row')
    if (!row) return

    const slot = row.closest('.trenches-slot')
    if (!slot) return

    const siblings = rowsIn(slot)
    const index = siblings.indexOf(row)
    if (index < 0) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusRow(siblings[Math.min(index + 1, siblings.length - 1)])
        break

      case 'ArrowUp':
        event.preventDefault()
        focusRow(siblings[Math.max(index - 1, 0)])
        break

      case 'Home':
        event.preventDefault()
        focusRow(siblings[0])
        break

      case 'End':
        event.preventDefault()
        focusRow(siblings[siblings.length - 1])
        break

      case 'ArrowLeft':
      case 'ArrowRight': {
        const board = slot.closest('.trenches-board')
        if (!board) return

        // Resolved against the board rather than a fixed list, so a panel that
        // is not on screen at this width is skipped rather than swallowing the
        // keypress.
        const slots = SLOT_ORDER.map((sel) => board.querySelector(sel)).filter(
          (el) => el && el.offsetParent !== null
        )

        const here = slots.indexOf(slot)
        const next = slots[here + (event.key === 'ArrowRight' ? 1 : -1)]
        if (!next) return

        event.preventDefault()
        const target = rowsIn(next)
        // Hold your place in the list where the next column is long enough.
        focusRow(target[Math.min(index, target.length - 1)])
        break
      }

      default:
    }
  }, [])
}
