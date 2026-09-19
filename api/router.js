import logout from './_routes/auth/logout.js'
import me from './_routes/auth/me.js'
import nonce from './_routes/auth/nonce.js'
import verify from './_routes/auth/verify.js'
import candles from './_routes/candles.js'
import chatBlock from './_routes/chat/block.js'
import chatMessages from './_routes/chat/messages.js'
import chatReactions from './_routes/chat/reactions.js'
import posts from './_routes/posts.js'
import postsReport from './_routes/posts/report.js'
import profile from './_routes/profile.js'
import profileAvatar from './_routes/profile/avatar.js'

/**
 * Every API route, behind one serverless function.
 *
 * Vercel turns each file under `api/` into its own function, and the Hobby
 * plan allows twelve. This project had twelve routes plus a Node middleware -
 * which also counts, and is the part that is easy to miss - so adding a
 * thirteenth failed the deployment outright, after a clean build, with an
 * error about plan limits rather than about code.
 *
 * Folding two endpoints together would have bought one slot and hit the same
 * wall on the next one. This removes the ceiling instead: one function, with
 * the handlers in `_routes/` where the leading underscore keeps Vercel from
 * making functions of them. They are the same files, unchanged apart from one
 * extra `../` in their imports.
 *
 * Reached by an explicit rewrite in vercel.json rather than by a `[...path]`
 * catch-all filename, and that is not a style choice. The catch-all version
 * of this shipped and 404'd every multi-segment path in production -
 * /api/candles worked, /api/auth/nonce did not, which took sign-in down. A
 * rewrite we write ourselves is a rule we can read, and it carries the
 * original path in a query parameter so this function never has to guess what
 * was asked for.
 *
 * The cost is honest and worth stating: every route now shares one function,
 * so a cold start loads all of them, and they can no longer be given
 * different memory or region settings. At this size that is nothing. If one
 * route ever needs its own configuration, it can be lifted back out - the
 * handlers are still ordinary modules with default exports.
 */

/**
 * Path to handler. An explicit table, never a dynamic import built from the
 * request.
 *
 * `import('./_routes/' + path)` would be shorter and would be a directory
 * traversal: the path comes from the URL, so the caller would be choosing
 * which file on disk to execute. A table can only ever return something that
 * is in it, and it also lets the bundler see every handler, which a dynamic
 * specifier does not.
 */
const ROUTES = {
  'auth/logout': logout,
  'auth/me': me,
  'auth/nonce': nonce,
  'auth/verify': verify,
  candles,
  'chat/block': chatBlock,
  'chat/messages': chatMessages,
  'chat/reactions': chatReactions,
  posts,
  'posts/report': postsReport,
  profile,
  'profile/avatar': profileAvatar,
}

/**
 * Which route is this?
 *
 * Exported for its tests. Returns the key into ROUTES, or null - and null
 * covers anything odd rather than trying to repair it, because a URL that
 * does not name a route exactly is not a route.
 *
 * Takes the path in either spelling: the full pathname, which is what the dev
 * server passes and what a direct request carries, or the bare route that the
 * production rewrite puts in `?path=`. Accepting both means local and
 * deployed go down the same line of code rather than two that can drift.
 *
 * @param {string} value `/api/chat/messages` or `chat/messages`
 * @returns {string|null}
 */
export function routeKey(value) {
  if (typeof value !== 'string') return null

  // Trailing slash tolerated, because /api/profile/ is the same request any
  // reader would say it is.
  const path = (value.startsWith('/api/') ? value.slice(5) : value).replace(/^\/+|\/+$/g, '')
  if (!path) return null

  // A pathname that is not under /api is not a route, however it is spelled.
  if (value.startsWith('/') && !value.startsWith('/api/')) return null

  /*
   * A conservative shape, applied before the lookup: lowercase letters,
   * digits, hyphens and single slashes. The table lookup is what actually
   * decides, so this is belt and braces - but it means a path containing
   * "..", a null byte or an encoded separator never reaches it at all.
   */
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(path)) return null

  return Object.hasOwn(ROUTES, path) ? path : null
}

export default async function handler(req, res) {
  /*
   * The rewrite's `?path=` first, then the pathname.
   *
   * In production vercel.json rewrites /api/<anything> here and forwards the
   * matched segments as `path`, so that is the authoritative answer. Under the
   * dev server there is no rewrite and the original pathname arrives intact,
   * which the fallback handles. Neither spelling is guessed at: both are read,
   * in a fixed order, and anything that is neither is a 404.
   */
  const url = new URL(req.url, 'http://localhost')
  const key = routeKey(url.searchParams.get('path') || url.pathname)

  if (!key) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(404).json({ error: 'Not found.' })
  }

  return ROUTES[key](req, res)
}
