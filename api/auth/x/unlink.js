import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'

/**
 * Remove the link.
 *
 * Needed for more than tidiness. The unique index means one X account can only
 * be linked to one wallet at a time, so somebody moving to a new wallet - or
 * who linked the wrong one - has no way forward without this. A feature that
 * can only be switched on is a trap.
 *
 * Only your own, and there is no moderator version. A moderator can already
 * remove a picture and block an account; being able to sever somebody's proof
 * of identity is a different power, and nothing here needs it.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let address = null
  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    address = session?.sub || null
  } catch {
    address = null
  }

  if (!address) return res.status(401).json({ error: 'Sign in first.' })

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'X linking is not configured on this deployment.' })

  // Every column, not just the id. Leaving the handle and the badge behind
  // while clearing the link would show an unproven X account beside somebody's
  // name, which is worse than showing none.
  const { error } = await db
    .from('profiles')
    .update({
      x_user_id: null,
      x_handle: null,
      x_name: null,
      x_verified_type: null,
      x_followers: null,
      x_account_created_at: null,
      x_linked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('address', address)

  if (error) {
    console.error('x unlink: failed:', error.message)
    return res.status(503).json({ error: 'That could not be unlinked.' })
  }

  return res.status(200).json({ linked: false })
}
