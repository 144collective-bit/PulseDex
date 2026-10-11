import { supabase, hasSupabase } from '../config/supabase'
import { PAGE_SIZE, hasMoreBefore } from '../utils/chatPaging'
import { POST_FIELDS } from '../config/queries'
import { dbError } from '../utils/dbError'
import { isSafeAvatarSrc } from '../utils/avatarImage'

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
    // Null for a top-level post, the parent's id for a reply. The feed shows
    // only the former; a profile's Replies tab shows only the latter.
    parentId: row.parent_id || null,
    /*
     * Who this post names, as rows rather than as something to find in the
     * text. A handle here may contain spaces, so there is no pattern that
     * could recover them from the body - see src/utils/mentions.js.
     *
     * The handle is whatever that account is called now, not what was typed,
     * which is what makes a mention survive a rename.
     */
    mentions: (row.post_mentions || [])
      .map((m) => ({ address: m.address, handle: m.profiles?.handle || null }))
      .filter((m) => m.handle),
    /*
     * When it was last changed, or null. The interface draws an "edited"
     * marker from this - see wasEdited, which deliberately ignores a stamp
     * within a second of the insert so the marker keeps meaning something.
     */
    editedAt: row.edited_at || null,
    /*
     * The image, as one object or null rather than three loose columns.
     *
     * Checked before it is handed over, although it came from our own
     * database: this column is readable with the anon key and the check that
     * wrote it ran in another process on another day, and the value's whole
     * destiny is to be put in an <img src>. The size check is what the feed
     * reserves space with, so a row missing either dimension is treated as
     * having no image at all rather than as an image of unknown shape.
     */
    image: readImage(row),
    /** The post this one quotes, if there is one and it still exists. */
    quote: readQuote(row.quote),
    /** Null unless this post quotes another. Kept beside `quote` because a
     *  quote of a removed post has an id and no post to draw. */
    quoteId: row.quote_id || null,
    /*
     * Who reacted with what, as rows. Not counted here: the component groups
     * them, because it also needs to know whether the reader is among them,
     * and a count would have thrown that away.
     */
    reactions: Array.isArray(row.post_reactions)
      ? row.post_reactions.filter((r) => r && r.emoji && r.address)
      : [],
  }
}

/** The image columns, as one object, or null if any part of it is unusable. */
function readImage(row) {
  const url = row.image_url
  const width = Number(row.image_w)
  const height = Number(row.image_h)

  if (!isSafeAvatarSrc(url)) return null
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null

  return { url, width, height }
}

/**
 * A quoted post, flattened.
 *
 * `removed` rather than dropping the quote, because the two read completely
 * differently: a card saying "that post is not here" tells somebody the quote
 * existed and is gone, while no card at all makes the quoting post look like
 * it was always just those words. The body is not carried on a removed post -
 * showing the text of something taken down, inside somebody else's post, would
 * make a quote the way around a removal.
 */
