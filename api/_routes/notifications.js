import { SESSION_COOKIE, getCookie, readSession } from '../_lib/session.js'
import { isSameOrigin, rateLimit } from '../_lib/guard.js'
import { serviceClient } from '../_lib/supabase.js'
import { NOTIFICATION_FIELDS } from '../../src/config/queries.js'

/**
 * One person's inbox.
 *
 * GET reads it, PATCH marks it read. Both are about the signed-in account and
 * neither takes a recipient, because the recipient is the cookie: an endpoint
 * that accepted one would be a way to read anybody's notifications, and this
 * is the only surface in the app that is genuinely private.
 *
 * That privacy is also why this endpoint exists at all rather than the client
 * reading the table directly, as it does for posts and follows. Sign-in here
 * is a wallet signature and a cookie this app sets, not Supabase auth, so
 * `auth.uid()` is null in every request and row-level security has no way to
 * express "your own rows". The table therefore has no policy for any role,
 * and everything goes through the service role behind this cookie.
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

  if (!address) return res.status(401).json({ error: 'Sign in first.' })

  const db = serviceClient()
  if (!db) {
    return res.status(503).json({ error: 'Notifications are not configured on this deployment.' })
  }

  if (req.method === 'GET') return read(req, res, db, address)
  if (req.method === 'PATCH') return markRead(req, res, db, address)

  res.setHeader('Allow', 'GET, PATCH')
  return res.status(405).json({ error: 'Method not allowed' })
}

/** How many to send at once. An inbox is read from the top, not paged through. */
const PAGE = 30

async function read(req, res, db, address) {
  const url = new URL(req.url, 'http://localhost')
  const before = url.searchParams.get('before')

  let query = db
    .from('notifications')
    .select(NOTIFICATION_FIELDS)
    .eq('recipient', address)
    .order('created_at', { ascending: false })
    .limit(PAGE)

  // Cursor by time rather than offset: an inbox gains rows at the top while
  // it is being read, and an offset would show the same row twice.
  if (before) query = query.lt('created_at', before)

  const [list, unread] = await Promise.all([
    query,
    db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient', address)
      .is('read_at', null),
  ])

  if (list.error) {
    console.error('notifications: the read failed:', list.error.message)
    return res.status(503).json({ error: 'Your notifications could not be loaded.' })
  }

  return res.status(200).json({
    notifications: list.data || [],
    // A failed count is reported as zero rather than failing the whole read:
    // a badge that is missing is better than an inbox that will not open.
    unread: unread.error ? 0 : unread.count || 0,
  })
}

/**
 * Mark everything read, or just the ones named.
 *
 * `read_at` is only ever set, never cleared, and only where it is already
 * null - so opening the inbox twice does not move the timestamp, and "when
 * did I first see this" stays true.
 */
async function markRead(req, res, db, address) {
  const limited = rateLimit(req, { key: 'notifications-read', limit: 120, windowMs: 3_600_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }

  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.filter((id) => Number.isInteger(id) && id > 0).slice(0, PAGE)
    : null

  let query = db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient', address)
    .is('read_at', null)

  if (ids && ids.length > 0) query = query.in('id', ids)

  const { error } = await query
  if (error) {
    console.error('notifications: marking read failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  return res.status(200).json({ ok: true })
}
