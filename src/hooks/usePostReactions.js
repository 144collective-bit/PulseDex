import { useCallback, useEffect, useRef, useState } from 'react'
import { setPostReaction, subscribeToPostReactions } from '../services/posts'
import { useSiweAuth } from '../context/SiweAuthContext'
import { hasSupabase } from '../config/supabase'

/**
 * The reactions on whatever posts are on screen.
 *
 * Held here rather than inside each post, which is the same lesson
 * `useFollowSet` learned the expensive way: a hook per row meant a query per
 * row, and twenty rows came to sixty requests on a browser that runs six at a
 * time. These reactions arrive with the posts - POST_FIELDS embeds them - so
 * there is no query to make at all. What this holds is the *changes*: an
 * optimistic toggle, and whatever realtime publishes.
 *
 * An overlay rather than editing the posts in place. The feed owns its list
 * and refetches it on paging, on a tab change and on a realtime insert; a
 * reaction written into one of those objects would be lost the next time any
 * of that happened. Keyed by post id, the overlay survives all of it.
 *
 * @param {Array<{ id: number, reactions?: Array<object> }>} posts
 */
export function usePostReactions(posts) {
  const { account } = useSiweAuth()
  const me = account ? account.toLowerCase() : null

  /** postId -> array of { emoji, address }. */
  const [overlay, setOverlay] = useState(() => new Map())
  const [busy, setBusy] = useState(() => new Set())
  const [error, setError] = useState(null)

  /*
   * What arrived with the posts, as a ref rather than state.
   *
   * It is read inside the realtime handler and the toggle, and neither should
   * re-subscribe or be rebuilt when a new page of posts lands. A ref is the
   * honest shape for "the latest thing I was given".
   */
  const fromPosts = useRef(new Map())
  useEffect(() => {
    const next = new Map()
    for (const post of posts || []) {
      if (post?.id) next.set(post.id, Array.isArray(post.reactions) ? post.reactions : [])
    }
    fromPosts.current = next
  }, [posts])

  /**
   * The reactions for one post, or undefined if nothing has changed them.
   *
   * Undefined rather than an empty array, deliberately. The caller writes
   * `reactions ?? post.reactions`, so undefined means "use what came with the
   * post" - and an empty array would not, because `[]` is not nullish.
   *
   * That mattered on the first render: `fromPosts` is filled by an effect, so
   * returning `?? []` handed every card an empty list for one paint and the
   * tallies appeared a frame later. A post with four reactions flashed as a
   * post with none.
   */
  const reactionsFor = useCallback((postId) => overlay.get(postId), [overlay])

  /*
   * Apply one change, from a press or from realtime.
   *
   * Written against whatever is current at the moment it runs, which is why it
   * reads the overlay inside the updater rather than from the closure - two
   * reactions landing in the same tick would otherwise have the second
   * overwrite the first.
   */
  const apply = useCallback((postId, emoji, address, added) => {
    setOverlay((current) => {
      const base = current.get(postId) ?? fromPosts.current.get(postId) ?? []
      const without = base.filter((r) => !(r.emoji === emoji && r.address === address))
      const next = added ? [...without, { emoji, address }] : without

      const map = new Map(current)
      map.set(postId, next)
      return map
    })
  }, [])

  useEffect(() => {
    if (!hasSupabase) return undefined

    /*
     * One subscription for every post's reactions rather than one per post.
     * The row carries its post id, so changes for posts that are not on
     * screen are applied to an overlay nobody reads and cost nothing - which
     * is cheaper than tearing a socket down and building another every time
     * the list changes.
     */
    return subscribeToPostReactions({
      onChange: ({ postId, emoji, address, added }) => apply(postId, emoji, address, added),
    })
  }, [apply])

  /**
   * React, or take it back.
   *
   * Moved first and put back on failure, the same shape as the follow button:
   * pressing a reaction and watching the number sit still for half a second
   * reads as a button that did not work, and the honest alternative - a
   * spinner on a count - is worse.
   */
  const toggle = useCallback(
    async (postId, emoji, on) => {
      if (!me) return

      const key = `${postId}:${emoji}`
      if (busy.has(key)) return

      setError(null)
      setBusy((current) => new Set(current).add(key))
      apply(postId, emoji, me, on)

      try {
        await setPostReaction({ id: postId, emoji, on })
      } catch (err) {
        // Put it back, and say why. A reaction that silently did not save is
        // a count that disagrees with the database until the next reload.
        apply(postId, emoji, me, !on)
        setError(err.message)
      } finally {
        setBusy((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
      }
    },
    [me, busy, apply],
  )

  return {
    reactionsFor,
    toggle,
    canReact: Boolean(me) && hasSupabase,
    error,
    clearError: useCallback(() => setError(null), []),
  }
}
