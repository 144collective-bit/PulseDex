/**
 * Turning /u/... into who it means, and back.
 *
 * Kept out of the route hook so the parsing can be checked without a browser.
 * It is the one piece of this that decides what a URL anybody can type
 * resolves to, which is worth being able to test directly rather than through
 * a hook and a render. src/utils/route.js decides that a path is a profile;
 * this decides who it means.
 */

/*
 * Two spellings, one page.
 *
 * /u/@handle is what people share, because an address is unreadable and
 * nobody pastes one into a conversation to mean "this person". /u/0x...
 * always works, because a handle can be changed or given up, and a link that
 * rots is worse than an ugly one.
 *
 * The handle half is matched loosely - anything but a slash, up to the 32
 * characters the profiles table allows. Handles may contain whatever somebody
 * can type, so a stricter pattern here would be a second, quieter rule about
 * what a name may be, disagreeing with normaliseHandle and making certain
 * accounts unreachable by their own name.
 *
 * The optional tail is the follow graph: /u/@degen/followers and
 * /u/@degen/following. Two more URLs rather than a tab inside the page,
 * because they are places - somebody linking "look who follows this account"
 * is linking a list, and a list that only exists as state inside a profile
 * cannot be linked, cannot be gone Back out of, and cannot be shared. That is
 * the whole argument of docs/navigation-roadmap.md applied to one more
 * surface.
 *
 * Only those two words. Anything else after the name is not a profile path at
 * all, rather than a profile with a tail nobody understands - a URL that half
 * resolves is how /u/@a/b came to render somebody's page under a path that
 * meant nothing.
 */
const PROFILE_PATH = /^\/u\/(0x[a-fA-F0-9]{40}|@[^/]{1,32})(?:\/(followers|following))?\/?$/

/**
 * Who does this path mean, and which of their pages?
 *
 * `list` is null for the profile itself, or 'followers' or 'following'. Always
 * present, never conditional: a caller reading `route.list` should get null
 * rather than undefined for the ordinary case, because the two read the same
 * in a condition and differently in a comparison.
 *
 * @param {unknown} pathname
 * @returns {{ handle: string|null, address: string|null, list: string|null } | null}
 *   null when the path is not a profile at all
 */
export function readProfilePath(pathname) {
  if (typeof pathname !== 'string') return null

  const match = PROFILE_PATH.exec(pathname)
  if (!match) return null

  let raw
  try {
    // A handle can contain characters that have to be encoded in a URL, and
    // %-decoding can throw on a malformed sequence - which is a path that
    // means nobody rather than an exception to propagate.
    raw = decodeURIComponent(match[1])
  } catch {
    return null
  }

  const list = match[2] || null

  if (!raw.startsWith('@')) {
    // Lowercased because that is how the column stores it. Every explorer
    // shows the mixed-case checksummed form, so a link copied from one would
    // otherwise match nothing.
    return { handle: null, address: raw.toLowerCase(), list }
  }

  const handle = raw.slice(1)
  // "/u/@" is a path with no name in it.
  return handle ? { handle, address: null, list } : null
}

/**
 * The path for somebody.
 *
 * Prefers the handle, because that is the URL worth having in the address bar
 * if it gets copied from there - and falls back to the address, which always
 * resolves.
 *
 * `list` appends /followers or /following. Anything else is ignored rather
 * than appended, so a typo cannot build a path this module would then refuse
 * to read - a builder and a parser that disagree is a Back button that lands
 * on a page that does not exist.
 *
 * @returns {string | null} null when given neither
 */
export function profilePath({ address, handle, list } = {}) {
  const base = handle ? `/u/@${encodeURIComponent(handle)}` : address ? `/u/${address.toLowerCase()}` : null
  if (!base) return null

  return list === 'followers' || list === 'following' ? `${base}/${list}` : base
}
