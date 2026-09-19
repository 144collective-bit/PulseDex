import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { parseAdminAddresses, isAdminAddress } from '../../../src/utils/chatAdmin.js'

/**
 * Telling a moderator about a post.
 *
 * Shipped with the feed rather than after it, because a feed changes who is
 * reading. A room has a moderator scrolling it like everyone else, so a bad
 * message gets seen. A post is read by whoever follows its author and by
 * nobody else - so without this, the only way anything gets noticed is if a
 * moderator happens to be following the right person, which is not a
 * moderation policy.
 *
 * POST files a report. GET returns the queue, to a moderator only.
 *
 * Nothing here acts on a report. Removing a post is api/posts.js, blocking an
 * account is api/chat/block.js, and both are decisions a person makes after
 * reading it. An endpoint that hid a post at some threshold of reports would
 * be a brigading tool wearing a safety feature's name.
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

  const address = session?.sub || null
  if (!address) return res.status(401).json({ error: 'Sign in first.' })

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Reporting is not configured on this deployment.' })

  if (req.method === 'POST') return file(req, res, db, address)
  if (req.method === 'GET') return queue(res, db, address)

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

async function file(req, res, db, reporter) {
  /*
   * Limited, because a report costs a moderator's attention rather than a row.
   * Ten in ten minutes is more than anybody reports honestly and few enough
   * that one person cannot fill the queue.
   */
  const limited = rateLimit(req, { key: 'post-report', limit: 10, windowMs: 600_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many reports. Try again shortly.' })
  }

  const id = Number(req.body?.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'That is not a post.' })
  }

  const reason =
    typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : null

  /*
   * A profile row for the reporter, because the column references one. Someone
   * who has read the site without ever posting is exactly the person most
   * likely to report something, and they have no row yet.
   */
  const profile = await db
    .from('profiles')
    .upsert({ address: reporter }, { onConflict: 'address', ignoreDuplicates: true })

  if (profile.error) {
    console.error('report: ensuring the profile row failed:', profile.error.message)
    return res.status(503).json({ error: 'That could not be reported.' })
  }

  const { error } = await db
    .from('post_reports')
    .insert({ post_id: id, reporter, reason: reason || null })

  if (error) {
    /*
     * 23505 is the unique constraint: this person has already reported this
     * post. Answered as success, because from where they are standing it is -
     * they pressed the button and the post is reported. Telling them it was
     * already reported invites the reading that the first one was ignored.
     */
    if (error.code === '23505') return res.status(200).json({ id, reported: true })

    // 23503 is the foreign key: no such post. Same 404 a removed post gets
    // from api/posts.js, for the same reason - this should not become a way
    // of asking which ids exist.
    if (error.code === '23503') return res.status(404).json({ error: 'Not found.' })

    console.error('report: the insert failed:', error.message)
    return res.status(503).json({ error: 'That could not be reported.' })
  }

  return res.status(201).json({ id, reported: true })
}

async function queue(res, db, address) {
  if (!isAdminAddress(address, parseAdminAddresses(process.env.ADMIN_ADDRESSES))) {
    // 404, matching every other moderator route here: a 403 confirms there is
    // something behind this worth having.
    return res.status(404).json({ error: 'Not found.' })
  }

  /*
   * The reported post comes back with the report, including ones already
   * removed. A moderator looking at the queue needs to know a post was dealt
   * with, and a row that silently vanished once somebody deleted the post
   * would have them wondering what the report had been about.
   */
  const { data, error } = await db
    .from('post_reports')
    .select('id, post_id, reporter, reason, created_at, posts ( id, address, body, deleted_at )')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('report: reading the queue failed:', error.message)
    return res.status(503).json({ error: 'The report queue is unavailable right now.' })
  }

  return res.status(200).json({
    reports: (data || []).map((row) => ({
      id: row.id,
      postId: row.post_id,
      reporter: row.reporter,
      reason: row.reason,
      createdAt: row.created_at,
      post: row.posts
        ? {
            id: row.posts.id,
            address: row.posts.address,
            body: row.posts.body,
            removed: Boolean(row.posts.deleted_at),
          }
        : null,
    })),
  })
}
