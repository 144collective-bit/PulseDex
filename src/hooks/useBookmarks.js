import { useCallback, useEffect, useState } from 'react'
import { fetchBookmarks, setBookmark } from '../services/posts'
import { useSiweAuth } from '../context/SiweAuthContext'

/**
 * Which posts this account has saved.
 *
 * One request for the whole set rather than one per post, which is the lesson
 * `useFollowSet` paid for: a hook per row meant a query per row, twenty rows
 * came to sixty requests, and a browser runs six at a time. A feed needs to
 * draw a filled or empty bookmark on every row, and that is one question asked
 * once.
 *
 * Only when signed in. Bookmarks are private - `post_bookmarks` has no read
 * policy for any browser-facing role, so there is nothing to ask for without a
 * cookie, and asking anyway would be a 401 per mount.
 *
 * Nothing is reported when the list fails to load. Every row then draws an
 * empty bookmark, pressing one saves it, and the endpoint is idempotent - so
 * the failure costs a wrong icon rather than a wrong outcome. A banner over
 * the feed because a decoration could not be fetched would be worse.
 */
export function useBookmarks() {
  const { account } = useSiweAuth()

  const [ids, setIds] = useState(() => new Set())
  const [busy, setBusy] = useState(() => new Set())
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!account) {
      // Emptied on sign-out, so one account's saved state is never drawn
      // under another's session.
      setIds(new Set())
      return undefined
    }

    let alive = true
    fetchBookmarks()
      .then(({ ids: saved }) => {
        if (alive) setIds(new Set(saved))
      })
      .catch(() => {})

    return () => {
      alive = false
    }
  }, [account])

  const isSaved = useCallback((id) => ids.has(id), [ids])

  /**
   * Save or unsave, moved first and put back on failure.
   *
   * The same shape as the follow button and a reaction: pressing a control and
   * watching it sit still reads as a control that did not work. A save is the
   * cheapest thing to get wrong and the easiest to retry, so optimism is the
   * right trade.
   */
  const toggle = useCallback(
    async (id, on) => {
      if (!account || busy.has(id)) return

      setError(null)
      setBusy((current) => new Set(current).add(id))
      setIds((current) => {
        const next = new Set(current)
        if (on) next.add(id)
        else next.delete(id)
        return next
      })

      try {
        await setBookmark({ id, on })
      } catch (err) {
        setIds((current) => {
          const next = new Set(current)
          if (on) next.delete(id)
          else next.add(id)
          return next
        })
        setError(err.message)
      } finally {
        setBusy((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }
    },
    [account, busy],
  )

  return {
    isSaved,
    toggle: account ? toggle : null,
    /** How many are saved, for the tab's count. Not the whole list: the Saved
     *  tab fetches the posts themselves when it is opened. */
    count: ids.size,
    error,
  }
}
