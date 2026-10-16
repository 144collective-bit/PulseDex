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
import { POST_WRITE_FIELDS } from '../../src/config/queries.js'
import { resolveMentions, recordMentions, notifyReply } from '../_lib/notify.js'
import { canEditPost, EDIT_REFUSED } from '../../src/utils/postEdit.js'
import { isPostImageSize } from '../../src/utils/avatarUpload.js'
import { POST_IMAGE_BUCKET } from '../_lib/avatars.js'
import { logAction } from '../_lib/moderation.js'

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
  if (req.method === 'PATCH') return edit(req, res)
  if (req.method === 'DELETE') return remove(req, res)

  res.setHeader('Allow', 'POST, PATCH, DELETE')
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

  /*
   * The post being quoted, checked rather than trusted.
   *
   * Distinct from `parentId` above: a reply lives under the post it answers
   * and is kept out of the main feed, while a quote is a post of its own that
   * carries somebody else's words. So both can be present, and both are
   * validated the same way - the id arrives in a body, and a quote_id pointing
   * at nothing would be a foreign key violation returned as a 500 rather than
   * a sentence.
   *
   * A quote of a removed post is refused. The read path can draw "that post is
   * not here" for something taken down after the fact, which is right - but
   * letting somebody quote a post that is already gone would be a way to
   * manufacture that state deliberately, attaching their own framing to a
   * card nobody can check.
   *
   * Quoting a reply is allowed, unlike replying to one. A reply is a public
   * post with an author, and quoting it is how somebody answers a point made
   * in a thread out where it can be seen - the nesting limit that stops
   * replies-to-replies is about the thread view, and a quote is not in it.
   */
  let quoteId = null
  if (req.body?.quoteId !== undefined && req.body?.quoteId !== null) {
    quoteId = Number(req.body.quoteId)
    if (!Number.isSafeInteger(quoteId) || quoteId <= 0) {
      return res.status(400).json({ error: 'That is not a post to quote.' })
    }

    const quoted = await db
      .from('posts')
      .select('id')
      .eq('id', quoteId)
      .is('deleted_at', null)
      .maybeSingle()

    if (quoted.error) {
      console.error('posts: reading the quoted post failed:', quoted.error.message)
      return res.status(503).json({ error: 'Posting is unavailable right now.' })
    }

    if (!quoted.data) return res.status(404).json({ error: 'Not found.' })
  }

  /*
   * The image, as the URL and size that api/_routes/posts/image.js came back
   * with.
   *
   * Not the bytes: they went to their own route, before this one, so that a
   * picture which cannot be stored fails before anybody's words are published.
   * What arrives here is therefore a URL the caller was handed - and is still
   * checked, because this endpoint is reachable with curl and a URL in a body
   * is a claim.
   *
   * The check is narrow on purpose: it must be an https URL inside our own
   * post-image bucket. Accepting any https URL would let somebody publish a
   * post whose image is hotlinked from anywhere - which hands that host the IP
   * of every reader who scrolls past, the exact leak that link previews are
   * fetched server-side to avoid.
   */
  let image = {}
  if (req.body?.image) {
    const { url, width, height } = req.body.image

    if (!isPostImageSize(width, height) || !isOurImageUrl(url)) {
      return res.status(400).json({ error: 'That image could not be attached.' })
    }

    image = { image_url: url, image_w: Number(width), image_h: Number(height) }
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
    .insert({
      address,
      body: post.body,
      parent_id: parentId,
      quote_id: quoteId,
      ...image,
    })
    // Without the reactions embed: a post that was just published has none.
    .select(POST_WRITE_FIELDS)
    .single()

  if (inserted.error) {
    console.error('posts: the insert failed:', inserted.error.message)
    return res.status(503).json({ error: 'Posting is unavailable right now.' })
  }

  /*
   * Mentions and notifications, after the post exists and before the reply.
   *
   * Awaited rather than left running, because this is a serverless function:
   * work still outstanding when the response is sent is work that gets killed
   * with the process. A promise nobody waits for is a notification that
   * arrives on a fast machine and vanishes on a slow one.
   *
   * None of it can fail the request. The post is already written and is the
   * thing that mattered; every function in _lib/notify.js swallows and logs
   * its own errors rather than throwing into this path.
   */
  const mentioned = await resolveMentions(db, {
    body: post.body,
    author: address,
    explicit: req.body?.mentions,
  })
  await recordMentions(db, { postId: inserted.data.id, author: address, addresses: mentioned })
  await notifyReply(db, { postId: inserted.data.id, parentId, author: address })

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

  /*
   * Logged only when a moderator did it, not when somebody deleted their own
   * post. The audit trail exists so power exercised over other people is
   * visible; filling it with every author tidying their own timeline would
   * make the entries that matter unfindable, and would also turn it into a
   * record of what ordinary accounts have thought better of saying.
   *
   * After the update, and awaited: an entry written before an update that then
   * failed is a record of something that did not happen, and work not awaited
   * in a serverless function is killed when the response goes out.
   */
  if (!mine && moderator) {
    await logAction(db, {
      actor: address,
      action: 'remove_post',
      subjectPostId: id,
      subjectAddress: existing.data.address || null,
    })
  }

  return res.status(200).json({ id, removed: true })
}

