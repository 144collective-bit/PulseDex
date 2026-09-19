import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { storeImage, removeImage, BANNER_BUCKET } from '../../_lib/avatars.js'
import { decodeAvatar, REJECTED_AVATAR, MAX_BANNER_BYTES } from '../../../src/utils/avatarUpload.js'
import { parseAdminAddresses, isAdminAddress, normaliseAddress } from '../../../src/utils/chatAdmin.js'

/**
 * The banner across the top of a profile.
 *
 * Deliberately its own route rather than a mode on the avatar one. The two
 * share their storage helper and their byte checking, and differ in every
 * decision around them: a different bucket, a different size limit, a
 * different column, and a different answer to what happens when there is none
 * - an absent avatar falls back to a generated mark, an absent banner falls
 * back to a gradient drawn from the address.
 *
 * POST stores one. DELETE removes it: your own always, or another account's if
 * you are a moderator - a banner is a full-width image on a public page, which
 * is the largest thing anybody here can put in front of a stranger.
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

/** What each refusal means to the person who picked the file. */
const REASONS = {
  [REJECTED_AVATAR.notDataUrl]: 'That image could not be read.',
  [REJECTED_AVATAR.tooLarge]: `Banners must be under ${Math.round(MAX_BANNER_BYTES / 1024)}KB.`,
  [REJECTED_AVATAR.unsupported]: 'Pick a PNG, JPEG, WebP or GIF image.',
  [REJECTED_AVATAR.mismatch]: 'That file is not the kind of image it claims to be.',
}

async function upload(req, res, db, address) {
  const limited = rateLimit(req, { key: 'banner-upload', limit: 6, windowMs: 600_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many uploads. Try again shortly.' })
  }

  // Checked by its first bytes and its real size, not by what it claims to be.
  const image = decodeAvatar(req.body?.dataUrl, MAX_BANNER_BYTES)
  if (!image.ok) {
    return res.status(400).json({ error: REASONS[image.reason] || 'That image was refused.' })
  }

  /*
   * A blocked account cannot publish a banner, for the same reason it cannot
   * post: a silenced account with a full-width image on a public page still
   * has a billboard.
   */
  const { data: banned } = await db.from('blocked').select('address').eq('address', address).maybeSingle()
  if (banned) return res.status(403).json({ error: 'This account cannot post here.' })

  let bannerUrl
  try {
    bannerUrl = await storeImage(db, {
      bucket: BANNER_BUCKET,
      address,
      image,
      maxBytes: MAX_BANNER_BYTES,
    })
  } catch (err) {
    console.error('banner: upload failed:', err.message)
    return res.status(503).json({ error: 'That image could not be saved.' })
  }

  // Upserted, not updated: signing in does not create a profile row, so the
  // first thing an account does may well be to set a banner.
  const { error } = await db
    .from('profiles')
    .upsert(
      { address, banner_url: bannerUrl, updated_at: new Date().toISOString() },
      { onConflict: 'address' },
    )

  if (error) {
    console.error('banner: write failed:', error.message)
    return res.status(503).json({ error: 'That image could not be saved.' })
  }

  return res.status(200).json({ address, bannerUrl })
}

async function remove(req, res, db, caller) {
  // Query string, not a body: the dev server's shim only parses a body for
  // POST and PUT, so a DELETE body would work on Vercel and fail locally.
  const url = new URL(req.url, 'http://localhost')
  const asked = normaliseAddress(url.searchParams.get('address'))
  const target = asked || caller

  if (target !== caller) {
    if (!isAdminAddress(caller, parseAdminAddresses(process.env.ADMIN_ADDRESSES))) {
      // 404 rather than 403, matching every other moderator route here: a 403
      // confirms there is a power behind this worth having.
      return res.status(404).json({ error: 'Not found.' })
    }
  }

  try {
    await removeImage(db, {
      bucket: BANNER_BUCKET,
      address: target,
      column: 'banner_url',
      maxBytes: MAX_BANNER_BYTES,
    })
  } catch (err) {
    console.error('banner: removal failed:', err.message)
    return res.status(503).json({ error: 'That image could not be removed.' })
  }

  return res.status(200).json({ address: target, bannerUrl: null })
}
