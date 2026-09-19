import { SESSION_COOKIE, getCookie, readSession } from '../_lib/session.js'
import { isSameOrigin, rateLimit } from '../_lib/guard.js'
import { serviceClient } from '../_lib/supabase.js'
import { storeAvatar, removeAvatar } from '../_lib/avatars.js'
import { decodeAvatar, REJECTED_AVATAR, MAX_AVATAR_BYTES } from '../../src/utils/avatarUpload.js'
import { parseAdminAddresses, isAdminAddress, normaliseAddress } from '../../src/utils/chatAdmin.js'

/**
 * The signed-in wallet's profile picture.
 *
 * Separate from /api/profile, which writes a handle and a preset id - values
 * small enough that saving them is a form submission. A picture is tens of
 * kilobytes going to a different store, it can fail for reasons the rest of
 * the form cannot, and taking it down is something a moderator may need to do
 * to somebody else's. That is three differences, which is enough to be its own
 * route rather than three special cases inside another one.
 *
 * POST stores a picture. DELETE removes one: your own always, or another
 * account's if you are a moderator.
 *
 * Worth being clear about what this feature is, because it is a change in kind
 * rather than in degree. Until now the most a stranger could learn from the
 * chat was a name somebody typed. A picture is published to everyone who can
 * read a room, which is everyone - and once it has been served from a CDN,
 * deleting it here does not unsee it.
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
  if (!db) return res.status(503).json({ error: 'Profiles are not configured on this deployment.' })

  if (req.method === 'POST') return upload(req, res, db, address)
  if (req.method === 'DELETE') return remove(req, res, db, address)

  res.setHeader('Allow', 'POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

/** What each refusal means to the person who picked the file. The reasons are
 *  the endpoint's, but the sentences are theirs. */
const REASONS = {
  [REJECTED_AVATAR.notDataUrl]: 'That picture could not be read.',
  [REJECTED_AVATAR.tooLarge]: `Pictures must be under ${Math.round(MAX_AVATAR_BYTES / 1024)}KB.`,
  [REJECTED_AVATAR.unsupported]: 'Pick a PNG, JPEG, WebP or GIF image.',
  [REJECTED_AVATAR.mismatch]: 'That file is not the kind of image it claims to be.',
}

async function upload(req, res, db, address) {
  /*
   * Tighter than the profile write limit, because this one costs more than a
   * row. Six is more changes of picture than anybody makes in ten minutes and
   * far fewer than it takes to make a bucket expensive.
   */
  const limited = rateLimit(req, { key: 'avatar-upload', limit: 6, windowMs: 600_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many uploads. Try again shortly.' })
  }

  const image = decodeAvatar(req.body?.dataUrl)
  if (!image.ok) {
    return res.status(400).json({ error: REASONS[image.reason] || 'That picture was refused.' })
  }

  /*
   * A blocked account cannot publish a picture, for the same reason it cannot
   * post: an avatar is shown beside every message it has ever written, so a
   * silenced account with an upload button still has a billboard.
   */
  const { data: banned } = await db.from('blocked').select('address').eq('address', address).maybeSingle()
  if (banned) return res.status(403).json({ error: 'This account cannot post here.' })

  let avatarUrl
  try {
    avatarUrl = await storeAvatar(db, address, image)
  } catch (err) {
    console.error('avatar: upload failed:', err.message)
    return res.status(503).json({ error: 'That picture could not be saved.' })
  }

  /*
   * Upserted, not updated. Signing in does not create a profile row on its
   * own - posting or saving a name does - so the first thing an account does
   * may well be to set a picture, and an update would quietly affect nothing.
   */
  const { error } = await db
    .from('profiles')
    .upsert({ address, avatar_url: avatarUrl, updated_at: new Date().toISOString() }, { onConflict: 'address' })

  if (error) {
    console.error('avatar: write failed:', error.message)
    return res.status(503).json({ error: 'That picture could not be saved.' })
  }

  return res.status(200).json({ address, avatarUrl })
}

async function remove(req, res, db, caller) {
  // Query string rather than a body: the dev server's shim only parses a body
  // for POST and PUT, so a DELETE body would work on Vercel and fail locally.
  const url = new URL(req.url, 'http://localhost')
  const asked = normaliseAddress(url.searchParams.get('address'))

  // No address means your own, which is the ordinary case and needs no
  // permission beyond being signed in.
  const target = asked || caller

  if (target !== caller) {
    const admins = parseAdminAddresses(process.env.ADMIN_ADDRESSES)
    if (!isAdminAddress(caller, admins)) {
      /*
       * 404 rather than 403, matching the removal and block endpoints. A 403
       * confirms there is a moderator power here worth having, which is a hint
       * not worth giving for a route whose whole security is a list of
       * addresses in an environment variable.
       */
      return res.status(404).json({ error: 'Not found.' })
    }
  }

  try {
    await removeAvatar(db, target)
  } catch (err) {
    console.error('avatar: removal failed:', err.message)
    return res.status(503).json({ error: 'That picture could not be removed.' })
  }

  return res.status(200).json({ address: target, avatarUrl: null })
}
