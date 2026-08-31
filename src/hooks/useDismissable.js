import { useCallback, useEffect, useRef, useState } from 'react'
import { useEscapeKey } from './useEscapeKey'

/**
 * Open/close plumbing for a popover anchored to a button.
 *
 * Escape closes it and returns focus to the button; a press anywhere outside
 * closes it and leaves focus where it landed. Shared because the board now has
 * two of these and they must behave identically - a menu that closes on
 * Escape in one place and not the other is worse than neither doing it.
 */
export function useDismissable() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  /*
   * The menu itself, when it is portalled out of the tree.
   *
   * The outside-press check below walks the DOM, and a portalled menu is not a
   * descendant of its own anchor - without this a press inside the menu counts
   * as a press outside it and closes it before the click lands.
   */
  const floatRef = useRef(null)

  const close = useCallback(() => {
    setOpen(false)
    buttonRef.current?.focus()
  }, [])

  useEscapeKey(open, close)

  useEffect(() => {
    if (!open) return undefined

    // Pointerdown rather than click, so the menu is gone before the press
    // lands on whatever was underneath it.
    const onPointerDown = (event) => {
      const inAnchor = wrapRef.current?.contains(event.target)
      const inMenu = floatRef.current?.contains(event.target)
      if (!inAnchor && !inMenu) setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return {
    open,
    setOpen,
    toggle: () => setOpen((v) => !v),
    close,
    wrapRef,
    buttonRef,
    floatRef,
  }
}
