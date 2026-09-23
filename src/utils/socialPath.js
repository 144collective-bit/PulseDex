import { DEFAULT_ROOM, isRoom } from '../config/rooms'

/**
 * Turning a path into which social surface it means, and back.
 *
 * The third of these parsers, after profilePath.js and the one inside
 * useTokenRoute, and the reason there is a third rather than a router is
 * written down in docs/navigation-roadmap.md: the shell drives its tabs from
 * state, and replacing that wholesale to link five surfaces would be
 * rewriting the thing the decision exists to protect.
 *
 * Pulled out of the hook for the same reason the profile one was. This is
 * what decides where a URL somebody typed lands, which is worth checking
 * directly rather than through a hook and a render.
 */

/**
 * One path shape per surface, and `/r/<slug>` for all three kinds of room.
 *
 * A fixed room, a group and a token room are all slugs, so they share a path.
 * The alternative was a prefix per kind - `/room/`, `/group/`, `/token-chat/`
 * - which would have put the kind in the URL and made every link break on the
 * day a room changes kind, or on the day a fourth kind arrives.
 */
const PATHS = {
  '/feed': 'feed',
  '/me': 'profile',
  '/discover': 'discover',
  '/notifications': 'notifications',
}

/** `/r`, `/r/lounge`, `/r/group-whales`, `/r/token-0x...` */
const ROOM_PATH = /^\/r(?:\/([^/]*))?\/?$/

/**
 * One message inside a room: `#m1234`.
 *
 * A fragment rather than a path segment, and that is the whole reason it
 * works. `/r/lounge#m1234` is the same document as `/r/lounge` as far as the
 * server and the router are concerned, so a link to a message is a link to
 * the room plus an instruction about where to look - which is exactly what it
 * is. A path segment would have made it a separate route that has to load the
 * room anyway.
 */
const MESSAGE_HASH = /^#m(\d{1,19})$/

/**
 * Which surface does this path mean?
 *
 * Null for anything that is not a social path at all, including `/`,
 * `/token/...` and `/u/...`. The caller uses null to mean "this is one of the
 * other two routers' business, or the ordinary tab shell".
 *
 * A room slug that is not a room comes back as `room: null` rather than
 * making the whole path unrecognised. `/r/nonsense` is still a request for
 * the rooms surface, and answering it with the default room is better than
 * answering it with the home page - the hook below then corrects the address
 * bar so it stops claiming to be somewhere it is not.
 *
 * The hash is read too, because a link to a message carries `#m<id>` and
 * `location.pathname` does not include it. Only rooms have one; it is
 * ignored everywhere else rather than carried around as a field that is
 * always null.
 *
 * @param {unknown} pathname
 * @param {unknown} [hash] `window.location.hash`
 * @returns {{ tab: string, room: string|null, message: number|null } | null}
 */
export function readSocialPath(pathname, hash) {
  if (typeof pathname !== 'string') return null

  // A trailing slash is the same request any reader would say it is.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

  const tab = PATHS[path]
  if (tab) return { tab, room: null, message: null }

  const match = ROOM_PATH.exec(pathname)
  if (!match) return null

  /*
   * An id that is not a positive integer is no id at all. Parsed to a number
   * so that `#m007` and `#m7` are the same message rather than two strings
   * that will not compare equal to the one on a row.
   */
  const found = typeof hash === 'string' ? MESSAGE_HASH.exec(hash) : null
  const message = found ? Number(found[1]) : null
  const at = Number.isSafeInteger(message) && message > 0 ? message : null

  const raw = match[1]
  if (!raw) return { tab: 'rooms', room: null, message: at }

  let slug
  try {
    // A slug cannot contain anything needing encoding, but a URL can carry
    // one that does - and decoding can throw on a malformed sequence, which
    // is a path that means no room rather than an exception to propagate.
    slug = decodeURIComponent(raw)
  } catch {
    return { tab: 'rooms', room: null, message: at }
  }

  /*
   * Checked against the room rules rather than taken as given. `isRoom` knows
   * the five by name and the other two kinds by shape, which is as much as
   * anything in the browser can know - whether a group actually exists is a
   * question for the database, and a link to one that has gone should land on
   * the rooms surface rather than on a blank page.
   */
  return { tab: 'rooms', room: isRoom(slug) ? slug : null, message: at }
}

/**
 * The path for a surface.
 *
 * The inverse of the above, and exact: `readSocialPath(socialPath(x))` gives
 * back `x` for every surface. That round trip is what lets the hook compare
 * where the address bar says it is against where it actually is, and correct
 * the difference.
 *
 * @param {{ tab?: string, room?: string|null, message?: number|null }} where
 * @returns {string} always a path; an unknown tab is the feed, which is where
 *   the section opens
 */
export function socialPath({ tab, room, message } = {}) {
  if (tab === 'rooms') {
    // The default room is spelled out rather than left implicit at `/r`. A
    // link somebody copies should say which room they were in.
    const slug = isRoom(room) ? room : DEFAULT_ROOM
    /*
     * The fragment only when there is a message worth naming. A bare `#m` or
     * a trailing `#` on every room link would be noise in the address bar
     * and, worse, would make two links to the same room compare unequal.
     */
    const at = Number.isSafeInteger(message) && message > 0 ? `#m${message}` : ''
    return `/r/${slug}${at}`
  }

  for (const [path, id] of Object.entries(PATHS)) {
    if (id === tab) return path
  }

  return '/feed'
}

/** Is this path one of ours? Used by the shell to decide whether the social
 *  section is what the URL is asking for. */
export const isSocialPath = (pathname) => readSocialPath(pathname) !== null
