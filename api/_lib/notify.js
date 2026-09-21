import { findTypedMentions } from '../../src/utils/mentions.js'

/**
 * Recording who was named, and telling them.
 *
 * Every function here follows one rule: a notification that cannot be written
 * must never fail the thing that caused it. Somebody's post is theirs and has
 * already been accepted by the time any of this runs; losing it because an
 * inbox row would not insert would be trading the valuable thing for the
 * cheap one. So each of these swallows its own failures and logs them, and
 * none of them is awaited for correctness.
 */

/**
 * How many people one post may notify.
 *
 * Not a technical limit - the insert would take hundreds happily. It is there
 * because a post naming fifty accounts is not a conversation, and the cheapest
 * place to stop that is before the rows exist.
 */
const MAX_MENTIONS_PER_POST = 10

/** Is this a wallet address, rather than something shaped like one? */
const isAddress = (value) => typeof value === 'string' && /^0x[a-f0-9]{40}$/.test(value)

/**
 * Work out who a post names, from what was typed and what was picked.
 *
 * Two sources, deliberately. Typed `@handle` text is parsed here because the
 * server cannot trust the client to tell it who was mentioned - a request
 * naming somebody the body never mentions would put a post in their inbox
 * that does not refer to them. Explicit addresses come from the composer's
 * own list, and exist because a handle containing a space cannot be found in
 * text by any rule; they are checked against `profiles` before they count.
 *
 * @returns {Promise<string[]>} addresses, never including the author
 */
export async function resolveMentions(db, { body, author, explicit = [] }) {
  const handles = findTypedMentions(body)

  const wanted = new Set()

  if (handles.length > 0) {
    const { data, error } = await db
      .from('profiles')
      .select('address, handle_lower')
      .in('handle_lower', handles.slice(0, MAX_MENTIONS_PER_POST))

    if (error) {
      console.error('notify: resolving typed mentions failed:', error.message)
    } else {
      for (const row of data || []) wanted.add(row.address)
    }
  }

  // Addresses the composer supplied. Filtered to ones that exist, so a
  // fabricated list cannot create mention rows pointing at nobody - the
  // foreign key would refuse them anyway, but refusing here keeps one bad
  // entry from taking the whole insert down with it.
  const claimed = (Array.isArray(explicit) ? explicit : [])
    .filter(isAddress)
    .slice(0, MAX_MENTIONS_PER_POST)

  if (claimed.length > 0) {
    const { data, error } = await db.from('profiles').select('address').in('address', claimed)
    if (error) {
      console.error('notify: checking picked mentions failed:', error.message)
    } else {
      for (const row of data || []) wanted.add(row.address)
    }
  }

  // Mentioning yourself is an ordinary thing to write and is not news. The
  // schema refuses it too; filtering here means the insert is not asked to.
  wanted.delete(author)

  return [...wanted].slice(0, MAX_MENTIONS_PER_POST)
}

/**
 * Write the mention rows and the notifications that go with them.
 *
 * The rows and the notifications are separate things and both are wanted: the
 * rows are how the post is drawn afterwards, for everybody, forever; the
 * notifications are a message to one person, once.
 */
export async function recordMentions(db, { postId, author, addresses }) {
  if (!Array.isArray(addresses) || addresses.length === 0) return

  try {
    const mentions = await db
      .from('post_mentions')
      .upsert(
        addresses.map((address) => ({ post_id: postId, address })),
        { onConflict: 'post_id,address', ignoreDuplicates: true }
      )
    if (mentions.error) {
      console.error('notify: writing mention rows failed:', mentions.error.message)
    }

    await raise(
      db,
      addresses.map((recipient) => ({
        recipient,
        kind: 'mention',
        actor: author,
        post_id: postId,
      }))
    )
  } catch (err) {
    console.error('notify: mentions failed:', err?.message || err)
  }
}

/**
 * Tell somebody their post was replied to.
 *
 * The parent's author is read here rather than taken from the request, for
 * the same reason the body is parsed rather than trusted: a client saying who
 * to notify is a client that can notify anybody.
 */
export async function notifyReply(db, { postId, parentId, author }) {
  if (!parentId) return

  try {
    const parent = await db.from('posts').select('address').eq('id', parentId).maybeSingle()
    if (parent.error || !parent.data) return

    const recipient = parent.data.address
    // Replying to yourself is how a thread is written. Not news.
    if (!recipient || recipient === author) return

    await raise(db, [{ recipient, kind: 'reply', actor: author, post_id: postId }])
  } catch (err) {
    console.error('notify: reply failed:', err?.message || err)
  }
}

/** Tell somebody they were followed. */
export async function notifyFollow(db, { follower, followee }) {
  if (!follower || !followee || follower === followee) return

  try {
    await raise(db, [{ recipient: followee, kind: 'follow', actor: follower }])
  } catch (err) {
    console.error('notify: follow failed:', err?.message || err)
  }
}

/** Tell somebody their chat message was reacted to. */
export async function notifyReaction(db, { messageId, actor }) {
  if (!messageId || !actor) return

  try {
    const message = await db.from('messages').select('address').eq('id', messageId).maybeSingle()
    if (message.error || !message.data) return

    const recipient = message.data.address
    if (!recipient || recipient === actor) return

    await raise(db, [{ recipient, kind: 'reaction', actor, message_id: messageId }])
  } catch (err) {
    console.error('notify: reaction failed:', err?.message || err)
  }
}

/**
 * Insert notification rows, ignoring the ones that already exist.
 *
 * `notifications_once_idx` is what makes re-reacting, or editing a post that
 * mentions somebody, not tell them twice. Hitting it is the ordinary case and
 * not an error, so the conflict is ignored rather than reported.
 */
async function raise(db, rows) {
  if (rows.length === 0) return

  const { error } = await db
    .from('notifications')
    .upsert(rows, {
      onConflict: 'recipient,kind,actor,post_id,message_id',
      ignoreDuplicates: true,
    })

  if (error) console.error('notify: raising notifications failed:', error.message)
}