function readQuote(quote) {
  if (!quote || typeof quote !== 'object' || !quote.id) return null

  if (quote.deleted_at) return { id: quote.id, removed: true }

  return {
    id: quote.id,
    removed: false,
    address: quote.address,
    body: quote.body,
    createdAt: quote.created_at,
    handle: quote.profiles?.handle || null,
    image: isSafeAvatarSrc(quote.image_url) ? { url: quote.image_url } : null,
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
export async function fetchPostPage({
  author = null,
  authors = null,
  before = null,
  limit = PAGE_SIZE,
  replies = false,
  media = false,
} = {}) {
  if (!hasSupabase) return { posts: [], hasMore: false }

  // A following feed with nobody followed is empty, and saying so here saves
  // a query that would ask the database for posts by no one.
  if (authors && authors.length === 0) return { posts: [], hasMore: false }

  let query = supabase
    .from('posts')
    .select(POST_FIELDS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  /*
   * Top level only, unless replies were asked for.
   *
   * Without this the feed would interleave replies with the posts they answer,
   * which reads as the same thing said twice - and a profile would show
   * somebody's half of ten conversations above the things they actually wrote.
   */
  query = replies ? query.not('parent_id', 'is', null) : query.is('parent_id', null)

  /*
   * The Media tab: posts by this account that carry an image.
   *
   * A filter rather than a separate query, for the reason the `replies` flag
   * above exists - the paging either way is identical, and two copies of
   * paging is two places for an off-by-one to live. `image_url` is the column
   * filtered on rather than the dimensions, because 0020's `posts_image_shape`
   * constraint makes the three either all present or all absent.
   */
  if (media) query = query.not('image_url', 'is', null)

  if (author) query = query.eq('address', author.toLowerCase())
  if (authors) query = query.in('address', authors.map((a) => a.toLowerCase()))

  // Exclusive, so the post the cursor came from is not returned again. An
  // inclusive bound would refetch the same page forever, and the merge would
  // hide it by absorbing the duplicate.
  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) throw dbError(error, 'load the feed')

  const rows = data || []
  return { posts: rows.map(toPost), hasMore: hasMoreBefore(rows, limit) }
}

/**
 * One post with its author attached, by id.
 *
 * Exported for the single-post page at `/p/<id>`, which is the surface a
 * notification and a shared link both land on. Null for a post that does not
 * exist or has been removed, and the caller says so - those are the same
 * answer to whoever followed the link, and distinguishing them would tell a
 * stranger that something was deleted rather than never there.
 */
export async function fetchPost(id) {
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

  /*
   * A fresh channel name each time, not the constant this used to be.
   *
   * The feed is mounted from several places now - the Feed tab, either half
   * of For you / Following, and a profile's Posts or Replies - and switching
   * between them unmounts one and mounts the next. Two subscriptions sharing
   * a name across that handover is a collision: `removeChannel` is
   * asynchronous, so the new one can be created while the old is still
   * leaving, and what survives is either an error or a channel nobody holds a
   * reference to any more.
   *
   * Names are per-connection, so a unique one costs nothing - every channel
   * still rides the one websocket supabase-js keeps open.
   */
  const channel = supabase
    .channel(`feed-posts-${crypto.randomUUID()}`)
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
export async function createPost(body, parentId = null, mentions = [], extra = {}) {
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    /*
     * `parentId` makes it a reply. Sent as null rather than omitted when there
     * is none, so the endpoint reads one shape either way.
     *
     * `mentions` are addresses picked from the composer's list, which is the
     * only way to name an account whose handle contains a space - the server
     * cannot find those in the text. It has accepted them since the table
     * existed and nothing was sending any. They are a request, not a fact:
     * api/_lib/notify.js checks every one against `profiles` before it counts,
     * so a fabricated list creates nothing.
     */
    /*
     * `extra` carries what a post can have beyond its words: `quoteId`, and
     * `image` as the URL and size an upload came back with.
     *
     * An options object rather than two more positional arguments, because
     * `createPost(body, null, [], null, null, 1280, 720)` is a call nobody can
     * read - and because the next thing a post gains goes in here rather than
     * changing every call site again.
     *
     * The image is not uploaded from here. It is stored first, by its own
     * endpoint, and what rides along is the URL that came back - so a picture
     * that could not be stored fails before the post exists rather than
     * publishing words with a broken image beside them.
     */
    body: JSON.stringify({
      body,
      parentId,
      mentions,
      quoteId: extra.quoteId ?? null,
      image: extra.image ?? null,
    }),
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

/**
 * The replies to one post, oldest first.
 *
 * Oldest first, unlike everything else here, because this is a conversation
 * rather than a feed: replies are read in the order they were written, and the
 * newest-first ordering that suits a timeline makes an exchange read backwards.
 *
 * Not paged. A post with more replies than fit in one request is a problem
 * this site does not have yet, and the limit is high enough that hitting it
 * means something worth designing for properly rather than adding a button to.
 */
export async function fetchReplies(parentId, limit = 100) {
  if (!hasSupabase || !parentId) return []

  const { data, error } = await supabase
    .from('posts')
    .select(POST_FIELDS)
    .eq('parent_id', parentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw dbError(error, 'load replies')
  return (data || []).map(toPost)
}

/**
 * How many replies each of these posts has.
 *
 * One query for the whole page rather than one per post: a feed of fifty would
 * otherwise be fifty round trips to draw fifty numbers. Returns a Map from
 * post id to count, and omits the posts with none - a caller reading a missing
 * key as zero is correct and saves filling the map with zeroes.
 */
export async function fetchReplyCounts(postIds) {
  const ids = (postIds || []).filter((id) => Number.isInteger(id))
  if (!hasSupabase || ids.length === 0) return new Map()

  /*
   * The ids rather than a count per group, because PostgREST has no group-by.
   * Capped at a page's worth of replies, which is the same reasoning as
   * fetchReplies: past that the number stops being worth an exact answer.
   */
  const { data, error } = await supabase
    .from('posts')
    .select('parent_id')
    .in('parent_id', ids)
    .is('deleted_at', null)
    .limit(1000)

  if (error) return new Map()

  const counts = new Map()
  for (const row of data || []) {
    counts.set(row.parent_id, (counts.get(row.parent_id) || 0) + 1)
  }
  return counts
}

/**
 * Several posts by id, in the order the ids were given.
 *
 * `in` returns rows in whatever order the database finds them, so the order is
 * put back afterwards - the same correction `fetchActiveProfiles` makes in
 * discover.js, and for the same reason: a list that claims to be in an order
 * and is not is a list nobody can say is wrong.
 *
 * Removed posts simply do not come back, so a caller holding ids from another
 * table gets the ones that still exist and nothing else.
 */
export async function fetchPostsByIds(ids) {
  const wanted = (ids || []).filter((id) => Number.isInteger(id))
  if (!hasSupabase || wanted.length === 0) return []

  const { data, error } = await supabase
    .from('posts')
    .select(POST_FIELDS)
    .in('id', wanted)
    .is('deleted_at', null)

  if (error) throw dbError(error, 'load those posts')

  const byId = new Map((data || []).map((row) => [row.id, toPost(row)]))
  return wanted.map((id) => byId.get(id)).filter(Boolean)
}

/**
 * The posts this account has reacted to, newest reaction first.
 *
 * Two queries rather than one embed, deliberately. The nested version -
 * selecting `post_reactions` with the whole post inside it - would ask
 * PostgREST for a post that itself embeds `post_reactions`, which is the same
 * table one level up. Two plain queries are easier to read, easier to order
 * correctly, and do not depend on how a particular PostgREST version resolves
 * a cycle.
 *
 * The emoji comes back alongside, and that is the point of this tab rather
 * than decoration on it. There is no single "like" on this site - there are six
 * reactions, and 👀 "Watching" on a scam warning is not an endorsement of it.
 * A tab that flattened all six into "Likes" would be claiming an approval
 * nobody gave, so the list says which one each was.
 *
 * @param {string|null} address
 * @param {{ limit?: number }} [options]
 * @returns {Promise<Array<{ post: object, emoji: string, at: string }>>}
 */
export async function fetchReactedPosts(address, { limit = PAGE_SIZE } = {}) {
  if (!hasSupabase || !address) return []

  const { data, error } = await supabase
    .from('post_reactions')
    .select('post_id, emoji, created_at')
    .eq('address', address.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw dbError(error, 'load what this account reacted to')

  const rows = data || []
  const posts = await fetchPostsByIds([...new Set(rows.map((r) => r.post_id))])
  const byId = new Map(posts.map((post) => [post.id, post]))

  return rows
    .map((row) => ({ post: byId.get(row.post_id), emoji: row.emoji, at: row.created_at }))
    // A reaction whose post has been removed drops out here. The reaction row
    // survives the soft delete - nothing cascades on a `deleted_at` stamp - so
    // this filter is what keeps a taken-down post off somebody else's tab.
    .filter((entry) => entry.post)
}

/**
 * React to a post, or take it back.
 *
 * Two verbs rather than a toggle, exactly as the chat's reactions are, and for
 * the reason stated there: a toggle's outcome depends on state the caller
 * cannot see, so a retry after a timeout undoes the thing it was retrying.
 * These are idempotent in both directions.
 */
export async function setPostReaction({ id, emoji, on }) {
  const res = on
    ? await fetch('/api/posts/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id, emoji }),
      })
    : await fetch(
        `/api/posts/reactions?id=${encodeURIComponent(id)}&emoji=${encodeURIComponent(emoji)}`,
        { method: 'DELETE', credentials: 'same-origin' },
      )

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'That reaction could not be saved.')
  }
}

/**
 * Watch for reactions on posts arriving and leaving.
 *
 * One channel for every post's reactions rather than one per post, the same
 * call subscribeToPosts makes. The row carries its post id, so the caller
 * applies it to whatever is on screen and ignores the rest.
 *
 * A unique channel name per subscription: the feed is mounted from several
 * places and `removeChannel` is asynchronous, so two subscriptions sharing a
 * name across a handover is a collision. Names are per-connection, so a unique
 * one costs nothing - every channel still rides the one websocket.
 */
export function subscribeToPostReactions({ onChange }) {
  if (!hasSupabase) return () => {}

  const channel = supabase
    .channel(`post-reactions-${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'post_reactions' },
      (payload) => {
        /*
         * A delete publishes only the replica identity, which for this table
         * is the primary key - and the primary key is every column that
         * matters, so `old` carries the post, the address and the emoji and
         * the change can be applied without a round trip. 0020 chose the key
         * that way on purpose.
         */
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new
        if (!row?.post_id || !row?.emoji || !row?.address) return
        onChange({
          postId: row.post_id,
          emoji: row.emoji,
          address: row.address,
          added: payload.eventType !== 'DELETE',
        })
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * Change the body of a post you just published.
 *
 * The window and the rules are in src/utils/postEdit.js, which both this and
 * the endpoint consult - so what the interface offers and what the server
 * allows cannot disagree about what the rule is. The endpoint decides for
 * real; losing that race shows the endpoint's sentence.
 *
 * Only the body. The image is not editable here: it is a separate upload to a
 * separate store that can fail for its own reasons, and an edit that could
 * silently swap the picture would let the words stay and the evidence change.
 */
export async function editPost(id, body) {
  const res = await fetch('/api/posts', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ id, body }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'That edit could not be saved.')
  return payload.post ? toPost(payload.post) : null
}

/**
 * Publish an image with a post.
 *
 * Sent as a data URL to its own endpoint, exactly as an avatar is, and for the
 * same three reasons: it is tens of kilobytes rather than a field, it goes to
 * a different store with its own failures, and it must not be able to fail the
 * post it belongs to. So the image is stored first and the post carries the
 * URL it came back with - a post published without its picture is worse than a
 * picture that could not be stored and said so.
 *
 * @param {{ dataUrl: string, width: number, height: number }} image
 */
export async function uploadPostImage({ dataUrl, width, height }) {
  const res = await fetch('/api/posts/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ dataUrl, width, height }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'That image could not be uploaded.')
  return payload
}

/* ---------------------------------------------------------- bookmarks ----- */

/**
 * What this account saved to read later.
 *
 * Through an endpoint rather than from the database, and this is the one read
 * in the social section that cannot be anything else. 0010 wrote down why and
 * 0020 repeats it: sign-in here is a wallet signature and a cookie this app
 * sets, not Supabase auth, so `auth.uid()` is null in every browser request
 * and row level security cannot express "your own rows". `post_bookmarks` has
 * no read policy at all, which means the anon key cannot see it - and that is
 * the whole security model for the table.
 *
 * A bookmark being private is the point of it. "Saved to read later" is a list
 * of what somebody is interested in but has not said anything about, which on
 * a site about which tokens to buy is more revealing than their posts.
 */
export async function fetchBookmarks({ limit = PAGE_SIZE } = {}) {
  const res = await fetch(`/api/posts/bookmarks?limit=${encodeURIComponent(limit)}`, {
    credentials: 'same-origin',
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'Your saved posts could not be loaded.')
  }

  const payload = await res.json()
  return {
    posts: (payload.posts || []).map(toPost),
    // Ids as well as posts, so a feed elsewhere can draw the saved state on
    // its rows without asking again.
    ids: Array.isArray(payload.ids) ? payload.ids : [],
  }
}

/** Save a post, or unsave it. Idempotent in both directions, like a
 *  reaction - saving twice leaves one row and unsaving twice leaves none. */
export async function setBookmark({ id, on }) {
  const res = on
    ? await fetch('/api/posts/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id }),
      })
    : await fetch(`/api/posts/bookmarks?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'That could not be saved.')
  }
}
