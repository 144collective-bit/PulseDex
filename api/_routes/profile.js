import { SESSION_COOKIE, getCookie, readSession } from '../_lib/session.js'
import { isSameOrigin, rateLimit } from '../_lib/guard.js'
import { serviceClient } from '../_lib/supabase.js'
import { normaliseHandle, normaliseAvatarId } from '../../src/utils/chatMessage.js'
import { normaliseBio, normaliseLinks } from '../../src/utils/profileFields.js'

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
 * PUT sets the handle, preset avatar, bio and links. There is no DELETE: a
 * profile with no messages is harmless, and one with messages cannot be
 * removed without orphaning them.
 *
 * The uploaded picture is not written here - see api/profile/avatar.js. It is
 * bytes going to a different store with its own failures, and a picture that
 * could be set by the same request that sets a name would have to succeed or
 * fail with it.
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

/**
 * The columns this endpoint reads back and echoes.
 *
 * One string, because `read` and `write` both have to ask for the same shape
 * and when they drifted the symptom was a save that answered with a profile
 * missing a field the form had just set. Not PUBLIC_PROFILE_FIELDS: that one
 * is what strangers get, and these two differ on purpose - `created_at` is on
 * the public one and not here, because your own profile form has no use for
 * it, and nothing private is on either.
 */
const OWN_PROFILE_COLUMNS =
  'address, handle, avatar_id, avatar_url, banner_url, bio, links, pinned_post_id, show_holdings'

async function read(res, db, address) {
  const { data, error } = await db
    .from('profiles')
    .select(OWN_PROFILE_COLUMNS)
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
    avatarUrl: data?.avatar_url || null,
    bannerUrl: data?.banner_url || null,
    bio: data?.bio || null,
    links: Array.isArray(data?.links) ? data.links : [],
    pinnedPostId: data?.pinned_post_id || null,
    // Explicitly against `true`, so a null column on a row written before 0019
    // ran reads as off rather than as truthy-ish nothing.
    showHoldings: data?.show_holdings === true,
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
  const body = req.body || {}

  /*
   * A field is written when the request mentions it and left alone when it
   * does not. The distinction matters because two different things call this:
   * the profile form, which sends everything, and useChatIdentity, which
   * pushes a name when the local one changes and knows nothing about bios or
   * links. Writing every column on every request would mean the second one
   * silently emptied whatever the first had saved.
   *
   * Clearing is still possible, and is how it should be - an empty string
   * clears a bio, an empty array clears the links. What cannot happen is
   * clearing something by not mentioning it.
   *
   * What is stored is always what the normalisers returned, never what
   * arrived. Normalising and then saving the raw value would put exactly the
   * characters they strip - and exactly the URLs they refuse - into the
   * database.
   */
  const patch = { address, updated_at: new Date().toISOString() }

  if ('handle' in body) patch.handle = normaliseHandle(body.handle)
  if ('avatarId' in body) patch.avatar_id = normaliseAvatarId(body.avatarId)
  if ('bio' in body) patch.bio = normaliseBio(body.bio)

  // Item by item: normaliseLinks keeps the ones it can accept and drops the
  // rest, so somebody saving three links one of which is http ends up with
  // the two that are https rather than an error about the third.
  if ('links' in body) patch.links = normaliseLinks(body.links)

  /*
   * Holdings on or off. A boolean and nothing else - anything that is not
   * literally true is off, so a request that sends "false", 0 or an object
   * cannot turn somebody's balances into a public page by being truthy.
   *
   * This is the switch described in 0019_profile_depth.sql, and the only thing
   * in the app that throws it. It is never set as a side effect of anything
   * else, and there is no default-on path: an account that has never touched
   * it shows nothing.
   */
  if ('showHoldings' in body) patch.show_holdings = body.showHoldings === true

  /*
   * The pin, which is the one field here that cannot be validated by looking
   * at it.
   *
   * A handle is checked against a pattern, a bio against a length. A post id
   * is only valid if that post exists, has not been removed, and belongs to
   * the account pinning it - and none of that is knowable without asking. So
   * it is asked, before the write, and a pin that does not pass is refused
   * rather than quietly dropped: somebody pressing Pin and seeing nothing
   * happen would press it again.
   *
   * Without the ownership half of that check this endpoint would let any
   * signed-in account display any post, by anybody, at the top of its own
   * page under its own name - which is the shape of every impersonation this
   * site has to worry about. src/services/profile.js checks it again at read
   * time, on the other side of the database, for the same reason.
   */
  if ('pinnedPostId' in body) {
    const pin = await readPin(db, address, body.pinnedPostId)
    if (pin.error) return res.status(pin.status).json({ error: pin.error })
    patch.pinned_post_id = pin.id
  }

  const { data, error } = await db
    .from('profiles')
    .upsert(patch, { onConflict: 'address' })
    .select(OWN_PROFILE_COLUMNS)
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
    // Echoed although this endpoint never writes it, so a save does not hand
    // the caller a profile with the picture missing from it.
    avatarUrl: data.avatar_url || null,
    bannerUrl: data.banner_url || null,
    bio: data.bio,
    links: Array.isArray(data.links) ? data.links : [],
    pinnedPostId: data.pinned_post_id || null,
    showHoldings: data.show_holdings === true,
  })
}

/**
 * Which post, if any, this account is allowed to pin.
 *
 * Returns `{ id }` to write, or `{ error, status }` to answer with. Null is a
 * legitimate id: it is how a pin is cleared, and clearing is always allowed
 * because there is nothing to verify about removing something.
 *
 * `deleted_at is null` is part of the lookup rather than checked afterwards,
 * so a post a moderator has taken down cannot be pinned back onto a page. The
 * answer for a removed post and for one that never existed is the same
 * sentence, deliberately - telling somebody which of the two it was would say
 * whether a post they cannot see had been deleted.
 *
 * @param {object} db service-role client
 * @param {string} address the signed-in account
 * @param {unknown} value whatever the request sent
 */
async function readPin(db, address, value) {
  if (value === null || value === undefined || value === '') return { id: null }

  const id = Number(value)
  // Integer and positive. A float or a huge number would reach Postgres as a
  // type error and come back as a 503 about profiles being unavailable, which
  // is a misleading thing to say about somebody mistyping an id.
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { error: 'That is not a post.', status: 400 }
  }

  const { data, error } = await db
    .from('posts')
    .select('id, address')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('profile: pin lookup failed:', error.message)
    return { error: 'Profiles are unavailable right now.', status: 503 }
  }

  if (!data) return { error: 'That post is not here.', status: 404 }

  // The whole reason this function exists.
  if (data.address !== address) {
    return { error: 'You can only pin your own posts.', status: 403 }
  }

  return { id: data.id }
}
