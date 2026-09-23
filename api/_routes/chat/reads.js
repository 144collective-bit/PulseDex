import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { isRoom } from '../../../src/config/rooms.js'

/**
 * How much of each room this person has not read.
 *
 * GET returns the counts, POST marks one room read up to now.
 *
 * Behind an endpoint rather than read from the table, for the same reason the
 * inbox is: where somebody has read up to is nobody else's business, and
 * row-level security here cannot say "your own rows" because sign-in is a
 * cookie this app sets rather than Supabase auth. It is also a better presence
 * signal than anybody agreed to share - "last looked at Trenches four minutes
 * ago" says a lot about a person.
 *
 * Neither verb takes an address. The address is the cookie.
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
  if (!db) return res.status(503).json({ error: 'Chat is not configured on this deployment.' })

  if (req.method === 'GET') return counts(res, db, address)
  if (req.method === 'POST') return markRead(req, res, db, address)

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

async function counts(res, db, address) {
  const { data, error } = await db.rpc('unread_counts', { reader: address })

  if (error) {
    console.error('chat/reads: the count failed:', error.message)
    return res.status(503).json({ error: 'Unread counts are unavailable right now.' })
  }

  /*
   * An object keyed by room, not the array the function returns. The caller
   * asks "how many in this one" per room while it draws the sidebar, and a
   * list would make that a scan per entry.
   *
   * Rooms with nothing unread are absent rather than zero. The function does
   * not emit them, and inventing them here would mean this endpoint had to
   * know the room list - which is about to stop being a fixed thing.
   */
  const unread = {}
  for (const row of data || []) {
    if (row?.room) unread[row.room] = Number(row.unread) || 0
  }

  return res.status(200).json({ unread })
}

/**
 * Mark one room read, as of now.
 *
 * Up to `now()` on the server rather than to a timestamp the client sends. A
 * client-supplied one would let a request mark a room read into the future
 * and silence it permanently, and it would also drift: two devices with
 * different clocks would disagree about what had been seen.
 */
async function markRead(req, res, db, address) {
  /*
   * Generous, because this fires on every room switch and somebody clicking
   * through five rooms to see what is in them is doing exactly what the
   * unread badges are for. It exists to stop a loop, not to ration reading.
   */
  const limited = rateLimit(req, { key: 'room-read', limit: 600, windowMs: 3_600_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }

  const room = req.body?.room
  // Checked against the real list: an unknown room would otherwise insert a
  // row nothing can ever clear, in a table that has no way to navigate to it.
  if (!isRoom(room)) return res.status(400).json({ error: 'No such room.' })

  const { error } = await db
    .from('room_reads')
    .upsert(
      { address, room, last_read_at: new Date().toISOString() },
      { onConflict: 'address,room' }
    )

  if (error) {
    console.error('chat/reads: marking read failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  return res.status(200).json({ ok: true })
}