/**
 * Is this URL one of our own post images?
 *
 * The narrow check the publish path applies to an image URL that arrived in a
 * body. It must be https, and its path must sit inside the post-image bucket
 * that api/_routes/posts/image.js writes to.
 *
 * Narrow on purpose. Accepting any https URL would let somebody publish a post
 * whose image is hotlinked from anywhere they like - which hands that host the
 * IP address of every reader who scrolls past the post, which is the exact
 * leak that link previews are fetched on the server to avoid. An image on a
 * post has to come from us for the same reason a preview does.
 *
 * The bucket name is matched as a whole path segment, so a bucket called
 * `post-images-evil` on somebody else's Supabase project does not satisfy it.
 * The host is not checked against our own project's, deliberately: the project
 * URL is an environment variable that differs between production, preview and
 * local, and a check that has to be right in three places is a check that
 * will be wrong in one. What this guarantees is the shape; what guarantees the
 * origin is that the only way to get a URL of this shape is to have uploaded
 * through our own endpoint.
 */
function isOurImageUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return false

  let url
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (url.protocol !== 'https:') return false

  return url.pathname.split('/').includes(POST_IMAGE_BUCKET)
}

/**
 * Change the body of a post inside the edit window.
 *
 * The rules live in src/utils/postEdit.js and are consulted by both this and
 * the interface, so what gets offered and what gets allowed cannot disagree
 * about what the rule is. Briefly: your own post, within five minutes, and not
 * if somebody has already replied to it.
 *
 * `edited_at` is always stamped, and that is the point of the feature rather
 * than bookkeeping for it. An edit that left no trace would be a way to change
 * what you said after people read it - and on a site where posts are about
 * what to buy, "I said sell" after the fact is worth money.
 *
 * Only the body. Not the image, not the quote, not the parent: those are what
 * the post *is*, and an edit that could swap the picture would let the words
 * stay and the evidence change.
 */
async function edit(req, res) {
  const address = await signedInAddress(req)
  if (!address) return res.status(401).json({ error: 'Sign in first.' })

  const limited = rateLimit(req, { key: 'post-edit', limit: 20, windowMs: 60_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }

  const id = Number(req.body?.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'That is not a post.' })
  }

  const post = normalisePost(req.body?.body)
  if (!post.ok) {
    return res.status(400).json({ error: REFUSALS[post.reason] || 'That post cannot be saved.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Posting is not configured on this deployment.' })

  const existing = await db
    .from('posts')
    .select('id, address, created_at, deleted_at')
    .eq('id', id)
    .maybeSingle()

  if (existing.error) {
    console.error('posts: reading the post to edit failed:', existing.error.message)
    return res.status(503).json({ error: 'Posting is unavailable right now.' })
  }

  /*
   * Gone, never there, or somebody else's: all the same 404.
   *
   * `canEditPost` distinguishes them and the interface uses that to decide
   * what to offer, but an answer sent to a caller must not - telling a
   * stranger that a given id is somebody else's live post is a way to walk the
   * table.
   */
  if (!existing.data) return res.status(404).json({ error: 'Not found.' })

  /*
   * How many replies it has, which is one of the rules.
   *
   * Counted here rather than taken from the request, obviously - but worth
   * saying why it is counted at all when the window is only five minutes: a
   * reply can arrive in thirty seconds, and rewriting a post that has an
   * answer under it makes the answer look like a response to something nobody
   * said. The time limit protects readers in general; this protects the one
   * person who replied.
   */
  const replies = await db
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id)
    .is('deleted_at', null)

  if (replies.error) {
    console.error('posts: counting replies failed:', replies.error.message)
    return res.status(503).json({ error: 'Posting is unavailable right now.' })
  }

  const allowed = canEditPost({
    post: {
      id: existing.data.id,
      address: existing.data.address,
      createdAt: existing.data.created_at,
      deletedAt: existing.data.deleted_at,
    },
    account: address,
    replyCount: replies.count || 0,
  })

  if (!allowed.ok) {
    if (allowed.reason === EDIT_REFUSED.notYours || allowed.reason === EDIT_REFUSED.gone) {
      return res.status(404).json({ error: 'Not found.' })
    }
    if (allowed.reason === EDIT_REFUSED.answered) {
      return res.status(409).json({ error: 'Somebody has replied. This can no longer be edited.' })
    }
    return res.status(409).json({ error: 'The edit window for this post has closed.' })
  }

  const updated = await db
    .from('posts')
    .update({ body: post.body, edited_at: new Date().toISOString() })
    .eq('id', id)
    // Scoped to the author as well, so the write itself cannot touch anybody
    // else's row even if the check above were ever reordered away.
    .eq('address', address)
    .select(POST_WRITE_FIELDS)
    .single()

  if (updated.error) {
    console.error('posts: the edit failed:', updated.error.message)
    return res.status(503).json({ error: 'That edit could not be saved.' })
  }

  /*
   * Mentions are re-resolved, so naming somebody in an edit notifies them.
   *
   * `notifications_once_idx` is what stops this telling anybody twice: a
   * person already mentioned in the original is already notified, and the
   * upsert ignores the duplicate. Somebody added by the edit is new and hears
   * about it, which is the behaviour anybody would expect.
   *
   * Mentions removed by an edit are deliberately left in `post_mentions`. The
   * row is a record that the post named them at the time, which is what makes
   * the notification they already received make sense when they open it.
   */
  const mentioned = await resolveMentions(db, {
    body: post.body,
    author: address,
    explicit: req.body?.mentions,
  })
  await recordMentions(db, { postId: id, author: address, addresses: mentioned })

  return res.status(200).json({ post: updated.data })
}
