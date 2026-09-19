/**
 * Reading what X says about an account, without believing all of it.
 *
 * Everything here arrives from a third party over the network, so it is parsed
 * the way any untrusted input is: shapes checked, values whitelisted, anything
 * unrecognised dropped rather than stored. The response is almost certainly
 * exactly what the documentation describes. "Almost certainly" is not the
 * standard for a value that ends up rendered beside somebody's name on a site
 * about which tokens to buy.
 *
 * Two of these fields do different jobs and must not be conflated:
 *
 * `handle` is what the OAuth flow proved. The account authenticated at x.com
 * and authorised us, so control of it is established and cannot be bought.
 *
 * `verifiedType` is a paid subscription. X Premium costs a few dollars a
 * month and anybody may buy it, including - especially - an account
 * impersonating a project. It is carried here because it is real information,
 * and the interface is required to show it as what it is rather than as a
 * check mark that reads like identity verification.
 */

/** X handles: letters, digits and underscore, at most 15. */
const HANDLE = /^[A-Za-z0-9_]{1,15}$/

/** Account ids are decimal snowflakes. Kept as a string - they exceed what a
 *  JavaScript number can hold exactly, and an id that rounds is an id that
 *  points at somebody else. */
const USER_ID = /^[0-9]{1,25}$/

/**
 * The subscription tiers X reports, and nothing else.
 *
 * A whitelist rather than a passthrough: this value is used to pick what the
 * interface renders, and an unrecognised string arriving from the API should
 * render as no badge rather than as itself. 'none' is X's way of saying there
 * is no subscription, which is the same thing as absent and is stored that
 * way so the column has one spelling for it.
 */
const VERIFIED_TYPES = new Set(['blue', 'business', 'government'])

/**
 * Turn a /2/users/me payload into what gets stored.
 *
 * @param {unknown} payload the parsed response body
 * @returns {{ id: string, handle: string, name: string|null,
 *   verifiedType: string|null, followers: number|null,
 *   createdAt: string|null } | null} null when there is no usable account in it
 */
export function normaliseXProfile(payload) {
  const user = payload?.data
  if (!user || typeof user !== 'object') return null

  const id = typeof user.id === 'string' ? user.id.trim() : String(user.id ?? '')
  const handle = typeof user.username === 'string' ? user.username.trim() : ''

  // Without both of these there is nothing to link. Everything below is
  // decoration and degrades to null on its own.
  if (!USER_ID.test(id) || !HANDLE.test(handle)) return null

  return {
    id,
    handle,
    name: displayName(user.name),
    verifiedType: verifiedType(user),
    followers: followers(user),
    createdAt: createdAt(user.created_at),
  }
}

/** The account's display name, which is free text somebody chose and is
 *  therefore capped and stripped of the newlines that would break a row. */
function displayName(raw) {
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, 50)
  return cleaned || null
}

/**
 * Which subscription, if any.
 *
 * `verified` on its own is not enough to go on: it is a boolean that has meant
 * different things at different times, and true with no recognised
 * `verified_type` is a state this code should not invent a badge for.
 */
function verifiedType(user) {
  const type = typeof user.verified_type === 'string' ? user.verified_type.toLowerCase() : null
  return type && VERIFIED_TYPES.has(type) ? type : null
}

function followers(user) {
  const count = user.public_metrics?.followers_count
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null
  return Math.floor(count)
}

/**
 * When the account was created.
 *
 * Refused if it is in the future, which is not pedantry: account age is the
 * signal here that a subscription cannot buy, and a date the wrong side of now
 * would render as an account aged in negative days.
 */
function createdAt(raw) {
  if (typeof raw !== 'string') return null
  const at = Date.parse(raw)
  if (!Number.isFinite(at) || at > Date.now()) return null
  return new Date(at).toISOString()
}

/**
 * How old the account is, in whole days.
 *
 * Shown instead of the raw date because that is how it is read - "eleven days
 * old" is a warning in a way that a date in this month is not, unless the
 * reader does the arithmetic.
 */
export function accountAgeDays(createdAtIso, now = Date.now()) {
  if (typeof createdAtIso !== 'string') return null
  const at = Date.parse(createdAtIso)
  if (!Number.isFinite(at)) return null
  return Math.max(0, Math.floor((now - at) / 86_400_000))
}
