import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { POST_FIELDS } from '../../../src/config/queries.js'

/**
 * What somebody saved to read later.
 *
 * The first private surface in the social section, and the only one of these
 * routes whose GET could not have been a Supabase query from the browser. The
 * reason is written down in 0010 and 0020 and is worth having in front of
 * whoever adds the next private feature:
 *
 *   Sign-in here is a wallet signature and a JWT this app sets in an httpOnly
 *   cookie. It is NOT Supabase auth. So `auth.uid()` is null in every request
 *   the browser makes, and row level security cannot express "your own rows" -
 *   there is no identity for it to compare against. A policy saying
 *   `using (address = auth.uid())` would not restrict `post_bookmarks`, it
 *   would empty it.
 *
 * So the table has no read policy at all, the anon key cannot see it, and
 * every read comes through here with the service role key and an address that
 * came from the cookie rather than from the request.
 *
 * GET returns this account's saved posts. POST saves one, DELETE unsaves it.
 * Both writes are idempotent: saving twice leaves one row, unsaving twice
 * leaves none.
 *
 * There is no route to anybody else's bookmarks, by construction - `address`
 * is never read from the request on any of the three verbs. That is the whole
 * privacy model and it is one line in each handler.
 */
export default async function handler(req, res) {
  /*
   * `no-store`, and here it is load-bearing rather than habit. This response
   * is one person's private list, and a shared cache holding it under a URL
   * with no account in it would serve one reader's saved posts to the next.
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

  if (!address) return res.status(401).json({ error: 'Sign in to save posts.' })

  const limited = rateLimit(req, { key: 'post-bookmark', limit: 60, windowMs: 60_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Slow down a moment.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Saving is not configured on this deployment.' })

  if (req.method === 'GET') return list(req, res, db, address)
  if (req.method === 'POST') return save(req, res, db, address)
  if (req.method === 'DELETE') return unsave(req, res, db, address)

  res.setHeader('Allow', 'GET, POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

/** A post id from a request, or null. */
function postId(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

async function list(req, res, db, address) {
  const url = new URL(req.url, 'http://localhost')
  const asked = Number(url.searchParams.get('limit'))
  // Bounded regardless of what was asked for, so `?limit=100000` is a page
  // rather than an attempt to read the whole table in one request.
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 50) : 25

  const saved = await db
    .from('post_bookmarks')
    .select('post_id, created_at')
    .eq('address', address)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (saved.error) {
    console.error('bookmarks: read failed:', saved.error.message)
    return res.status(503).json({ error: 'Your saved posts could not be loaded.' })
  }

  const ids = (saved.data || []).map((row) => row.post_id)
  if (ids.length === 0) return res.status(200).json({ posts: [], ids: [] })

  /*
   * Two queries rather than an embed, the same call fetchReactedPosts makes:
   * POST_FIELDS itself embeds `post_reactions`, and asking for it nested
   * inside another table is a shape that depends on how a particular PostgREST
   * version resolves it. Two plain queries are easier to read and to order.
   */
  const posts = await db
    .from('posts')
    .select(POST_FIELDS)
    .in('id', ids)
    .is('deleted_at', null)

  if (posts.error) {
    console.error('bookmarks: reading the posts failed:', posts.error.message)
    return res.status(503).json({ error: 'Your saved posts could not be loaded.' })
  }

  /*
   * Back into the order the bookmarks gave, because `in` returns rows in
   * whatever order the database finds them - and a saved list that claims to
   * be newest-first and is not is a list nobody can say is wrong.
   *
   * A removed post drops out here rather than being reported. The bookmark row
   * survives a soft delete, so this filter is what keeps a taken-down post out
   * of somebody's saved list without needing a cascade that `deleted_at` could
   * never trigger.
   */
  const byId = new Map((posts.data || []).map((row) => [row.id, row]))

  return res.status(200).json({
    posts: ids.map((id) => byId.get(id)).filter(Boolean),
    /*
     * The ids as they were stored, including any whose post has gone.
     *
     * Returned separately so a feed elsewhere can draw the saved state on its
     * rows without a second request - and deliberately not filtered, because
     * the question that list answers is "have I saved this", which is still
     * yes for a post that has since been removed.
     */
    ids,
  })
}

async function save(req, res, db, address) {
  const id = postId(req.body?.id)
  if (!id) return res.status(400).json({ error: 'That is not a post.' })

  // The profile row has to exist, because the column references one. Somebody
  // who has only ever read the feed is exactly who saves something first.
  const profile = await db
    .from('profiles')
    .upsert({ address }, { onConflict: 'address', ignoreDuplicates: true })

  if (profile.error) {
    console.error('bookmarks: ensuring the profile row failed:', profile.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  const { error } = await db
    .from('post_bookmarks')
    // The pair is the primary key, so a repeat is the same row. Ignoring the
    // duplicate is what makes this idempotent rather than an error.
    .upsert({ address, post_id: id }, { onConflict: 'address,post_id', ignoreDuplicates: true })

  if (error) {
    // 23503 is the foreign key: no such post. The same 404 a removed post
    // gives elsewhere, so this does not become a way to probe which ids exist.
    if (error.code === '23503') return res.status(404).json({ error: 'Not found.' })
    console.error('bookmarks: the insert failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  return res.status(201).json({ id, saved: true })
}

async function unsave(req, res, db, address) {
  // Query string, not a body: the dev server's shim only parses a body for
  // POST and PUT, so a DELETE body would work on Vercel and fail locally.
  const url = new URL(req.url, 'http://localhost')
  const id = postId(url.searchParams.get('id'))
  if (!id) return res.status(400).json({ error: 'That is not a post.' })

  // Scoped to this address. Without the `eq` on it this would be a route for
  // deleting anybody's bookmark by id.
  const { error } = await db
    .from('post_bookmarks')
    .delete()
    .eq('address', address)
    .eq('post_id', id)

  if (error) {
    console.error('bookmarks: the removal failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  // Removing one that was not there is success: the caller wanted it gone.
  return res.status(200).json({ id, saved: false })
}
