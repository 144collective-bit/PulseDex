import { SESSION_COOKIE, getCookie, readSession } from '../_lib/session.js'
import { isSameOrigin, rateLimit } from '../_lib/guard.js'
import { serviceClient } from '../_lib/supabase.js'
import { normaliseAddress } from '../../src/utils/chatAdmin.js'
import { notifyFollow } from '../_lib/notify.js'

/**
 * Following somebody, and stopping.
 *
 * POST follows, DELETE unfollows. Two verbs rather than one toggle, for the
 * same reason reactions have two: a toggle's outcome depends on state the
 * caller cannot see, so a retry after a timeout undoes the thing it was
 * retrying. Both of these are idempotent - following twice leaves one row,
 * unfollowing twice leaves none, and neither is an error.
 *
 * Who follows whom is public, readable straight from the table with the anon
 * key. This endpoint exists for the writes, because the follower is taken from
 * the sign-in cookie and never from the body: a request that could name its
 * own follower would let anybody manufacture an audience for themselves, or
 * worse, put somebody else's name behind an account they would not follow.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  let follower = null
  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    follower = session?.sub || null
  } catch {
    follower = null
  }

  if (!follower) return res.status(401).json({ error: 'Sign in to follow people.' })

  /*
   * Bounded, because a follow is cheap to send and not cheap to receive.
   * Sixty an hour is more than anybody does deliberately and few enough that
   * a script cannot follow the whole site in an afternoon.
   */
  const limited = rateLimit(req, { key: 'follow', limit: 60, windowMs: 3_600_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many follows. Try again later.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Following is not configured on this deployment.' })

  if (req.method === 'POST') return follow(req, res, db, follower)
  if (req.method === 'DELETE') return unfollow(req, res, db, follower)

  res.setHeader('Allow', 'POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

async function follow(req, res, db, follower) {
  const followee = normaliseAddress(req.body?.address)
  if (!followee) return res.status(400).json({ error: 'That is not an address.' })

  /*
   * Refused here as well as by the check constraint. The constraint is what
   * guarantees it; this is what turns a database error into a sentence, and
   * it costs one comparison.
   */
  if (followee === follower) {
    return res.status(400).json({ error: 'You cannot follow yourself.' })
  }

  /*
   * Both profile rows have to exist, because both columns reference one. The
   * follower may never have posted, and the followee may be somebody whose
   * page was reached by address before they ever wrote anything.
   */
  const profiles = await db
    .from('profiles')
    .upsert([{ address: follower }, { address: followee }], {
      onConflict: 'address',
      ignoreDuplicates: true,
    })

  if (profiles.error) {
    console.error('follows: ensuring profile rows failed:', profiles.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  const { error } = await db
    .from('follows')
    .upsert({ follower, followee }, { onConflict: 'follower,followee', ignoreDuplicates: true })

  if (error) {
    console.error('follows: the insert failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  // Awaited, because an unawaited promise in a serverless function is killed
  // with the process the moment the response goes out. It cannot fail this
  // request - notifyFollow swallows and logs its own errors.
  await notifyFollow(db, { follower, followee })

  return res.status(201).json({ address: followee, following: true })
}

async function unfollow(req, res, db, follower) {
  // Query string, not a body: the dev server's shim only parses a body for
  // POST and PUT, so a DELETE body would work on Vercel and fail locally.
  const url = new URL(req.url, 'http://localhost')
  const followee = normaliseAddress(url.searchParams.get('address'))
  if (!followee) return res.status(400).json({ error: 'That is not an address.' })

  // Scoped to this follower, so nobody can unfollow on somebody else's behalf.
  const { error } = await db
    .from('follows')
    .delete()
    .eq('follower', follower)
    .eq('followee', followee)

  if (error) {
    console.error('follows: the removal failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  // Unfollowing somebody you were not following is success: the caller wanted
  // not to be following them, and they are not.
  return res.status(200).json({ address: followee, following: false })
}
