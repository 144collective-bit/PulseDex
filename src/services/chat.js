import { supabase, hasSupabase } from '../config/supabase'

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

/** How much history a visitor arrives to. Enough to have a conversation to
 *  read, short enough that the first paint is not a scroll through a week. */
export const PAGE_SIZE = 50

/*
 * Messages carry an address; names and avatars live on the profile it points
 * at. Asked for together here so a row arrives ready to render - the
 * alternative, resolving names separately, is a request per author on first
 * paint.
 */
const MESSAGE_FIELDS = 'id, address, body, created_at, profiles ( handle, avatar_id )'

/** Flatten the joined row into something a component can render without
 *  knowing the shape of the query that produced it. */
function toMessage(row) {
  return {
    id: row.id,
    address: row.address,
    body: row.body,
    createdAt: row.created_at,
    handle: row.profiles?.handle || null,
    avatarId: row.profiles?.avatar_id || null,
  }
}

/**
 * The most recent messages, oldest first.
 *
 * Fetched newest-first because that is what the index is for and what a limit
 * of fifty should mean, then reversed, because a conversation reads downward.
 */
export async function fetchRecentMessages({ limit = PAGE_SIZE } = {}) {
  if (!hasSupabase) return []

  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_FIELDS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data || []).map(toMessage).reverse()
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
export function subscribeToMessages({ onMessage, onRemoved }) {
  if (!hasSupabase) return () => {}

  const channel = supabase
    .channel('chat-messages')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      async (payload) => {
        const message = await fetchMessage(payload.new.id)
        if (message) onMessage(message)
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages' },
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
 * The handle and avatar travel with it so the profile row is kept current
 * without a second request, but they are only a suggestion: the endpoint
 * validates both and ignores either if it cannot use it. The address is not
 * sent at all - it comes from the sign-in cookie, and a body that could name
 * its own author would let anyone post as anyone.
 */
export async function postMessage({ body, handle, avatarId }) {
  const res = await fetch('/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Sends the session cookie on a same-origin request, which is the only
    // kind this endpoint accepts.
    credentials: 'same-origin',
    body: JSON.stringify({ body, handle, avatarId }),
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
