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
 * Is this a room that exists?
 *
 * Used by the endpoint on every post, because `room` arrives in a request body
 * and a body is whatever the sender decided to send. Without this, anyone
 * could create a room nobody can navigate to by posting into it - invisible in
 * the sidebar, present in the database, and impossible to moderate through the
 * UI.
 */
export const isRoom = (slug) => BY_SLUG.has(slug)

/**
 * Resolve a requested room to one that exists.
 *
 * Falls back rather than failing: a stale link, a removed room, or a typo
 * should land somebody in the Lounge, not on an error. The endpoint uses
 * `isRoom` instead, because a post is a write and silently redirecting one
 * into a different room than the sender chose would be worse than refusing it.
 */
export const resolveRoom = (slug) => (isRoom(slug) ? slug : DEFAULT_ROOM)
