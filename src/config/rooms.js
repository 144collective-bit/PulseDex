/**
 * The rooms, and the fact that there is a fixed list of them.
 *
 * Defined here rather than in a table, which is a real trade and worth being
 * plain about. A `rooms` table would let rooms be added without a deploy; this
 * needs a commit. What it buys instead is that the list is the same object the
 * sidebar renders, the endpoint validates against and the tests assert on -
 * one source of truth, no admin screen to build, and no way for the database
 * to contain a room the app has never heard of.
 *
 * That is the right shape while somebody is still finding out whether people
 * use this at all. It stops being the right shape the moment rooms need to be
 * created by anyone who is not holding a git checkout.
 *
 * Changing the list: add an entry, deploy. Removing one is different - see
 * below.
 *
 * That moment has now half arrived. A room per token cannot live in this file
 * - there is one for every address anybody cares to open - so those live in
 * the `rooms` table, created by whoever posts the first message in one, and
 * this file holds the five that were written by a person plus the rules for
 * what a token room's slug looks like. The split is: rooms with a name that
 * somebody chose are here, rooms named after a thing are in the database.
 */

/**
 * @typedef {object} Room
 * @property {string} slug  stored on every message; never change one in place
 * @property {string} name  what the sidebar shows
 * @property {string} blurb one line, shown under the room's title
 */

/** @type {Room[]} */
export const ROOMS = [
  {
    slug: 'lounge',
    name: 'Lounge',
    blurb: 'One room for everyone on PulseDex. Anything goes.',
  },
  {
    slug: 'trading',
    name: 'Trading',
    blurb: 'Charts, entries, exits. What you are watching and why.',
  },
  {
    slug: 'trenches',
    name: 'Trenches',
    blurb: 'New launches and bonding curves. Assume everything is a rug.',
  },
  {
    slug: 'hex',
    name: 'HEX',
    blurb: 'HEX, stakes and the rest of the Richard Heart complex.',
  },
  {
    slug: 'help',
    name: 'Help',
    blurb: 'Stuck on something, or found a bug? Ask here.',
  },
]

/**
 * Where someone lands before they have chosen.
 *
 * First in the list rather than a separate constant, so the two cannot
 * disagree - a default naming a room that had been removed would leave the
 * page loading a room the sidebar cannot highlight.
 */
export const DEFAULT_ROOM = ROOMS[0].slug

const BY_SLUG = new Map(ROOMS.map((room) => [room.slug, room]))

/** The room with this slug, or null. */
export const findRoom = (slug) => (typeof slug === 'string' ? BY_SLUG.get(slug) || null : null)

/**
 * Resolve a requested room to one that exists.
 *
 * Falls back rather than failing: a stale link, a removed room, or a typo
 * should land somebody in the Lounge, not on an error. The endpoint uses
 * `isRoom` instead, because a post is a write and silently redirecting one
 * into a different room than the sender chose would be worse than refusing it.
 */
export const resolveRoom = (slug) => (isRoom(slug) ? slug : DEFAULT_ROOM)

/* ------------------------------------------------------------ token rooms -- */

/**
 * The prefix a token room's slug carries.
 *
 * A hyphen rather than the colon that would read better. `messages.room` has
 * carried a `^[a-z0-9-]{...}$` check since 0002 - 0014 widens how long a slug
 * may be, because an address does not fit in 32 characters, but leaves the
 * character class alone. One separator is not worth allowing a new character
 * in every slug in the schema.
 */
const TOKEN_PREFIX = 'token-'

/** An address as this schema stores one: lowercase, no checksum casing. Two
 *  casings of one address would be two rooms about the same token. */
const ADDRESS = /^0x[0-9a-f]{40}$/

/**
 * The room about a token, from its address.
 *
 * Lowercases first, because an address arrives here from a URL, a search box
 * or an API in whatever casing its source felt like - and a checksummed
 * address and a lowercase one are the same token and must be the same room.
 *
 * Null for anything that is not an address. Callers use that to decide
 * whether a token has a room at all, which is how a page that has not
 * resolved its token yet avoids asking for `token-undefined`.
 *
 * @param {unknown} address
 * @returns {string|null}
 */
export function tokenRoom(address) {
  if (typeof address !== 'string') return null
  const lower = address.toLowerCase()
  return ADDRESS.test(lower) ? `${TOKEN_PREFIX}${lower}` : null
}

/**
 * The token a room is about, or null if it is not about one.
 *
 * The inverse of `tokenRoom`, and checked rather than assumed: a slug is
 * whatever arrived in a request body, so `token-` on the front of it is a
 * claim and not a fact.
 *
 * @param {unknown} slug
 * @returns {string|null}
 */
