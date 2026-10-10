import { isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { findFirstSeen } from '../../_lib/walletAge.js'
import { asAddress } from '../../../src/utils/deployer.js'

/**
 * How old is this wallet?
 *
 * Read-through cache in front of the explorer. A hit is one row of our own
 * database; a miss is one explorer request, written back so it never happens
 * again for that address.
 *
 * GET only, and no body is ever accepted - this writes a column, but what it
 * writes is a fact about the chain rather than anything a caller supplied.
 * Nothing here can be influenced by the request except which address is asked
 * about, which is the point.
 *
 * Deliberately not part of the public profile read. The profile comes straight
 * from Supabase over the anon key, which is a key with no business making
 * outbound requests - so the cached column rides along with the profile and
 * this endpoint exists only to fill it. A page that has a date draws it
 * without ever calling this.
 */
/**
 * How long a fruitless lookup is remembered for.
 *
 * Declared up here rather than under the handler that reads it. It would work
 * either way - the module finishes initialising long before a request arrives
 * - but this branch has already shipped a `const` referenced from above its
 * own declaration once, in a dependency array, where it threw on every
 * render. The shape is not worth repeating even where it is harmless.
 */
const RECHECK_MS = 7 * 24 * 60 * 60 * 1000

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  /*
   * Same-origin, although everything it returns is public.
   *
   * This is the one endpoint in the app that turns a request into an outbound
   * request about an address the caller named. Left open it is a free,
   * anonymous explorer proxy with our rate limit attached to it, and the
   * explorer would be right to blame us. The data is public; the amplification
   * is not something to hand out.
   */
  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  const url = new URL(req.url, 'http://localhost')
  const address = asAddress(url.searchParams.get('address'))
  if (!address) return res.status(400).json({ error: 'That is not an address.' })

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Profiles are not configured on this deployment.' })

  const { data, error } = await db
    .from('profiles')
    .select('address, first_seen_at, first_seen_checked_at')
    .eq('address', address)
    .maybeSingle()

  if (error) {
    console.error('first-seen: read failed:', error.message)
    return res.status(503).json({ error: 'Profiles are unavailable right now.' })
  }

  /*
   * No profile row, no lookup.
   *
   * Not an error - plenty of addresses have never saved a name - but it is
   * where this endpoint stops. Two reasons, and they point the same way.
   *
   * There is nowhere to put the answer: the cache is a column on a row that
   * does not exist, so every visit would ask the explorer again. And without
   * it, this is an open lookup for any of the chain's addresses rather than a
   * fact about the accounts on this site, which is a much larger thing to
   * offer than the feature needs.
   */
  if (!data) return res.status(200).json({ address, firstSeenAt: null })

  // Already known. Immutable, so there is nothing to refresh.
  if (data.first_seen_at) {
    return res.status(200).json({ address, firstSeenAt: data.first_seen_at })
  }

  /*
   * Asked recently and got nothing, so do not ask again yet.
   *
   * Without this, an address the explorer has no record of is an outbound
   * request on every single view of that profile, forever. A week is long
   * enough that a missing answer costs almost nothing and short enough that an
   * explorer outage does not hide somebody's wallet age until the next deploy.
   */
  const checked = Date.parse(data.first_seen_checked_at || '')
  if (Number.isFinite(checked) && Date.now() - checked < RECHECK_MS) {
    return res.status(200).json({ address, firstSeenAt: null })
  }

  /*
   * The rate limit guards the lookup, not the read above.
   *
   * A cached answer costs one indexed row and should never be refused; the
   * outbound request is the scarce thing. Checking here rather than at the top
   * means a page full of people whose ages are known renders without anybody
   * hitting a limit.
   */
  const limited = rateLimit(req, { key: 'first-seen', limit: 20, windowMs: 60_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }

  const firstSeenAt = await findFirstSeen(address)

  /*
   * The timestamp of the attempt is written whether or not it found anything,
   * which is what makes the window above work. A failure that is not recorded
   * is a failure that is repeated by every visitor.
   *
   * A failed write is swallowed: the caller still gets the answer we found,
   * and the cost of not having cached it is that we look again. Failing the
   * request because the cache could not be updated would turn a slow path into
   * a broken one.
   */
  const { error: writeError } = await db
    .from('profiles')
    .update({ first_seen_at: firstSeenAt, first_seen_checked_at: new Date().toISOString() })
    .eq('address', address)

  if (writeError) console.error('first-seen: write failed:', writeError.message)

  return res.status(200).json({ address, firstSeenAt })
}
