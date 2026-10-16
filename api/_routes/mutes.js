import { SESSION_COOKIE, getCookie, readSession } from '../_lib/session.js'
import { isSameOrigin, rateLimit } from '../_lib/guard.js'
import { serviceClient } from '../_lib/supabase.js'
import { normaliseAddress } from '../../src/utils/chatAdmin.js'

/**
 * Who one reader has chosen not to see.
 *
 * A mute is not a small block and the difference is the point. A block is a
 * moderator stopping an account posting, for everybody, and it needs the
 * moderator list in an environment variable. A mute is one reader deciding not
 * to read somebody, for themselves, and it needs nothing but their own
 * signature - which is why this endpoint has no moderator check in it at all.
 *
 * The muted account is never told and loses nothing: they go on posting to
 * everybody else, and nothing in any response anywhere says they were muted.
 * That is deliberate. A mute somebody can detect is a mute that invites a
 * second account, and the whole value of this over a block is that it is
 * quiet.
 *
 * Private, for the reason written down in 0010, 0020 and 0021 and worth
 * repeating here because this is where somebody will try to shortcut it:
 *
 *   Sign-in is a wallet signature and a JWT in an httpOnly cookie, NOT
 *   Supabase auth. `auth.uid()` is null in every browser request, so row level
 *   security cannot express "your own rows" - a policy saying
 *   `using (address = auth.uid())` would not restrict `muted`, it would empty
 *   it. So the table has no policy at all and every read comes through here.
 *
 * And `muted` is more sensitive than bookmarks, not less: "who I cannot stand"
 * is a list about the reader rather than about the people on it, and a social
 * site where accounts are wallet addresses publishing that list would be
 * publishing a public graph of who refuses to read whom.
 *
 * GET returns this account's list. POST adds, DELETE removes. Both writes are
 * idempotent. `address` is never read from the request on any verb, which is
 * the whole privacy model.
 */
export default async function handler(req, res) {
  /*
   * `no-store`, load-bearing rather than habit: this response is one person's
   * private list, and a shared cache holding it under a URL with no account in
   * it would hand one reader's mutes to the next.
   */
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

  if (!address) return res.status(401).json({ error: 'Sign in to mute anybody.' })

  const limited = rateLimit(req, { key: 'mutes', limit: 60, windowMs: 60_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Slow down a moment.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Muting is not configured on this deployment.' })

  if (req.method === 'GET') return list(res, db, address)
  if (req.method === 'POST') return mute(req, res, db, address)
  if (req.method === 'DELETE') return unmute(req, res, db, address)

  res.setHeader('Allow', 'GET, POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

async function list(res, db, address) {
  /*
   * The whole list, unpaged, which is a deliberate exception to the bound
   * every other list endpoint here applies. The browser filters the feed
   * against this set, so a page of it would mean a feed that hides the first
   * fifty muted accounts and shows the rest - which is worse than not having
   * the feature. A cap of 500 is the safety net; somebody who has muted five
   * hundred accounts has a different problem.
   */
  const { data, error } = await db
    .from('muted')
    .select('muted, created_at, profiles!muted_muted_fkey ( handle, avatar_id, avatar_url )')
    .eq('address', address)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    /*
     * 42P01 is "no such table", which here means 0021 has not been run. Named
     * in the response as well as the log, the way the audit trail's endpoint
     * does it: the difference between "muting is broken" and "muting does not
     * exist on this deployment yet" is the difference between an incident and
     * a migration.
     */
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'Muting is not set up on this deployment. Run migration 0021.' })
    }
    console.error('mutes: read failed:', error.message)
    return res.status(503).json({ error: 'Your muted list could not be loaded.' })
  }

  return res.status(200).json({
    /*
     * Two shapes of the same thing, and both are used. `addresses` is what the
     * feed filters on and wants as a flat array it can put in a Set;
     * `muted` is what the settings list draws, with handles and pictures so a
     * reader can recognise who they muted six weeks ago.
     */
    addresses: (data || []).map((row) => row.muted),
    muted: (data || []).map((row) => ({
      address: row.muted,
      handle: row.profiles?.handle || null,
      avatarId: row.profiles?.avatar_id || null,
      avatarUrl: row.profiles?.avatar_url || null,
      mutedAt: row.created_at,
    })),
  })
}

async function mute(req, res, db, address) {
  const target = normaliseAddress(req.body?.address)
  if (!target) return res.status(400).json({ error: 'That is not an address.' })

  /*
   * Muting yourself is refused here as well as by the check constraint. The
   * constraint is what guarantees it; this is what gives a reason instead of a
   * 503, and it exists because the state has no way back from inside the
   * interface - your own posts gone from your own feed, including the control
   * that would undo it.
   */
  if (target === address) {
    return res.status(400).json({ error: 'You cannot mute yourself.' })
  }

  /*
   * Both profile rows have to exist, because both columns reference one. The
   * muter may have only ever read the site, and the muted account may be
   * somebody whose posts are all we have seen of them - though in practice
   * they have a row, since they posted.
   */
  const profiles = await db
    .from('profiles')
    .upsert([{ address }, { address: target }], {
      onConflict: 'address',
      ignoreDuplicates: true,
    })

  if (profiles.error) {
    console.error('mutes: ensuring the profile rows failed:', profiles.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  const { error } = await db
    .from('muted')
    // The pair is the primary key, so muting twice is one row.
    .upsert({ address, muted: target }, { onConflict: 'address,muted', ignoreDuplicates: true })

  if (error) {
    console.error('mutes: the insert failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  return res.status(201).json({ address: target, muted: true })
}

async function unmute(req, res, db, address) {
  // Query string, not a body: the dev server's shim only parses a body for
  // POST and PUT, so a DELETE body would work on Vercel and fail locally.
  const url = new URL(req.url, 'http://localhost')
  const target = normaliseAddress(url.searchParams.get('address'))
  if (!target) return res.status(400).json({ error: 'That is not an address.' })

  // Scoped to this address. Without the `eq` on it this would be a route for
  // deleting anybody's mute.
  const { error } = await db.from('muted').delete().eq('address', address).eq('muted', target)

  if (error) {
    console.error('mutes: the removal failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  // Unmuting somebody who was not muted is success: the caller wanted them
  // audible, and they are.
  return res.status(200).json({ address: target, muted: false })
}
