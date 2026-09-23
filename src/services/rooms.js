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
    // Archived rooms, for the same reason as in fetchGroups below: the policy
    // hides them once 0018 has run, and this hides them before it has.
    .filter((row) => !row.archived_at)
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

/**
 * The groups, busiest first.
 *
 * Unlike token rooms, a group with nothing said in it is still listed. One
 * exists because a moderator made it deliberately, and a new group that is
 * invisible until somebody posts is a group nobody can find to post in.
 *
 * @param {{limit?: number}} params
 */
export async function fetchGroups({ limit = 12 } = {}) {
  if (!hasSupabase) return []

  const { data, error } = await supabase
    .from('rooms')
    .select(ROOM_FIELDS)
    .eq('kind', 'group')
    // Nulls last, so a group nobody has posted in sits at the bottom rather
    // than at the top where Postgres puts nulls by default on a descending
    // sort.
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) throw dbError(error, 'load the groups')
  /*
   * Archived rooms dropped here as well as by the policy.
   *
   * 0018 narrows the anon read policy to live rooms, so in production these
   * never arrive. This filter is for the deployment where that migration has
   * not been run yet - which is every deployment between a release and
   * somebody opening the SQL editor - and a room nobody can post in sitting
   * in everybody's sidebar is exactly the failure archiving exists to
   * prevent. Two cheap checks beat one that is right only after a manual
   * step.
   */
  return (data || [])
    .filter((row) => !row.archived_at)
    .map(toRoom)
    .filter((room) => room.name)
}

/** Create a group. Moderators only; the endpoint answers 404 to anybody else,
 *  so this offers no way to discover that the route exists. */
export async function createGroup({ name, blurb, gateToken, minBalance }) {
  const res = await fetch('/api/rooms/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ name, blurb, gateToken, minBalance }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'That group could not be created.')
  return payload.group
}

/**
 * Change what a group requires, or what it says about itself.
 *
 * The gate is replaced wholesale rather than patched: a gate is a token and
 * an amount together, and sending one without the other would be a way to
 * leave a room gated on an amount in the wrong scale. Omitting `gateToken`
 * removes the gate and opens the room.
 *
 * Moderators only; the endpoint answers 404 to anybody else, so this offers
 * no way to discover that the route exists.
 */
export async function editGroup({ slug, blurb, gateToken, minBalance }) {
  const res = await fetch('/api/rooms/groups', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ slug, blurb, gateToken, minBalance }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'That change could not be saved.')
  return payload.group
}

/**
 * Take a group down.
 *
 * Archived rather than deleted - the conversation stays readable and the room
 * leaves the sidebar. See 0018_room_admin.sql for why a real delete is the
 * wrong shape: `messages.room` is a foreign key, so deleting a room either
 * destroys the evidence that justified taking it down or is refused outright.
 */
export async function archiveGroup(slug) {
  const res = await fetch('/api/rooms/groups', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ slug }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'That room could not be taken down.')
  return true
}

/**
 * When a room's rule last changed, and to what.
 *
 * Read over the anon key like the rooms themselves, because the rule is
 * public - a room has always said what it requires before somebody types.
 * When it changes, the people it changed for are exactly the people who need
 * telling, and most of them are not signed in to a moderator account.
 *
 * Only the most recent, because that is what a notice in a room is: "this
 * changed", not a changelog. The whole history is in the table for anybody
 * who needs it.
 *
 * Failures come back as null. A room whose notice cannot be read is a room
 * without a notice, not a room that will not load.
 *
 * @param {string} slug
 * @returns {Promise<{changedAt: string, changedBy: string|null, gate: object|null}|null>}
 */
export async function fetchLatestGateChange(slug) {
  if (!hasSupabase || typeof slug !== 'string' || !slug) return null

  const { data, error } = await supabase
    .from('room_gate_changes')
    .select('changed_at, changed_by, gate_token, min_balance, gate_decimals, gate_symbol')
    .eq('room', slug)
    .order('changed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  return {
    changedAt: data.changed_at,
    changedBy: data.changed_by || null,
    /*
     * The gate as it became, in the shape `roomGate` already reads - so the
     * notice and the room's own rule line are rendered by one function. Null
     * when the change was to remove the gate.
     */
    gate: data.gate_token
      ? {
          gate_token: data.gate_token,
          min_balance: data.min_balance,
          gate_decimals: data.gate_decimals,
          gate_symbol: data.gate_symbol,
        }
      : null,
  }
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
    /*
     * The gate as the row holds it, unflattened on purpose: `roomGate` in
     * src/utils/gate.js is the one place that decides what counts as a gate,
     * and reshaping the columns here would be a second place that could
     * disagree with it.
     */
    gate_token: row.gate_token || null,
    min_balance: row.min_balance ?? null,
    gate_decimals: row.gate_decimals ?? null,
    gate_symbol: row.gate_symbol || null,
  }
}