export function roomToken(slug) {
  if (typeof slug !== 'string' || !slug.startsWith(TOKEN_PREFIX)) return null
  const address = slug.slice(TOKEN_PREFIX.length)
  return ADDRESS.test(address) ? address : null
}

/** Is this the slug of a token room? */
export const isTokenRoom = (slug) => roomToken(slug) !== null

/**
 * Is this a room that could exist?
 *
 * Deliberately "could". For the five it means the room is in the list above
 * and always has been. For a token room it means the slug is well formed -
 * the row may not exist yet, because a token room is created by the first
 * message posted into it, and the check that has to pass before that write is
 * a check on the shape of the name.
 *
 * For a group it means less than that, and the difference is load-bearing. A
 * group is made by a moderator and its name proves nothing about anything, so
 * a well-formed group slug is not evidence that the group exists. The posting
 * endpoint checks the row as well - without that second check, this function
 * returning true would be enough to conjure a group by posting into it, which
 * is precisely the thing "groups are moderator-made" is meant to stop.
 *
 * Used by every endpoint that takes a room in a request body. Without it,
 * anyone could put a message in a room nobody can navigate to: invisible in
 * the sidebar, present in the database, and impossible to moderate through
 * the UI.
 */
export const isRoom = (slug) => BY_SLUG.has(slug) || isTokenRoom(slug) || isGroupRoom(slug)

/**
 * What to call a token room before anything is known about its token.
 *
 * Token rooms have no name in the database, and that is the decision rather
 * than an omission. A name would have to come from whoever posted first,
 * which is a text field on a room everybody else sees - "OFFICIAL", "DO NOT
 * BUY" - attached to a token by a stranger. The room is named after the token
 * instead, by whatever is drawing it: the token page already knows the
 * symbol, and a list that does not falls back to this.
 *
 * @param {string} slug
 * @returns {string}
 */
export function tokenRoomLabel(slug) {
  const address = roomToken(slug)
  if (!address) return slug
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/* ----------------------------------------------------------------- groups -- */

/** The prefix a group's slug carries, for the same reason a token room's
 *  does: it says which rules apply without a database round trip. */
const GROUP_PREFIX = 'group-'

/**
 * What a group may be called.
 *
 * Lowercase letters, digits and hyphens; two to twenty-four characters; not
 * starting or ending with a hyphen. Two rather than one at the bottom end
 * because a one-character group is a name nobody can describe out loud. The same shape a username has everywhere,
 * chosen because people already know it and because it is the shape that
 * survives being put in a URL, a slug and a database check without any of
 * them disagreeing.
 *
 * The matching constraint is `rooms_group_slug_shape` in 0016. A name that
 * passes here and fails there is a group nobody can create, discovered in
 * production.
 */
const GROUP_NAME = /^[a-z0-9][a-z0-9-]{0,22}[a-z0-9]$/

/**
 * Names nobody may take.
 *
 * `token` and `group` because a group called either would produce a slug that
 * reads as a different kind of room. The five because a group named after one
 * is a group pretending to be the room everybody already trusts - "help" is
 * the obvious one to want for that reason.
 */
const RESERVED = new Set(['token', 'group', 'new', 'all', 'admin', ...ROOMS.map((r) => r.slug)])

/**
 * The slug for a group name, or null if the name is not allowed.
 *
 * Lowercases first, so somebody typing "Degens" gets `group-degens` rather
 * than a refusal - the casing of a name is not a rule anybody expects to be
 * enforced, and two groups differing only in case would be two groups nobody
 * can tell apart.
 *
 * @param {unknown} name
 * @returns {string|null}
 */
export function groupSlug(name) {
  if (typeof name !== 'string') return null
  const lower = name.trim().toLowerCase()
  if (!GROUP_NAME.test(lower)) return null
  // Double hyphens are legal by the pattern above and are refused here: they
  // are invisible at a glance, which makes `my--group` a way to sit beside
  // `my-group` in a list and be taken for it.
  if (lower.includes('--')) return null
  if (RESERVED.has(lower)) return null
  return `${GROUP_PREFIX}${lower}`
}

/**
 * The group name a slug carries, or null if it is not a group's.
 *
 * Checked rather than assumed, like `roomToken`: a slug arrives in a request
 * body, so `group-` on the front of it is a claim.
 *
 * @param {unknown} slug
 * @returns {string|null}
 */
export function slugGroup(slug) {
  if (typeof slug !== 'string' || !slug.startsWith(GROUP_PREFIX)) return null
  const name = slug.slice(GROUP_PREFIX.length)
  // Deliberately not `groupSlug`'s full rule: a group created before a name
  // became reserved must keep working. The shape has to hold; the policy
  // about which names may be taken applies at creation.
  return GROUP_NAME.test(name) && !name.includes('--') ? name : null
}

/** Is this the slug of a group? */
export const isGroupRoom = (slug) => slugGroup(slug) !== null
