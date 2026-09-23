import { roomToken, tokenRoomLabel } from '../config/rooms'

/**
 * Narrowing the room list to what somebody typed.
 *
 * Pulled out of the sidebar because it is the part that decides what a search
 * appears to contain, and "the room I was looking for is not in the list" is
 * indistinguishable from "that room does not exist" to whoever is looking.
 *
 * Matching is done here and nowhere else, so the three kinds of room are
 * narrowed by one rule rather than by three that drift.
 */

/**
 * The text a room can be found by.
 *
 * Each kind is findable by what somebody would actually type for it, which is
 * not the same thing for all three:
 *
 *   - A fixed room by its name, because it has one somebody chose.
 *   - A group by its name, for the same reason.
 *   - A token room by its address, because that is all it has - and by the
 *     shortened form the sidebar shows, so that what is on screen is also
 *     what can be typed. Somebody reading "0xa107…9a27" and typing "9a27"
 *     should find it.
 *
 * The slug is always included. It is what a URL carries, so a slug pasted out
 * of the address bar should find its own room.
 *
 * @param {{slug?: string, name?: string|null}} room
 * @returns {string} lowercased, space separated
 */
export function roomHaystack(room) {
  if (!room || typeof room !== 'object') return ''

  const slug = typeof room.slug === 'string' ? room.slug : ''
  const parts = [slug, typeof room.name === 'string' ? room.name : '']

  const token = roomToken(slug)
  if (token) {
    // The full address and the form the list draws. The shortened one carries
    // an ellipsis, which nobody types, so it is split on that character
    // rather than matched whole.
    parts.push(token, ...tokenRoomLabel(slug).split('…'))
  }

  return parts.filter(Boolean).join(' ').toLowerCase()
}

/**
 * Does this room match?
 *
 * A plain substring test, deliberately. Fuzzy matching sounds better and is
 * worse here: a list of five fixed rooms and a handful of groups is small
 * enough to read, so the failure that matters is a search returning something
 * unrelated and burying the thing that was wanted.
 *
 * An empty term matches everything, so a caller does not have to branch
 * between "filtered" and "not filtered".
 *
 * @param {object} room
 * @param {unknown} term
 */
export function roomMatches(room, term) {
  const needle = typeof term === 'string' ? term.trim().toLowerCase() : ''
  if (!needle) return true
  return roomHaystack(room).includes(needle)
}

/**
 * Narrow every section at once.
 *
 * Takes and returns the same shape, so the sidebar renders from one object
 * whether or not anything is being searched for - which is what keeps the
 * filtered and unfiltered lists from being two different pieces of code.
 *
 * `matches` is the total across all three, for deciding whether to say that
 * nothing was found. Counting inside the component would mean summing three
 * arrays at the point where the answer is needed, which is the kind of thing
 * that gets one section forgotten.
 *
 * @param {{fixed?: object[], groups?: object[], tokens?: object[]}} sections
 * @param {unknown} term
 */
export function filterRooms(sections, term) {
  const keep = (list) => (Array.isArray(list) ? list.filter((room) => roomMatches(room, term)) : [])

  const fixed = keep(sections?.fixed)
  const groups = keep(sections?.groups)
  const tokens = keep(sections?.tokens)

  return { fixed, groups, tokens, matches: fixed.length + groups.length + tokens.length }
}
