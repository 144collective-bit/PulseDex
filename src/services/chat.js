import { supabase, hasSupabase } from '../config/supabase'
import { PAGE_SIZE, hasMoreBefore } from '../utils/chatPaging'
import { MESSAGE_FIELDS } from '../config/queries'

/**
 * Reading and writing the chat.
 *
 * Reads come straight from Supabase over the anon key, which row level
 * security restricts to exactly that. Writes go to our own endpoint, which is
 * the only thing holding a key that can write, and which checks the sign-in
 * cookie before it does. So the two halves of this file talk to two different
 * places on purpose, and the asymmetry is the security model rather than an
 * accident of how it grew.
 */

/** Flatten the joined row into something a component can render without
 *  knowing the shape of the query that produced it. */
function toMessage(row) {
  return {
    id: row.id,
    address: row.address,
    room: row.room,
    body: row.body,
    createdAt: row.created_at,
    handle: row.profiles?.handle || null,
    avatarId: row.profiles?.avatar_id || null,
    // The uploaded picture, when there is one. Preferred over the preset
    // wherever a message is drawn - somebody who went to the trouble of
    // uploading a face has said which of the two they meant.
    avatarUrl: row.profiles?.avatar_url || null,
    // Set when the author changed it. Rendered as an "edited" marker, which is
    // the reason editing is allowed at all: a silent edit is a way to change
    // what you said after somebody answered it.
    editedAt: row.edited_at || null,
    reactions: Array.isArray(row.message_reactions) ? row.message_reactions : [],
  }
}

/**
 * Reactions, counted, with whether you are among them.
 *
 * Done here rather than in the component so a row renders from a shape it can
 * use directly, and so the "have I reacted" test is one lowercase comparison
 * written once. Two accounts differing only in case are the same account
 * everywhere except a string compare, and that is precisely the bug that ends
 * with somebody unable to remove their own reaction.
 *
 * @param {{emoji: string, address: string}[]} reactions
 * @param {string|null} me
 * @returns {{emoji: string, count: number, mine: boolean}[]}
 */
export function tallyReactions(reactions, me) {
  const mine = me ? me.toLowerCase() : null
  const counts = new Map()

  for (const reaction of reactions || []) {
    if (typeof reaction?.emoji !== 'string') continue
    const entry = counts.get(reaction.emoji) || { emoji: reaction.emoji, count: 0, mine: false }
    entry.count += 1
    if (mine && reaction.address === mine) entry.mine = true
    counts.set(reaction.emoji, entry)
  }

  // Most-reacted first, then by emoji so the order is stable as counts tie -
  // a row whose reactions reshuffle on every render is unusable.
  return [...counts.values()].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
}

/**
 * The most recent messages, oldest first.
 *
 * Fetched newest-first because that is what the index is for and what a limit
 * of fifty should mean, then reversed, because a conversation reads downward.
 */
export async function fetchMessagePage({ room, before = null, limit = PAGE_SIZE } = {}) {
  if (!hasSupabase) return { messages: [], hasMore: false }

  let query = supabase
    .from('messages')
    .select(MESSAGE_FIELDS)
    .eq('room', room)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Exclusive, so the message the cursor came from is not returned again. An
  // inclusive bound would refetch the same page forever, and the merge would
  // hide it by absorbing the duplicate.
  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = data || []
  return { messages: rows.map(toMessage).reverse(), hasMore: hasMoreBefore(rows, limit) }
}

/** One message with its author attached, by id. */
async function fetchMessage(id) {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_FIELDS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) return null
  return toMessage(data)
}

/**
 * Watch for messages arriving and leaving.
 *
 * Returns the unsubscribe function. Two events matter and they are not
 * symmetrical: an insert is a new message, and an update is almost always a
 * removal, since `deleted_at` is the only column anything ever changes.
 *
 * An insert arrives as the raw row, without the joined profile - the feed
 * publishes what changed in one table and knows nothing about the join. So
 * each one is fetched back by id to pick up its author. That is a small query
 * per message, which is affordable precisely because the rate limit means
 * messages cannot arrive faster than people can type.
 *
 * @param {{ onMessage: (message: object) => void, onRemoved: (id: number) => void }} handlers
 */
