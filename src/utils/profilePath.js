/**
 * Turning /u/... into who it means, and back.
 *
 * Pulled out of useProfileRoute so the parsing can be checked without a
 * browser. It is the one piece of this that decides what a URL anybody can
 * type resolves to, which is worth being able to test directly rather than
 * through a hook and a render.
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
 */
const PROFILE_PATH = /^\/u\/(0x[a-fA-F0-9]{40}|@[^/]{1,32})\/?$/

/**
 * Who does this path mean?
 *
 * @param {unknown} pathname
 * @returns {{ handle: string|null, address: string|null } | null}
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

  if (!raw.startsWith('@')) {
    // Lowercased because that is how the column stores it. Every explorer
    // shows the mixed-case checksummed form, so a link copied from one would
    // otherwise match nothing.
    return { handle: null, address: raw.toLowerCase() }
  }

  const handle = raw.slice(1)
  // "/u/@" is a path with no name in it.
  return handle ? { handle, address: null } : null
}

/**
 * The path for somebody.
 *
 * Prefers the handle, because that is the URL worth having in the address bar
 * if it gets copied from there - and falls back to the address, which always
 * resolves.
 *
 * @returns {string | null} null when given neither
 */
export function profilePath({ address, handle } = {}) {
  if (handle) return `/u/@${encodeURIComponent(handle)}`
  if (address) return `/u/${address.toLowerCase()}`
  return null
}
