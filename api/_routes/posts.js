import { SESSION_COOKIE, getCookie, readSession } from '../_lib/session.js'
import { isSameOrigin, rateLimit } from '../_lib/guard.js'
import { serviceClient } from '../_lib/supabase.js'
import { normalisePost, REJECTED_POST } from '../../src/utils/post.js'
import { parseAdminAddresses, isAdminAddress } from '../../src/utils/chatAdmin.js'
import {
  exceededLimit,
  retryAfterSeconds,
  FEED_POST_LIMITS,
  longestWindowMs,
} from '../../src/utils/chatRate.js'
import { POST_FIELDS } from '../../src/config/queries.js'

/**
 * Publishing and removing posts.
 *
 * The same shape as api/chat/messages.js and for the same reasons: reads go
 * straight to Supabase over the anon key, which row level security restricts
 * to exactly that, and every write comes through here because this is the only
 * place holding a key that can write. The address is never read from the
 * request body - it comes from the sign-in cookie - because a body that could
 * name its own author would let anyone post as anyone.
 *
 * What differs from a chat message is what a post costs. A message is one line
 * in a room that scrolls; a post goes onto a profile and into a feed and stays
 * there. So the rate limit is far tighter, and removal has a second caller:
 * the author, who can take their own post down. A moderator deleting your
 * message is moderation; not being able to delete your own post is a platform
 * that publishes on your behalf and will not stop.
 */

