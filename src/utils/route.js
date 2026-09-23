import { readProfilePath, profilePath } from './profilePath'
import { readSocialPath, socialPath } from './socialPath'

/**
 * One address bar, one answer.
 *
 * Three hooks used to share `window.location`, each reading and pushing
 * independently - `useTokenRoute`, `useProfileRoute`, `useSocialRoute`. Each
 * was correct on its own and the set was not, because none of them could
 * assume the URL was where it last left it. `closeToken` pushed `/`
 * unconditionally, so the first version of `closeSocial` checked the
 * location, found it already moved, concluded there was nothing to do, and
 * left the social section mounted on top of the home page.
 *
 * That bug is not a mistake anybody made twice; it is what three writers to
 * one variable produce. So there is one parser now, and the surfaces are
 * cases of it rather than peers. Opening a token leaves a profile because
 * there is one route and it is now a token - not because somebody remembered
 * to call `closeProfile`.
 *
 * The per-surface parsers stay where they were, in profilePath.js and
 * socialPath.js. This file decides which of them a path belongs to; they
 * decide what it means. Splitting it the other way would have put four
 * unrelated regexes in one function and made every surface's rules everybody
 * else's business.
 */

/** `/token/0x...` - the one surface whose parsing is small enough to live
 *  here rather than in a file of its own. */
const TOKEN_PATH = /^\/token\/(0x[a-fA-F0-9]{40})\/?$/

/**
 * What is this URL asking for?
 *
 * Null means the ordinary tab shell - Home, the screener, the trenches,
 * portfolio. Those are driven from state rather than from the address bar and
 * always have been; making them routes would be rewriting the shell this
 * decision exists to protect, and the reasoning is in
 * docs/navigation-roadmap.md.
 *
 * @param {unknown} pathname
 * @param {unknown} [hash] `window.location.hash`, for `/r/<slug>#m<id>`
 * @returns {{ kind: string } & object | null}
 */
export function readRoute(pathname, hash) {
  if (typeof pathname !== 'string') return null

  const token = TOKEN_PATH.exec(pathname)
  if (token) return { kind: 'token', address: token[1] }

  const profile = readProfilePath(pathname)
  if (profile) return { kind: 'profile', ...profile }

  const social = readSocialPath(pathname, hash)
  if (social) return { kind: 'social', ...social }

  return null
}

/**
 * The path for a route.
 *
 * `/` for null, which is what leaving every surface means - and the reason
 * this takes null rather than having a separate "close" is that closing is
 * not a fourth operation. It is going somewhere, and that somewhere is home.
 *
 * @param {object|null} route
 * @returns {string}
 */
export function routePath(route) {
  if (!route || typeof route !== 'object') return '/'

  if (route.kind === 'token') {
    // Lowercased: every explorer shows the mixed-case checksummed form, and
    // two links to one token should be one link.
    return typeof route.address === 'string' ? `/token/${route.address.toLowerCase()}` : '/'
  }

  if (route.kind === 'profile') {
    return profilePath(route) || '/'
  }

  if (route.kind === 'social') {
    return socialPath(route)
  }

  return '/'
}

/**
 * Which tab the shell should show for a route.
 *
 * The URL wins wherever it says anything, and this is where that is decided
 * rather than in three places in App.jsx. A token page and a profile page
 * cover the whole content area, so the tab underneath them does not matter
 * and is left as whatever it was - which is what makes closing one return you
 * to where you were rather than to Home.
 *
 * @param {object|null} route
 * @param {string} fallback the tab state the shell is holding
 */
export function routeTab(route, fallback) {
  return route?.kind === 'social' ? 'social' : fallback
}

/** Do two routes mean the same place? Used to decide whether a push is
 *  needed at all, so that clicking the tab you are already on does not fill
 *  the history with entries Back has to walk out of. */
export const sameRoute = (a, b) => routePath(a) === routePath(b)
