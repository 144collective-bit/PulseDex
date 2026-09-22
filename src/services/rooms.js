import { supabase, hasSupabase } from '../config/supabase'
import { ROOM_FIELDS } from '../config/queries'
import { dbError } from '../utils/dbError'
import { roomToken, tokenRoom } from '../config/rooms'

/**
 * Which rooms exist, for the ones this app cannot know in advance.
 *
 * The five fixed rooms are in src/config/rooms.js and need no query - they
 * are the same five on every deployment. A token room exists because somebody
 * posted in it, so the only way to know is to ask.
 *
 * Read over the anon key, straight from the browser: which rooms exist is
 * public, and `rooms` has a select policy saying so. Creating one is not - it
 * happens inside the endpoint that writes the first message.
 */

/**
 * The token rooms with something happening in them, busiest-first.
 *
 * "Recently" rather than "most", deliberately: a room that took a hundred
 * messages in an hour last March is not where the conversation is, and a list
 * ordered by total would be a list of what was once popular. `last_message_at`
 * is maintained by the posting endpoint, so this is an index scan rather than
 * an aggregate over every message.
 *
 * @param {{limit?: number}} params
 * @returns {Promise<{slug: string, address: string, messageCount: number, lastMessageAt: string|null}[]>}
 */
export async function fetchActiveTokenRooms({ limit = 8 } = {}) {
  if (!hasSupabase) return []

  const { data, error } = await supabase
    .from('rooms')
    .select(ROOM_FIELDS)
    .eq('kind', 'token')
    // A room with no messages has no activity to rank and nothing to show.
    // One can exist: `note_room_message` creates it with a count of one, but
    // a moderator removing that message leaves the room behind.
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(limit)

  if (error) throw dbError(error, 'load the token rooms')

  return (data || [])
    .map(toRoom)
    // A row whose slug does not parse back to an address cannot be linked
    // anywhere, so it is dropped rather than drawn as a dead entry. The check
    // constraint makes this unreachable; it costs one filter to not depend on
    // that being true.
    .filter((room) => room.address !== null)
}

/**
 * One token's room, or null if nobody has said anything about it yet.
 *
 * Null is the ordinary answer, not an error: most tokens have no room, and
 * the token page uses this only to decide whether to show a count beside its
 * Chat tab. The conversation itself reads `messages` directly and shows an
 * empty room, which is what a room with no row looks like from that side.
 *
 * @param {string} address
 */
export async function fetchTokenRoom(address) {
  const slug = tokenRoom(address)
  if (!hasSupabase || !slug) return null

  const { data, error } = await supabase
    .from('rooms')
    .select(ROOM_FIELDS)
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw dbError(error, 'load this token’s room')
  return data ? toRoom(data) : null
}

/** Flatten a room row into what a component renders from. */
function toRoom(row) {
  return {
    slug: row.slug,
    kind: row.kind,
    /*
     * Taken from the slug rather than from `token_address`, even though the
     * column is right there. The slug is what every link is built from, so
     * reading the address back out of it means the address shown and the room
     * opened cannot disagree - and a row where they did disagree is filtered
     * out above rather than rendered.
     */
    address: roomToken(row.slug),
    name: row.name || null,
    blurb: row.blurb || null,
    messageCount: Number(row.message_count) || 0,
    lastMessageAt: row.last_message_at || null,
  }
}
