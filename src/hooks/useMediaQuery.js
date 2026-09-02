import { useCallback, useSyncExternalStore } from 'react'

/**
 * Whether a media query currently matches.
 *
 * Some layout decisions cannot be made in CSS alone. Hiding a control with
 * `display: none` still leaves it in the tab order and still reads it out to a
 * screen reader, so a bar that collapses on a narrow screen has to actually
 * stop rendering what it collapses - and that is a decision the component has
 * to make, not the stylesheet.
 *
 * Built on useSyncExternalStore rather than an effect that calls setState:
 * the subscription is what React wants to own here, and it gets the first
 * value during render instead of after a paint, so a narrow screen never
 * flashes the wide layout on the way in.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const list = window.matchMedia(query)

      // Safari only grew addEventListener on MediaQueryList in 14.
      if (list.addEventListener) {
        list.addEventListener('change', onChange)
        return () => list.removeEventListener('change', onChange)
      }
      list.addListener(onChange)
      return () => list.removeListener(onChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  }, [query])

  // Server and pre-hydration both answer "no", which is the wide layout - the
  // same thing the stylesheet assumes before any breakpoint applies.
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

export default useMediaQuery
