import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { storePostImage } from '../../_lib/avatars.js'
import {
  decodeAvatar,
  isPostImageSize,
  MAX_POST_IMAGE_BYTES,
  REJECTED_AVATAR,
} from '../../../src/utils/avatarUpload.js'

/**
 * The image that goes with a post.
 *
 * Stored before the post exists, which is the thing worth understanding about
 * this route. The browser uploads here, gets a URL back, and sends that URL
 * with the post - so a picture that cannot be stored fails on its own, before
 * anybody's words are published, rather than leaving a post with a broken
 * image beside it.
 *
 * The cost of that order is an orphan: an image uploaded by somebody who then
 * closed the tab is bytes nothing points at. Accepted deliberately, and it is
 * the cheaper mistake - a few kilobytes nobody can see, against a published
 * post whose picture 404s for everybody forever. The rate limit is what keeps
 * the orphans bounded.
 *
 * POST only. There is no DELETE: an image belongs to a post, and the way to
 * take it down is to remove the post, which every surface already offers to
 * its author and to a moderator. A separate delete here would be a second
 * route to the same outcome with its own idea of who may use it.
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

  let session = null
  try {
    session = await readSession(getCookie(req, SESSION_COOKIE))
  } catch {
    session = null
  }

  const address = session?.sub || null
  if (!address) return res.status(401).json({ error: 'Sign in first.' })

  /*
   * Tighter than posting words, because this one costs storage rather than a
   * row - and looser than an avatar's six per ten minutes, because an account
   * writing a thread of four posts with a picture each is doing something
   * ordinary. Twelve in ten minutes is well past that and nowhere near enough
   * to make a bucket expensive.
   */
  const limited = rateLimit(req, { key: 'post-image', limit: 12, windowMs: 600_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many uploads. Try again shortly.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Posting is not configured on this deployment.' })

  const { width, height } = req.body || {}
  if (!isPostImageSize(width, height)) {
    return res.status(400).json({ error: 'That image could not be measured.' })
  }

  /*
   * The same decoder the avatar route uses, with a larger cap.
   *
   * It checks the declared type, the real type from the file's first bytes,
   * and the size - which is what can be checked without decoding an image.
   * Dimensions are not checked against the bytes, for the reason in
   * avatarUpload.js: a decoder in a serverless function is a large dependency
   * and a large attack surface, and the only thing resting on the claimed size
   * is how much space the feed reserves.
   */
  const image = decodeAvatar(req.body?.dataUrl, MAX_POST_IMAGE_BYTES)
  if (!image.ok) {
    return res.status(400).json({ error: REASONS[image.reason] || 'That image was refused.' })
  }

  /*
   * A blocked account cannot publish an image, for the same reason it cannot
   * post. Checked here as well as in the post route because this route writes
   * to a public bucket on its own: without it, a silenced account still has an
   * upload endpoint and a CDN to serve whatever it likes from our domain.
   */
  const banned = await db.from('blocked').select('address').eq('address', address).maybeSingle()
  if (banned.error) {
    console.error('post image: reading the blocklist failed:', banned.error.message)
    return res.status(503).json({ error: 'Posting is unavailable right now.' })
  }
  if (banned.data) return res.status(403).json({ error: 'This account cannot post here.' })

  let url
  try {
    url = await storePostImage(db, address, image, MAX_POST_IMAGE_BYTES)
  } catch (err) {
    console.error('post image: upload failed:', err.message)
    return res.status(503).json({ error: 'That image could not be saved.' })
  }

  return res.status(201).json({ url, width: Number(width), height: Number(height) })
}

/** What each refusal means to the person who picked the file. The reasons are
 *  the decoder's; the sentences are theirs. */
const REASONS = {
  [REJECTED_AVATAR.notDataUrl]: 'That image could not be read.',
  [REJECTED_AVATAR.tooLarge]: `Images must be under ${Math.round(MAX_POST_IMAGE_BYTES / 1024 / 1024)}MB.`,
  [REJECTED_AVATAR.unsupported]: 'Pick a PNG, JPEG, WebP or GIF image.',
  [REJECTED_AVATAR.mismatch]: 'That file is not the kind of image it claims to be.',
}
