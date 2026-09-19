import { useCallback, useEffect, useState } from 'react'
import { readProfilePath, profilePath } from '../utils/profilePath'

/**
 * URL state for a profile page.
 *
 * The app drives its tabs from component state rather than a router, and
 * useTokenRoute already carved out one exception - /token/<address> - through
 * the History API. This is the second, and it earns the inconsistency the same
 * way the first did: a profile nobody can link to is not a profile. It is the
 * one thing on this site somebody would paste into a conversation somewhere
 * else.
 *
 * The parsing lives in src/utils/profilePath.js, where it can be tested
 * without a browser. What is left here is the browser part: reading the
 * current path, pushing a new one, and keeping the two in step when somebody
 * uses Back.
 *
 * vercel.json already rewrites every path to index.html, so a cold load of
 * /u/@satoshi reaches the app rather than 404ing.
 */
export function useProfileRoute() {
  const [profile, setProfile] = useState(() => readProfilePath(window.location.pathname))

  // Back and forward move between a profile and wherever they came from.
  useEffect(() => {
    const onPop = () => setProfile(readProfilePath(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openProfile = useCallback(({ address, handle } = {}) => {
    const path = profilePath({ address, handle })
    if (!path) return

    window.history.pushState({}, '', path)
    /*
     * Re-read from the path rather than setting the object that built it. It
     * is one extra parse and it guarantees the state matches what the URL
     * actually says - so a handle that survives a round trip through
     * encodeURIComponent and back is the one the page looks up.
     */
    setProfile(readProfilePath(window.location.pathname))
    window.scrollTo({ top: 0 })
  }, [])

  const closeProfile = useCallback(() => {
    /*
     * Only when there is something to close. closeProfile runs on every tab
     * change, and pushing "/" unconditionally would put a history entry
     * between the user and Back for every click of the nav.
     */
    if (!readProfilePath(window.location.pathname)) return

    window.history.pushState({}, '', '/')
    setProfile(null)
  }, [])

  return { profileRoute: profile, openProfile, closeProfile }
}
