import { supabase, hasSupabase } from '../config/supabase'
import { PAGE_SIZE, hasMoreBefore } from '../utils/chatPaging'

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

/*
 * Messages carry an address; names and avatars live on the profile it points
 * at. Asked for together here so a row arrives ready to render - the
 * alternative, resolving names separately, is a request per author on first
 * paint.
 */
const MESSAGE_FIELDS =
  'id, address, room, body, created_at, profiles ( handle, avatar_id, avatar_url )'

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
  }
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
export function subscribeToMessages({ room, onMessage, onRemoved }) {
  if (!hasSupabase) return () => {}

  /*
   * One channel per room, named after it.
   *
   * The filter is applied by the server, so a busy room costs nothing to
   * anyone reading a quiet one - which is the whole reason to filter here
   * rather than subscribing to everything and discarding what does not match.
   */
  const channel = supabase
    .channel(`chat-messages-${room}`)
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
      (payload) => {
        if (payload.new.deleted_at) onRemoved(payload.new.id)
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

/** Remove a message. Only a configured moderator can; for anyone else the
 *  endpoint answers as though the route does not exist. */
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

  const channel = supabase.channel(`chat-presence-${room}`, {
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
