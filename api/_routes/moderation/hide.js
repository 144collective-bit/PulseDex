import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { logAction } from '../../_lib/moderation.js'
import { parseAdminAddresses, isAdminAddress } from '../../../src/utils/chatAdmin.js'

/**
 * Take a post out of the feed, or put it back.
 *
 * The middle setting moderation did not have. Before this there were two
 * answers to a reported post - leave it, or remove it - and removal is
 * permanent enough that the honest response to anything borderline was to do
 * nothing. A hide is reversible in one press, so it is the one a moderator can
 * afford to get wrong.
 *
 * **A hide is a visibility measure and never a containment one.** Said in 0021
 * and said again here, because this is the endpoint somebody will reach for
 * when they want something gone:
 *
 *   The anon read policy on `posts` is `using (deleted_at is null)` and is not
 *   narrowed to `hidden_at is null`. It cannot be - row level security has no
 *   identity here, so a policy hiding these rows would hide them from their
 *   own author too, and an author not told their post is pending review has
 *   simply had it vanish. So a hidden post still comes back from the database
 *   for anybody reading it with the anon key directly.
 *
 * If a post needs to be genuinely unreadable, that is a removal - DELETE
 * /api/posts, which the policy does enforce. A moderator reaching for
 * containment should remove, and this route's job is the other thing.
 *
 * POST hides, DELETE unhides. Both are moderator-only and both write the audit
 * trail 0021 added, which is the other half of what this batch is for: the
 * previous moderation surfaces changed things and recorded nothing.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  let moderator = null
  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    moderator = session?.sub || null
  } catch {
    moderator = null
  }

  if (!moderator || !isAdminAddress(moderator, parseAdminAddresses(process.env.ADMIN_ADDRESSES))) {
    /*
     * 404, matching every other moderator route here. A 403 confirms there is
     * something behind this worth having, which is a hint not worth giving for
     * a route whose whole security is a list of addresses in a variable.
     */
    return res.status(404).json({ error: 'Not found.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Moderation is not configured on this deployment.' })

  if (req.method === 'POST') return hide(req, res, db, moderator)
  if (req.method === 'DELETE') return unhide(req, res, db, moderator)

  res.setHeader('Allow', 'POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

/** A post id from a request, or null. */
function postId(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

async function hide(req, res, db, moderator) {
  const id = postId(req.body?.id)
  if (!id) return res.status(400).json({ error: 'That is not a post.' })

  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : null

  /*
   * Read first, for the author's address, which the log entry wants. A log
   * row naming only the post id answers "what was done" and not "to whom" -
   * and the post can be hard-deleted later, at which point the id names
   * nothing and the entry is unreadable. 0021 gives the log no foreign keys
   * for exactly this reason: it has to outlive what it describes.
   */
  const post = await db
    .from('posts')
    .select('id, address, hidden_at, deleted_at')
    .eq('id', id)
    .maybeSingle()

  if (post.error) {
    console.error('hide: reading the post failed:', post.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  if (!post.data || post.data.deleted_at) return res.status(404).json({ error: 'Not found.' })

  const { error } = await db
    .from('posts')
    .update({ hidden_at: new Date().toISOString(), hidden_by: moderator })
    .eq('id', id)

  if (error) {
    console.error('hide: the update failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  /*
   * Logged after the update, and the order matters: an entry saying a post was
   * hidden, written before an update that then failed, is worse than a missing
   * entry - it is a record of something that did not happen.
   *
   * `hidden_by` is overwritten even when the post was already hidden by the
   * system, and that is the intended behaviour: a moderator who presses hide
   * on an auto-hidden post has reviewed it and is taking ownership of the
   * decision. The log keeps both entries, so the automatic one is still there.
   */
  await logAction(db, {
    actor: moderator,
    action: 'hide_post',
    subjectPostId: id,
    subjectAddress: post.data.address || null,
    note,
  })

  return res.status(200).json({ id, hidden: true })
}

async function unhide(req, res, db, moderator) {
  // Query string, not a body: the dev server's shim only parses a body for
  // POST and PUT, so a DELETE body would work on Vercel and fail locally.
  const url = new URL(req.url, 'http://localhost')
  const id = postId(url.searchParams.get('id'))
  if (!id) return res.status(400).json({ error: 'That is not a post.' })

  const post = await db.from('posts').select('id, address').eq('id', id).maybeSingle()

  if (post.error) {
    console.error('unhide: reading the post failed:', post.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  if (!post.data) return res.status(404).json({ error: 'Not found.' })

  /*
   * Both columns cleared. Leaving `hidden_by` set on a post that is no longer
   * hidden would make the pair unreadable - "hidden by nobody at no time" is
   * the only state that means visible, and a stale address in the second
   * column invites a later query filtering on it.
   */
  const { error } = await db
    .from('posts')
    .update({ hidden_at: null, hidden_by: null })
    .eq('id', id)

  if (error) {
    console.error('unhide: the update failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  await logAction(db, {
    actor: moderator,
    action: 'unhide_post',
    subjectPostId: id,
    subjectAddress: post.data.address || null,
  })

  return res.status(200).json({ id, hidden: false })
}
