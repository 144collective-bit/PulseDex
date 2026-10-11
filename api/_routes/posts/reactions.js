import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { isReaction } from '../../../src/config/reactions.js'
import { notifyPostReaction } from '../../_lib/notify.js'

/**
 * Reacting to a post, and taking it back.
 *
 * Deliberately a near-copy of api/_routes/chat/reactions.js rather than a
 * shared handler the two parameterise. They differ in the table, the
 * notification and the id, which is most of what either one is - a shared
 * version would be three arguments and a conditional, and the thing that
 * actually matters about both is that the rules stay identical. Keeping them
 * side by side makes a divergence visible in a diff; hiding them behind one
 * function would make it invisible.
 *
 * POST adds one, DELETE removes it. Not a toggle on one verb: a toggle's
 * outcome depends on state the caller cannot see, so a retry after a timeout
 * undoes the thing it was retrying. These two are idempotent - adding twice
 * leaves one row, removing twice leaves none.
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
   * script could otherwise walk a feed adding six reactions to every post and
   * turn it into a wall of numbers.
   */
  const limited = rateLimit(req, { key: 'post-react', limit: 60, windowMs: 60_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Slow down a moment.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Posting is not configured on this deployment.' })

  if (req.method === 'POST') return add(req, res, db, address)
  if (req.method === 'DELETE') return drop(req, res, db, address)

  res.setHeader('Allow', 'POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

/** The post and emoji from a request, or null if either is unusable. */
function target({ id, emoji }) {
  const postId = Number(id)
  if (!Number.isInteger(postId) || postId <= 0) return null

  /*
   * Checked against the fixed list, not merely against being a short string.
   * This value is stored and then rendered beside somebody else's post, so
   * free text here is a way to publish arbitrary content without it being a
   * post - past the length limit, past the invisible-character stripping, past
   * the rate limit that governs posting, and onto every screen that draws the
   * post it is attached to.
   */
  if (!isReaction(emoji)) return null

  return { postId, emoji }
}

async function add(req, res, db, address) {
  const wanted = target(req.body || {})
  if (!wanted) return res.status(400).json({ error: 'That is not a reaction.' })

  // The profile row has to exist, because the column references one. Somebody
  // who has only ever read the feed is exactly who reacts first.
  const profile = await db
    .from('profiles')
    .upsert({ address }, { onConflict: 'address', ignoreDuplicates: true })

  if (profile.error) {
    console.error('post reactions: ensuring the profile row failed:', profile.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  const { error } = await db.from('post_reactions').upsert(
    { post_id: wanted.postId, address, emoji: wanted.emoji },
    // The primary key is every column that identifies the reaction, so a
    // repeat is the same row. Ignoring the duplicate is what makes this
    // idempotent rather than an error somebody has to handle.
    { onConflict: 'post_id,address,emoji', ignoreDuplicates: true },
  )

  if (error) {
    // 23503 is the foreign key: no such post. The same 404 a removed post
    // gives elsewhere, so this does not become a way to probe which ids exist.
    if (error.code === '23503') return res.status(404).json({ error: 'Not found.' })
    console.error('post reactions: the insert failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  /*
   * Awaited rather than left running, like every other call into notify.js:
   * this is a serverless function, and work still outstanding when the
   * response is sent gets killed with the process. It cannot fail the reaction
   * that caused it - notify.js swallows and logs its own errors.
   */
  await notifyPostReaction(db, { postId: wanted.postId, actor: address })

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
    .from('post_reactions')
    .delete()
    .eq('post_id', wanted.postId)
    .eq('address', address)
    .eq('emoji', wanted.emoji)

  if (error) {
    console.error('post reactions: the removal failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  // Removing one that was not there is success: the caller wanted it gone.
  return res.status(200).json({ ...wanted, reacted: false })
}
