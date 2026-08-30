import { useEffect } from 'react'

/**
 * Close a dialog on Escape.
 *
 * Six of the app's seven modals handled the close button and a backdrop click
 * but ignored Escape, which leaves a keyboard user with no way out except
 * tabbing to the X - and no way at all if focus never entered the dialog.
 * Shared rather than repeated so the next modal gets it by default.
 *
 * `capture` puts the listener ahead of anything that might stop propagation on
 * its way up, and the handler is skipped entirely while closed so stacked
 * dialogs do not all respond to one keypress.
 */
export function useEscapeKey(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen || typeof onClose !== 'function') return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [isOpen, onClose])
}
