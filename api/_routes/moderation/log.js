import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { parseAdminAddresses, isAdminAddress, normaliseAddress } from '../../../src/utils/chatAdmin.js'

/**
 * What moderators have done.
 *
 * src/utils/chatAdmin.js has said since it was written that moderation here is
 * "a list of wallet addresses in an environment variable... and there is no
 * audit of who removed what". This is the read side of that audit. The
 * environment variable stays - a roles table is still a week of work for a
 * problem this site does not have - but the actions it authorises are now
 * recorded and readable.
 *
 * Moderator-only, and that is not squeamishness about transparency. The rows
 * name wallet addresses with a moderator's note attached, so a public version
 * of this would be a public list of accusations against named accounts. 0021
 * gives the table no read policy for the same reason.
 *
 * Read-only. Nothing here writes, and nothing anywhere updates or deletes a
 * row - api/_lib/moderation.js is the only module that touches this table and
 * it only inserts. 0021 is explicit that this makes the log append-only by
 * discipline rather than by constraint; this file is the discipline holding on
 * the read side.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let moderator = null
  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    moderator = session?.sub || null
  } catch {
    moderator = null
  }

  if (!moderator || !isAdminAddress(moderator, parseAdminAddresses(process.env.ADMIN_ADDRESSES))) {
    // 404, matching every other moderator route here.
    return res.status(404).json({ error: 'Not found.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Moderation is not configured on this deployment.' })

  const url = new URL(req.url, 'http://localhost')

  const asked = Number(url.searchParams.get('limit'))
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 100) : 50

  let query = db
    .from('moderation_log')
    .select('id, at, actor, action, subject_address, subject_post_id, subject_room, note, evidence')
    .order('at', { ascending: false })
    .limit(limit)

  /*
   * Filtered to one account or one post when asked, because those are the two
   * questions somebody actually arrives with: "what has been done to this
   * account" and "why is this post hidden". An unfiltered page of fifty is the
   * third question - "what has been happening" - and is the default.
   */
  const address = normaliseAddress(url.searchParams.get('address'))
  if (address) query = query.eq('subject_address', address)

  const post = Number(url.searchParams.get('post'))
  if (Number.isSafeInteger(post) && post > 0) query = query.eq('subject_post_id', post)

  const { data, error } = await query

  if (error) {
    /*
     * 42P01 is "no such table", which here means 0021 has not been run. Said
     * in the response rather than only in the log, because the person reading
     * this is a moderator looking at an empty panel and the difference between
     * "nothing has happened" and "the table does not exist" is the whole
     * question they have.
     */
    if (error.code === '42P01') {
      return res.status(503).json({
        error: 'The audit trail is not set up on this deployment. Run migration 0021.',
      })
    }
    console.error('moderation log: read failed:', error.message)
    return res.status(503).json({ error: 'The audit trail could not be loaded.' })
  }

  /*
   * Returned in the database's own column names rather than camel-cased, which
   * is the opposite of what every other endpoint here does, on purpose:
   * src/utils/moderationLog.js reads these entries and is tested against the
   * shape 0021 defines. One shape from the table to the sentence means a
   * column added to the log needs no translation layer updated to match.
   */
  return res.status(200).json({ entries: data || [] })
}
