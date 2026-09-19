import { supabase, hasSupabase } from '../config/supabase'
import { PAGE_SIZE, hasMoreBefore } from '../utils/chatPaging'

/**
 * Reading and writing posts.
 *
 * The same split as the chat, and it is the security model rather than an
 * accident: reads come straight from Supabase over the anon key, which row
 * level security restricts to exactly that, and writes go to our own endpoint,
 * which is the only thing holding a key that can write.
 *
 * What differs is the direction. A conversation reads downward, so the chat
 * fetches newest-first and reverses. A feed reads downward too, but downward
 * means backwards in time - so what comes out of here stays newest-first and
 * is rendered in that order.
 */

const POST_FIELDS =
  'id, address, body, created_at, profiles!posts_address_fkey ( handle, avatar_id, avatar_url )'

/** Flatten the joined row into something a component can render without
 *  knowing the shape of the query that produced it. */
function toPost(row) {
  return {
    id: row.id,
    address: row.address,
    body: row.body,
    createdAt: row.created_at,
    handle: row.profiles?.handle || null,
    avatarId: row.profiles?.avatar_id || null,
    avatarUrl: row.profiles?.avatar_url || null,
  }
}

/**
 * A page of posts, newest first.
 *
 * With an `author`, that person's posts; without, everybody's. One function
 * rather than two, because the only difference is a `.eq` and the paging
 * either way is identical - and two copies of paging is two places for an
 * off-by-one to live.
 *
 * @param {{ author?: string|null, before?: string|null, limit?: number }} options
 */
export async function fetchPostPage({ author = null, before = null, limit = PAGE_SIZE } = {}) {
  if (!hasSupabase) return { posts: [], hasMore: false }

  let query = supabase
    .from('posts')
    .select(POST_FIELDS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (author) query = query.eq('address', author.toLowerCase())

  // Exclusive, so the post the cursor came from is not returned again. An
  // inclusive bound would refetch the same page forever, and the merge would
  // hide it by absorbing the duplicate.
  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = data || []
  return { posts: rows.map(toPost), hasMore: hasMoreBefore(rows, limit) }
}

/** One post with its author attached, by id. */
async function fetchPost(id) {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_FIELDS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) return null
  return toPost(data)
}

/**
 * Watch for posts arriving and leaving.
 *
 * Returns the unsubscribe function. An insert arrives as the raw row, without
 * the joined profile - the feed publishes what changed in one table and knows
 * nothing about the join - so each one is fetched back by id to pick up its
 * author. That is one small query per post, which the rate limit makes
 * affordable: three a minute per account is not a query storm.
 *
 * One channel for every post rather than one per author. A profile page wants
 * one person's, but Supabase's filter is set when the channel opens, and a
 * page that changes who it is showing would have to tear the socket down and
 * build another every time. `author` is applied to what arrives instead - and
 * applied to the raw row, before the join, so a profile page does not spend a
 * query on every post by everybody else just to discard it.
 *
 * @param {{ author?: string|null, onPost: (post: object) => void,
 *   onRemoved: (id: number) => void }} handlers
 */
export function subscribeToPosts({ author = null, onPost, onRemoved }) {
  if (!hasSupabase) return () => {}

  const wanted = author ? author.toLowerCase() : null

  const channel = supabase
    .channel('feed-posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
      if (wanted && payload.new.address !== wanted) return
      const post = await fetchPost(payload.new.id)
      if (post) onPost(post)
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, (payload) => {
      // `deleted_at` is the only column anything ever changes, so an update is
      // a removal until there is something else it could be.
      if (payload.new.deleted_at) onRemoved(payload.new.id)
    })
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * Publish a post.
 *
 * Only the body. The author is not sent: the address comes from the sign-in
 * cookie, and the name and picture from the profile that cookie identifies. A
 * body that could name its own author would let anyone post as anyone.
 */
export async function createPost(body) {
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ body }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    // The endpoint's own sentence, when it sent one. It knows things the
    // browser does not - which limit was hit, how long to wait.
    throw new Error(payload.error || 'Your post could not be published.')
  }

  return payload.post ? toPost(payload.post) : null
}

/** Take a post down. Your own always; anyone's if you are a moderator. For
 *  anyone else the endpoint answers as though the post does not exist. */
export async function deletePost(id) {
  const res = await fetch(`/api/posts?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'That post could not be removed.')
  }
}

/**
 * Flag a post for a moderator.
 *
 * Reporting the same post twice answers success rather than an error: from
 * where the reader is standing it is reported either way, and being told it
 * was "already reported" invites the reading that the first one was ignored.
 */
export async function reportPost({ id, reason }) {
  const res = await fetch('/api/posts/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ id, reason }),
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'That post could not be reported.')
  }
}

/**
 * How many posts somebody has, without fetching them.
 *
 * `head: true` sends the query and asks for the count in a header rather than
 * the rows, so a profile showing "412 posts" does not download 412 posts to
 * work that out. The same partial index the feed rides on serves it.
 *
 * Answers 0 rather than throwing on failure. A count is decoration on a
 * profile page, and losing it should not take the page with it.
 */
export async function fetchPostCount(address) {
  if (!hasSupabase || !address) return 0

  const { count, error } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('address', address.toLowerCase())
    .is('deleted_at', null)

  if (error) return 0
  return count || 0
}
