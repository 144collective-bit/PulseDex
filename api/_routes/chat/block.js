import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { removeAvatar } from '../../_lib/avatars.js'
import {
  parseAdminAddresses,
  isAdminAddress,
  normaliseAddress,
} from '../../../src/utils/chatAdmin.js'

/**
 * Stop an address posting, or let it post again.
 *
 * Moderation was one message at a time, which is no answer to somebody posting
 * faster than they can be deleted. This is the switch that stops them once.
 *
 * Blocking does not remove what was already said. The two are separate on
 * purpose: a moderator may want the history to stand while the account stops
 * adding to it, and hiding a conversation retroactively is a bigger decision
 * than silencing an account.
 *
 * It does remove the picture, though, and the distinction is not a
 * contradiction. Text is what somebody said once and it is in the history at
 * the point they said it; an avatar is shown beside every message they have
 * ever posted and keeps being shown after the block, so an account silenced
 * for what it was displaying would go on displaying it. Leaving it up is the
 * one way a block does nothing about the thing it was used for.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  let session = null
  try {
    session = await readSession(getCookie(req, SESSION_COOKIE))
  } catch {
    session = null
  }

  const moderator = session?.sub || null
  const admins = parseAdminAddresses(process.env.ADMIN_ADDRESSES)

  if (!moderator || !isAdminAddress(moderator, admins)) {
    /*
     * 404 rather than 403, matching the removal endpoint. A 403 confirms there
     * is something here worth protecting, which is a hint not worth giving for
     * a route whose whole security is a list of addresses in a variable.
     */
    return res.status(404).json({ error: 'Not found.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Chat is not configured on this deployment.' })

  if (req.method === 'POST') return block(req, res, db, moderator)
  if (req.method === 'DELETE') return unblock(req, res, db)

  res.setHeader('Allow', 'POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

async function block(req, res, db, moderator) {
  const address = normaliseAddress(req.body?.address)
  if (!address) return res.status(400).json({ error: 'That is not an address.' })

  /*
   * A moderator cannot block a moderator, themselves included.
   *
   * The list is an environment variable, so an admin who blocked the others
   * could not be undone from inside the app - it would need a redeploy. This
   * costs nothing and removes the one way this endpoint can lock everybody out.
   */
  if (isAdminAddress(address, parseAdminAddresses(process.env.ADMIN_ADDRESSES))) {
    return res.status(400).json({ error: 'Moderators cannot be blocked.' })
  }

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : null

  const { error } = await db
    .from('blocked')
    .upsert(
      { address, reason: reason || null, blocked_by: moderator, blocked_at: new Date().toISOString() },
      { onConflict: 'address' },
    )

  if (error) {
    console.error('block: write failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  /*
   * The picture comes down after the block is recorded, and a failure here
   * does not fail the request. The block is the part that had to happen; a
   * moderator told "that could not be saved" would reasonably try again,
   * having already stopped the account posting.
   */
  try {
    await removeAvatar(db, address)
  } catch (err) {
    console.error('block: avatar removal failed:', err.message)
  }

  return res.status(200).json({ address, blocked: true })
}

async function unblock(req, res, db) {
  // Query string rather than a body, for the same reason the removal endpoint
  // does it: the dev server's shim only parses a body for POST and PUT, so a
  // DELETE body would work on Vercel and fail locally.
  const url = new URL(req.url, 'http://localhost')
  const address = normaliseAddress(url.searchParams.get('address'))
  if (!address) return res.status(400).json({ error: 'That is not an address.' })

  const { error } = await db.from('blocked').delete().eq('address', address)
  if (error) {
    console.error('block: removal failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  return res.status(200).json({ address, blocked: false })
}
