import { SESSION_COOKIE, getCookie, readSession } from './_lib/session.js'
import { isSameOrigin, rateLimit } from './_lib/guard.js'
import { serviceClient } from './_lib/supabase.js'
import { normaliseHandle, normaliseAvatarId } from '../src/utils/chatMessage.js'

/**
 * The signed-in wallet's own profile.
 *
 * Identity for the chat lives on the server now rather than in each browser's
 * localStorage. The difference shows the moment somebody opens the site on a
 * second device: before, they arrived as a stranger with the default name;
 * now they are themselves.
 *
 * It also makes a handle claimable. `profiles_handle_unique` means one account
 * holds a name, which is what lets a mention resolve to a person instead of to
 * whoever happens to share it.
 *
 * GET returns your profile, or nulls if you have never saved one.
 * PUT sets the handle and avatar. There is no DELETE: a profile with no
 * messages is harmless, and one with messages cannot be removed without
 * orphaning them.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  const address = await signedInAddress(req)
  if (!address) return res.status(401).json({ error: 'Sign in first.' })

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Profiles are not configured on this deployment.' })

  if (req.method === 'GET') return read(res, db, address)
  if (req.method === 'PUT') return write(req, res, db, address)

  res.setHeader('Allow', 'GET, PUT')
  return res.status(405).json({ error: 'Method not allowed' })
}

async function signedInAddress(req) {
  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    return session?.sub || null
  } catch {
    return null
  }
}

async function read(res, db, address) {
  const { data, error } = await db
    .from('profiles')
    .select('address, handle, avatar_id')
    .eq('address', address)
    .maybeSingle()

  if (error) {
    console.error('profile: read failed:', error.message)
    return res.status(503).json({ error: 'Profiles are unavailable right now.' })
  }

  // No row is not an error. It means this wallet has signed in but never
  // saved a name, which is the ordinary state of a new account.
  return res.status(200).json({
    address,
    handle: data?.handle || null,
    avatarId: data?.avatar_id || null,
  })
}

async function write(req, res, db, address) {
  const limited = rateLimit(req, { key: 'profile-write', limit: 20, windowMs: 60_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }

  /*
   * A handle that cannot be used is stored as null rather than refused.
   *
   * The same reasoning as when handles rode along with each message: a display
   * name is decoration, and losing the name is a smaller failure than losing
   * whatever the person was actually trying to do. They show as their address
   * until they pick something usable.
   */
  const handle = normaliseHandle(req.body?.handle)
  const avatarId = normaliseAvatarId(req.body?.avatarId)

  const { data, error } = await db
    .from('profiles')
    .upsert(
      { address, handle, avatar_id: avatarId, updated_at: new Date().toISOString() },
      { onConflict: 'address' },
    )
    .select('address, handle, avatar_id')
    .single()

  if (error) {
    /*
     * 23505 is Postgres for a unique violation, which here can only be
     * profiles_handle_unique - somebody else holds this name.
     *
     * Answered as a sentence rather than a 500, because it is the one failure
     * of this endpoint that the person can actually do something about.
     */
    if (error.code === '23505') {
      return res.status(409).json({ error: 'That name is taken. Try another.' })
    }
    console.error('profile: write failed:', error.message)
    return res.status(503).json({ error: 'Profiles are unavailable right now.' })
  }

  return res.status(200).json({
    address: data.address,
    handle: data.handle,
    avatarId: data.avatar_id,
  })
}