/** The reason a body was refused, in a sentence rather than a code. */
const REFUSALS = {
  [REJECTED_POST.notText]: 'A post has to be text.',
  [REJECTED_POST.empty]: 'Write something first.',
  [REJECTED_POST.tooLong]: 'That post is too long.',
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  if (req.method === 'POST') return publish(req, res)
  if (req.method === 'DELETE') return remove(req, res)

  res.setHeader('Allow', 'POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

/** Who this request is, by the cookie alone. */
async function signedInAddress(req) {
  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    return session?.sub || null
  } catch {
    // A missing or short SESSION_SECRET reads as signed out, which is the same
    // answer sign-in itself gives rather than a new error the UI must learn.
    return null
  }
}

async function publish(req, res) {
  // The per-IP limiter first, ahead of the database, so an unauthenticated
  // flood does not cost a round trip each.
  const limited = rateLimit(req, { key: 'post-create', limit: 20, windowMs: 60_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }

  const address = await signedInAddress(req)
  if (!address) {
    return res.status(401).json({ error: 'Connect a wallet and sign in to post.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Posting is not configured on this deployment.' })

  /*
   * Blocked before anything else that costs something.
   *
   * Deliberately without a reason. The reason column exists for whoever reads
   * the table in six months, not for the account it describes - telling
   * somebody precisely which rule they broke is telling them precisely what to
   * avoid next time.
   */
  const blocked = await db.from('blocked').select('address').eq('address', address).maybeSingle()
  if (blocked.error) {
    console.error('posts: reading the blocklist failed:', blocked.error.message)
    return res.status(503).json({ error: 'Posting is unavailable right now.' })
  }
  if (blocked.data) return res.status(403).json({ error: 'You cannot post here.' })

  const post = normalisePost(req.body?.body)
  if (!post.ok) {
    return res.status(400).json({ error: REFUSALS[post.reason] || 'That post cannot be published.' })
  }

  /*
   * A reply is a post with a parent, so this endpoint publishes both and the
   * only difference is one column.
   *
   * The parent is checked for existence rather than trusted, because it
   * arrives in a body. A parent_id pointing at nothing would insert fine - the
   * foreign key would refuse it, but as a 500 rather than a sentence - and one
   * pointing at a reply would build a thread the feed does not render.
   */
  let parentId = null
  if (req.body?.parentId !== undefined && req.body?.parentId !== null) {
    parentId = Number(req.body.parentId)
    if (!Number.isInteger(parentId) || parentId <= 0) {
      return res.status(400).json({ error: 'That is not a post to reply to.' })
    }

    const parent = await db
      .from('posts')
      .select('id, parent_id')
      .eq('id', parentId)
      .is('deleted_at', null)
      .maybeSingle()

    if (parent.error) {
      console.error('posts: reading the parent failed:', parent.error.message)
      return res.status(503).json({ error: 'Posting is unavailable right now.' })
    }

    // Gone, or never there. The same 404 a removed post gives elsewhere, so
    // this does not become a way to ask which ids exist.
    if (!parent.data) return res.status(404).json({ error: 'Not found.' })

    /*
     * Replies are one level deep. The column would allow a tree; the feed
     * renders a post and its replies and nothing below that, so a reply to a
     * reply would be written and then never shown. Refused rather than
     * silently reparented, because quietly moving somebody's words under a
     * different post is worse than telling them it did not go.
     */
    if (parent.data.parent_id) {
      return res.status(400).json({ error: 'You cannot reply to a reply.' })
    }
  }

  const since = new Date(Date.now() - longestWindowMs(FEED_POST_LIMITS)).toISOString()
  const recent = await db
    .from('posts')
    .select('created_at')
    .eq('address', address)
    .gte('created_at', since)
    /*
     * Removed posts count.
     *
     * Excluding them would make "post, delete, repeat" an unlimited channel -
     * every post still lands in everyone's realtime feed before it is taken
     * down, so a deleted post has already cost the thing the limit protects.
     */
    .limit(100)

  if (recent.error) {
    console.error('posts: reading recent posts failed:', recent.error.message)
    return res.status(503).json({ error: 'Posting is unavailable right now.' })
  }

  const over = exceededLimit(
    recent.data.map((row) => Date.parse(row.created_at)),
    Date.now(),
    FEED_POST_LIMITS,
  )
  if (over) {
    res.setHeader('Retry-After', String(retryAfterSeconds(over.retryAfterMs)))
    return res.status(429).json({
      error:
        over.windowMs <= 60_000
          ? 'Slow down a moment.'
          : 'You have posted a lot in the last hour. Try again later.',
    })
  }

  /*
   * A profile row has to exist, because a post points at one. `ignoreDuplicates`
   * inserts when absent and does nothing when present, so an account that has
   * chosen a handle and a picture cannot lose either by posting.
   */
  const profile = await db
    .from('profiles')
    .upsert({ address }, { onConflict: 'address', ignoreDuplicates: true })

  if (profile.error) {
    console.error('posts: ensuring the profile row failed:', profile.error.message)
    return res.status(503).json({ error: 'Posting is unavailable right now.' })
  }

  const inserted = await db
    .from('posts')
    .insert({ address, body: post.body, parent_id: parentId })
    .select(POST_FIELDS)
    .single()

  if (inserted.error) {
    console.error('posts: the insert failed:', inserted.error.message)
    return res.status(503).json({ error: 'Posting is unavailable right now.' })
  }

  return res.status(201).json({ post: inserted.data })
}

async function remove(req, res) {
  const address = await signedInAddress(req)
  if (!address) return res.status(401).json({ error: 'Sign in first.' })

  // Query string rather than a body: the dev server's shim only parses a body
  // for POST and PUT, so a DELETE body would work on Vercel and fail locally.
  const url = new URL(req.url, 'http://localhost')
  const id = Number(url.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'That is not a post.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Posting is not configured on this deployment.' })

  const existing = await db
    .from('posts')
    .select('id, address')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing.error) {
    console.error('posts: reading the post failed:', existing.error.message)
    return res.status(503).json({ error: 'Posting is unavailable right now.' })
  }

  /*
   * A post that is already gone answers as though it never existed, which is
   * the same answer somebody else's post gives below. Distinguishing the two
   * would turn this into a way of asking whether a given id was ever a post
   * and who wrote it.
   */
  if (!existing.data) return res.status(404).json({ error: 'Not found.' })

  const mine = existing.data.address === address
  const moderator = isAdminAddress(address, parseAdminAddresses(process.env.ADMIN_ADDRESSES))

  if (!mine && !moderator) {
    // 404 rather than 403, matching the chat's removal endpoint: a 403
    // confirms there is a moderator power here worth having.
    return res.status(404).json({ error: 'Not found.' })
  }

  // Soft, like a removed message. A moderator deleting a post should not punch
  // a hole in the history, and a hard delete leaves no way to see what was
  // removed or to put it back after a mistake.
  const { error } = await db
    .from('posts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('posts: the removal failed:', error.message)
    return res.status(503).json({ error: 'That post could not be removed.' })
  }

  return res.status(200).json({ id, removed: true })
}
