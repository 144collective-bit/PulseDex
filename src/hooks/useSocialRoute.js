import { useCallback, useEffect, useState } from 'react'
import { readSocialPath, socialPath } from '../utils/socialPath'

/**
 * URL state for the social section.
 *
 * The third of these hooks, after useTokenRoute and useProfileRoute, and the
 * argument for a third rather than a router is in
 * docs/navigation-roadmap.md. In short: the shell drives its tabs from state,
 * those two carved out the exceptions that mattered most, and this one is the
 * rest of them - a room, the feed, the inbox, discover. What it buys is what
 * they bought: a conversation that can be pasted into a conversation
 * somewhere else.
 *
 * The parsing lives in src/utils/socialPath.js, where it can be checked
 * without a browser. What is left here is the browser: reading the path,
 * pushing a new one, keeping the two in step through Back, and correcting the
 * address bar when it names somewhere that does not exist.
 *
 * vercel.json already rewrites everything that is not /api/ to index.html, so
 * a cold load of /r/group-whales reaches the app rather than 404ing. Nothing
 * had to change for that.
 */
export function useSocialRoute() {
  /*
   * The hash is read alongside the path, because a link to one message
   * carries `#m<id>` and `location.pathname` does not include it.
   */
  const read = () => readSocialPath(window.location.pathname, window.location.hash)

  const [route, setRoute] = useState(read)

  // Back and forward move through the section rather than out of it.
  useEffect(() => {
    const onPop = () => setRoute(read())
    window.addEventListener('popstate', onPop)

    /*
     * `hashchange` as well as `popstate`. Following a link that differs only
     * in its fragment - one message to another in the same room - does not
     * fire `popstate`, so without this the URL would move and the page would
     * not.
     */
    window.addEventListener('hashchange', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onPop)
    }
  }, [])

  /*
   * Make the address bar say where the page actually is.
   *
   * `/r/a-room-that-was-deleted` opens the rooms surface on the default room,
   * which is the right thing to show and the wrong thing for the URL to keep
   * claiming - somebody would copy it and hand on a link that goes nowhere.
   * The canonical path is rebuilt from the resolved route and replaces what
   * is there.
   *
   * `replaceState`, not push: this is a correction to the entry somebody is
   * already on, and pushing would put the broken link in their history for
   * Back to return to.
   *
   * The round trip that `socialPath.test.js` pins down is what stops this
   * looping. If building a path from a route and reading it back gave a
   * different route, this effect would correct its own correction forever.
   */
  useEffect(() => {
    if (!route) return

    const canonical = socialPath(route)
    // Compared against path and fragment together, because the canonical
    // form carries the message id in the fragment and comparing only the
    // pathname would rewrite `/r/lounge#m12` to `/r/lounge` on every render.
    const current = `${window.location.pathname}${window.location.hash}`

    if (current !== canonical) {
      window.history.replaceState({}, '', canonical)
      setRoute(readSocialPath(window.location.pathname, window.location.hash))
    }
  }, [route])

  /**
   * Go to a social surface.
   *
   * Takes the same shape the route has, so a caller says where it wants to be
   * rather than assembling a string - which is what keeps the one place that
   * knows the path shapes in src/utils/socialPath.js.
   */
  const openSocial = useCallback((where) => {
    const path = socialPath(where)
    window.history.pushState({}, '', path)
    /*
     * Re-read from the path rather than keeping the object that built it, the
     * way useProfileRoute does. One extra parse, and it guarantees the state
     * matches what the URL says - so a room that did not survive the round
     * trip is corrected here rather than two renders later.
     */
    setRoute(readSocialPath(window.location.pathname, window.location.hash))
  }, [])

  /**
   * Leave the section, so that moving to the screener stops the URL claiming
   * to be a room.
   *
   * The state is cleared first and unconditionally, and the push happens only
   * if the address bar still needs it. The order matters: `closeToken` pushes
   * `/` whether or not a token was open, so a version of this that checked
   * the location first would find it already moved, decide there was nothing
   * to do, and leave the section mounted over the home page. Three routers
   * share one address bar and none of them can assume it is where they last
   * left it.
   */
  const closeSocial = useCallback(() => {
    setRoute(null)
    if (readSocialPath(window.location.pathname, window.location.hash)) {
      window.history.pushState({}, '', '/')
    }
  }, [])

  return { socialRoute: route, openSocial, closeSocial }
}
