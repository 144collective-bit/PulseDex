import { useCallback, useEffect, useState } from 'react'
import { readRoute, routePath } from '../utils/route'

/**
 * The address bar, as one piece of state.
 *
 * Replaces `useTokenRoute`, `useProfileRoute` and `useSocialRoute`, which were
 * three hooks writing to one variable. Each was right on its own; the set was
 * not, and the reason is in src/utils/route.js.
 *
 * What that buys, concretely: there is no `closeToken` any more, and no
 * `closeProfile` or `closeSocial`. Going to a token leaves a profile because
 * there is one route and it is now a token. The shell no longer has to
 * remember which surfaces to shut on the way out, which is the bookkeeping
 * that went wrong every time a fourth surface was added.
 *
 * vercel.json rewrites every path to index.html, so a cold load of any of
 * these reaches the app rather than 404ing.
 */
export function useRoute() {
  const read = () => readRoute(window.location.pathname, window.location.hash)

  const [route, setRoute] = useState(read)

  useEffect(() => {
    const onPop = () => setRoute(read())

    window.addEventListener('popstate', onPop)
    /*
     * `hashchange` as well. Following a link that differs only in its
     * fragment - one message to another in the same room - does not fire
     * `popstate`, so without this the URL would move and the page would not.
     */
    window.addEventListener('hashchange', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onPop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * Keep the address bar honest about where the page actually is.
   *
   * A path can mean a surface without being that surface's canonical
   * spelling: `/r/nonsense` is a request for the rooms surface and settles on
   * the default room, `/p/0` settles on the feed. Corrected with
   * `replaceState` rather than push - pushing would put the broken link in
   * history for Back to return to - so whoever copies it next passes on one
   * that works.
   *
   * The round trip pinned down in route.test.js is what stops this correcting
   * itself forever.
   */
  useEffect(() => {
    if (!route) return

    const canonical = routePath(route)
    const current = `${window.location.pathname}${window.location.hash}`

    if (current !== canonical) {
      window.history.replaceState({}, '', canonical)
      setRoute(readRoute(window.location.pathname, window.location.hash))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  /**
   * Go somewhere.
   *
   * Null means home, and that is the whole of "closing" a surface - there is
   * no separate close, because leaving is going somewhere and that somewhere
   * is `/`.
   *
   * Nothing is pushed when the path would not change. Otherwise pressing the
   * tab you are already on fills history with entries Back has to walk out
   * of, one per click.
   */
  const go = useCallback((next) => {
    const path = routePath(next)
    const here = `${window.location.pathname}${window.location.hash}`

    if (path !== here) window.history.pushState({}, '', path)

    /*
     * Re-read from the path rather than keeping the object that built it.
     * One extra parse, and it guarantees the state matches what the URL says
     * - so a room that did not survive the round trip is corrected here
     * rather than two renders later.
     */
    setRoute(readRoute(window.location.pathname, window.location.hash))
  }, [])

  /** Leave every surface. The tab shell shows through underneath. */
  const home = useCallback(() => go(null), [go])

  return { route, go, home }
}
