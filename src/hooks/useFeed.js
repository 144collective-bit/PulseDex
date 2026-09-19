import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPostPage, subscribeToPosts } from '../services/posts'
import { oldestCursor } from '../utils/chatPaging'
import { hasSupabase } from '../config/supabase'

export const FEED_STATUS = {
  unconfigured: 'unconfigured',
  loading: 'loading',
  ready: 'ready',
  failed: 'failed',
}

/**
 * A feed: what has been posted, and what is being posted now.
 *
 * The same two sources as the chat, merged the same way - a page of history on
 * mount, plus the realtime stream from then on - because the same problem
 * exists. A post can arrive twice, once in the reply to the request that
 * created it and once from the feed a moment later, and a timeline that shows
 * your post twice looks broken in a way that makes people stop trusting the
 * rest of it. Everything here is keyed by id and merged rather than appended.
 *
 * Sorted newest first, which is where it parts company with the chat. A
 * conversation reads downward through time; a feed reads downward away from
 * it.
 *
 * @param {{ author?: string|null }} options an address to show one person's
 *   posts, or nothing for everybody's
 */
export function useFeed({ author = null, authors = null, replies = false } = {}) {
  const [posts, setPosts] = useState([])
  const [status, setStatus] = useState(
    hasSupabase ? FEED_STATUS.loading : FEED_STATUS.unconfigured,
  )
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  /*
   * Held in a ref as well as state so the merge can read the current list
   * without depending on it. Without this, every arriving post would rebuild
   * the subscription - tearing down and reopening a websocket per post, which
   * drops whatever lands in between.
   */
  const byId = useRef(new Map())

  // Lowercased once here rather than at each comparison. An address arrives
  // from a URL as often as from a row, and the two casings are the same
  // account to everyone except a string compare.
  const wanted = author ? author.toLowerCase() : null

  /*
   * A stable key for the author list.
   *
   * `authors` is an array built by its caller, so it is a new object on every
   * render and depending on it directly would tear down the subscription and
   * refetch the feed continuously. The joined string changes only when the set
   * actually changes.
   */
  const authorsKey = authors ? authors.join(',') : ''

  const merge = useCallback((incoming) => {
    const next = byId.current
    for (const post of incoming) next.set(post.id, post)

    setPosts(
      [...next.values()].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id,
      ),
    )
  }, [])

  const forget = useCallback((id) => {
    byId.current.delete(id)
    setPosts((current) => current.filter((p) => p.id !== id))
  }, [])

  useEffect(() => {
    if (!hasSupabase) return undefined

    let active = true

    /*
     * Emptied on every change of author, not merged into.
     *
     * The ref outlives a re-render, so without this, opening one profile and
     * then another shows the first person's posts under the second person's
     * name until the fetch lands - and any of theirs the filter below lets
     * through would join them.
     */
    byId.current = new Map()
    setPosts([])
    setStatus(FEED_STATUS.loading)

    fetchPostPage({ author: wanted, authors, replies })
      .then((page) => {
        if (!active) return
        merge(page.posts)
        setHasMore(page.hasMore)
        setStatus(FEED_STATUS.ready)
      })
      .catch((err) => {
        if (!active) return
        setError(err.message)
        setStatus(FEED_STATUS.failed)
      })

    /*
     * Subscribed immediately, not after the history arrives. A post published
     * during that fetch would otherwise land in neither - too late for the
     * query, too early for the subscription - and vanish until a reload. The
     * merge makes the overlap harmless.
     */
    const unsubscribe = subscribeToPosts({
      // Applied inside the subscription, against the raw row, so a profile
      // page does not fetch every post by everybody else just to discard it.
      author: wanted,
      onPost: (post) => {
        if (!active) return
        // The subscription is every post. A feed of top-level posts must not
        // take replies, a Replies tab must not take top-level posts, and a
        // following feed must not take people who are not followed.
        if (replies ? !post.parentId : post.parentId) return
        if (authors && !authors.includes(post.address)) return
        merge([post])
      },
      onRemoved: (id) => {
        if (active) forget(id)
      },
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [wanted, merge, forget])

  /**
   * Fetch the page before the oldest post held.
   *
   * Guarded against overlapping calls. Two requests in flight would both page
   * from the same cursor and fetch the same posts, which the merge would
   * absorb - leaving a button that looks broken because pressing it twice
   * quickly appears to do nothing.
   */
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore) return
    const before = oldestCursor([...byId.current.values()])
    if (!before) return

    setLoadingOlder(true)
    try {
      const page = await fetchPostPage({ author: wanted, authors, replies, before })
      merge(page.posts)
      setHasMore(page.hasMore)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingOlder(false)
    }
  }, [wanted, authorsKey, replies, hasMore, loadingOlder, merge])

  return {
    posts,
    status,
    error,
    hasMore,
    loadingOlder,
    loadOlder,
    /** Show a post this browser just published, without waiting for the feed
     *  to bring it back around. */
    add: useCallback((post) => merge([post]), [merge]),
    remove: forget,
  }
}
