import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { isReaction } from '../../../src/config/reactions.js'
import { notifyReaction } from '../../_lib/notify.js'

/**
 * Reacting to a message, and taking it back.
 *
 * The lightest write in the app and still a write, so it goes through the same
 * door as every other one: the address comes from the sign-in cookie and never
 * from the body, because a reaction that could name its own author would let
 * anybody manufacture agreement under somebody else's name.
 *
 * POST adds one, DELETE removes it. Not a toggle on one verb, deliberately -
 * a toggle's outcome depends on state the caller cannot see, so a retry after
 * a timeout undoes the thing it was retrying. These two are idempotent: adding
 * twice leaves one row, removing twice leaves none.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  let address = null
  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    address = session?.sub || null
  } catch {
    address = null
  }

  if (!address) return res.status(401).json({ error: 'Sign in to react.' })

  /*
   * Generous, because reacting is meant to be cheap, and still bounded - a
   * script could otherwise walk a room adding six reactions to every message
   * and turn a chat into a wall of numbers.
   */
  const limited = rateLimit(req, { key: 'chat-react', limit: 60, windowMs: 60_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Slow down a moment.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Chat is not configured on this deployment.' })

  if (req.method === 'POST') return add(req, res, db, address)
  if (req.method === 'DELETE') return drop(req, res, db, address)

  res.setHeader('Allow', 'POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

/** The message and emoji from a request, or null if either is unusable. */
function target({ id, emoji }) {
  const messageId = Number(id)
  if (!Number.isInteger(messageId) || messageId <= 0) return null

  /*
   * Checked against the fixed list, not merely against being a short string.
   * This value is stored and then rendered beside somebody else's message, so
   * free text here is a way to post arbitrary content without it being a
   * message - past the length limit, past the invisible-character stripping,
   * and past the rate limit that governs posting.
   */
  if (!isReaction(emoji)) return null

  return { messageId, emoji }
}

async function add(req, res, db, address) {
  const wanted = target(req.body || {})
  if (!wanted) return res.status(400).json({ error: 'That is not a reaction.' })

  // The profile row has to exist, because the column references one. Somebody
  // who has only ever read the chat is exactly who reacts first.
  const profile = await db
    .from('profiles')
    .upsert({ address }, { onConflict: 'address', ignoreDuplicates: true })

  if (profile.error) {
    console.error('reactions: ensuring the profile row failed:', profile.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  const { error } = await db.from('message_reactions').upsert(
    { message_id: wanted.messageId, address, emoji: wanted.emoji },
    // The primary key is every column that identifies the reaction, so a
    // repeat is the same row. Ignoring the duplicate is what makes this
    // idempotent rather than an error somebody has to handle.
    { onConflict: 'message_id,address,emoji', ignoreDuplicates: true },
  )

  if (error) {
    // 23503 is the foreign key: no such message. Same 404 a removed message
    // gets elsewhere, so this does not become a way to probe which ids exist.
    if (error.code === '23503') return res.status(404).json({ error: 'Not found.' })
    console.error('reactions: the insert failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  // Same reasoning as everywhere else this is called: awaited so it survives
  // the response, and unable to fail the reaction that caused it.
  await notifyReaction(db, { messageId: wanted.messageId, actor: address })

  return res.status(201).json({ ...wanted, reacted: true })
}

async function drop(req, res, db, address) {
  // Query string, not a body: the dev server's shim only parses a body for
  // POST and PUT, so a DELETE body would work on Vercel and fail locally.
  const url = new URL(req.url, 'http://localhost')
  const wanted = target({ id: url.searchParams.get('id'), emoji: url.searchParams.get('emoji') })
  if (!wanted) return res.status(400).json({ error: 'That is not a reaction.' })

  // Scoped to this address, so nobody can remove anybody else's.
  const { error } = await db
    .from('message_reactions')
    .delete()
    .eq('message_id', wanted.messageId)
    .eq('address', address)
    .eq('emoji', wanted.emoji)

  if (error) {
    console.error('reactions: the removal failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  // Removing one that was not there is success: the caller wanted it gone.
  return res.status(200).json({ ...wanted, reacted: false })
}