export function subscribeToMessages({ room, onMessage, onRemoved, onReaction }) {
  if (!hasSupabase) return () => {}

  /*
   * One channel per room, named after it.
   *
   * The filter is applied by the server, so a busy room costs nothing to
   * anyone reading a quiet one - which is the whole reason to filter here
   * rather than subscribing to everything and discarding what does not match.
   */
  /*
   * The room, plus something unique. Two different rooms never collided, but
   * leaving one and returning to it does: the panel remounts, and
   * `removeChannel` is asynchronous, so the new subscription can be created
   * while the old one is still leaving. Names are per-connection and every
   * channel shares one websocket, so uniqueness is free.
   */
  const channel = supabase
    .channel(`chat-messages-${room}-${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room=eq.${room}` },
      async (payload) => {
        const message = await fetchMessage(payload.new.id)
        if (message) onMessage(message)
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room=eq.${room}` },
      async (payload) => {
        /*
         * An update used to mean exactly one thing - a removal - because
         * `deleted_at` was the only column anything ever wrote. Editing added
         * a second, so the two are told apart here rather than assumed.
         */
        if (payload.new.deleted_at) {
          onRemoved(payload.new.id)
          return
        }

        // Fetched back rather than merged from the payload: the change feed
        // publishes one table's row and knows nothing about the joined profile
        // or the reactions, so using it directly would blank both.
        const message = await fetchMessage(payload.new.id)
        if (message) onMessage(message)
      },
    )
    /*
     * Reactions, on the same socket.
     *
     * Unfiltered, because message_reactions has no room column to filter on -
     * a reaction knows its message and the message knows the room. The hook
     * discards anything whose message it is not holding, which is cheap
     * because the payload carries the message id and needs no lookup.
     *
     * A delete publishes only the replica identity, which for this table is
     * the primary key - and the primary key is the message, the author and
     * the emoji. So a removal arrives complete and can be undone locally
     * without a round trip.
     */
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message_reactions' },
      (payload) => {
        onReaction?.({ ...payload.new, on: true })
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'message_reactions' },
      (payload) => {
        onReaction?.({ ...payload.old, on: false })
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * Post a message.
 *
 * Only the room and the text. Neither the author nor their name is sent: the
 * address comes from the sign-in cookie, and the name from the profile that
 * cookie identifies. A body that could name its own author would let anyone
 * post as anyone; one that could name its own handle would let a stale tab
 * rename the account.
 */
export async function postMessage({ room, body }) {
  const res = await fetch('/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Sends the session cookie on a same-origin request, which is the only
    // kind this endpoint accepts.
    credentials: 'same-origin',
    body: JSON.stringify({ room, body }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    /*
     * The endpoint's own sentence, when it sent one. It knows things the
     * browser does not - which limit was hit, how long to wait - and a generic
     * "something went wrong" would throw that away.
     */
    throw new Error(payload.error || 'Your message could not be posted.')
  }

  return payload.message ? toMessage(payload.message) : null
}

/**
 * Change one of your own messages.
 *
 * Yours only - the endpoint answers 404 for anybody else's, and for one that
 * does not exist, so this cannot be used to ask who wrote a given id.
 */
export async function editMessage({ id, body }) {
  const res = await fetch('/api/chat/messages', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ id, body }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'That message could not be edited.')
  return payload.message ? toMessage(payload.message) : null
}

/** React to a message, or take it back. Adding twice leaves one; removing
 *  twice leaves none - neither is an error. */
export async function setReaction({ id, emoji, on }) {
  const res = on
    ? await fetch('/api/chat/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id, emoji }),
      })
    : await fetch(
        `/api/chat/reactions?id=${encodeURIComponent(id)}&emoji=${encodeURIComponent(emoji)}`,
        { method: 'DELETE', credentials: 'same-origin' },
      )

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'That reaction could not be saved.')
  }
}

/** Remove a message. Your own always; anyone's if you are a moderator. For
 *  anyone else the endpoint answers as though the route does not exist. */
export async function removeMessage(id) {
  const res = await fetch(`/api/chat/messages?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'That message could not be removed.')
  }
}

/**
 * Who else is in this room.
 *
 * Supabase's presence, which is held by the realtime connection rather than in
 * a table - so it needs no schema, and a browser that closes drops out of it
 * without anything having to notice.
 *
 * A count, and nothing more. Presence could carry the address of everyone
 * signed in, and showing that would say which wallets are reading a chat about
 * what to buy - to anyone with the anon key, which is everyone. A number
 * answers "is anyone here" without answering "who".
 *
 * The key is random per tab rather than per wallet, deliberately: keying by
 * address would both publish the address and make one person on two devices
 * count once.
 *
 * @param {{ room: string, onCount: (count: number) => void }} handlers
 * @returns {() => void} unsubscribe
 */
export function subscribeToPresence({ room, onCount }) {
  if (!hasSupabase) return () => {}

  const channel = supabase.channel(`chat-presence-${room}-${crypto.randomUUID()}`, {
    config: { presence: { key: crypto.randomUUID() } },
  })

  const report = () => onCount(Object.keys(channel.presenceState()).length)

  channel
    .on('presence', { event: 'sync' }, report)
    .on('presence', { event: 'join' }, report)
    .on('presence', { event: 'leave' }, report)
    .subscribe((status) => {
      // Tracked only once the channel is actually joined; calling track before
      // that is dropped, and the tab would be counted by nobody including
      // itself.
      if (status === 'SUBSCRIBED') channel.track({ at: Date.now() })
    })

  return () => {
    supabase.removeChannel(channel)
  }
}
