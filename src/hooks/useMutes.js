import { useCallback, useEffect, useState } from 'react'
import { fetchMutes, setMuted } from '../services/mutes'
import { useSiweAuth } from '../context/SiweAuthContext'

/**
 * Who this reader has muted.
 *
 * One request for the whole set, which is the lesson `useFollowSet` and
 * `useBookmarks` both paid for: a hook per row means a query per row, twenty
 * rows came to sixty requests, and a browser runs six at a time. The feed has
 * to test every post against this, so it is one question asked once.
 *
 * Only when signed in, because a mute list is private - `muted` has no read
 * policy for any browser-facing role, so there is nothing to ask for without a
 * cookie.
 *
 * The set is returned as well as the predicate, because the feed hands it to
 * `fetchPostPage` rather than filtering rows itself - see `withoutMuted` in
 * src/services/posts.js for why the filtering happens there and not in the
 * database.
 */
export function useMutes() {
  const { account } = useSiweAuth()

  const [addresses, setAddresses] = useState(() => new Set())
  const [people, setPeople] = useState([])
  const [busy, setBusy] = useState(() => new Set())
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!account) {
      /*
       * Emptied on sign-out, so one reader's mutes are never applied under
       * another's session. This matters more here than for bookmarks: a stale
       * mute set would silently hide posts from somebody who never muted
       * anybody, and there is nothing on screen that would explain it.
       */
      setAddresses(new Set())
      setPeople([])
      return undefined
    }

    let alive = true
    fetchMutes().then(({ addresses: muted, muted: rows }) => {
      if (!alive) return
      setAddresses(muted)
      setPeople(rows)
    })

    return () => {
      alive = false
    }
  }, [account])

  const isMuted = useCallback(
    (address) => Boolean(address) && addresses.has(address.toLowerCase()),
    [addresses],
  )

  /**
   * Mute or unmute, moved first and put back on failure.
   *
   * The same optimism as the follow button and the bookmark, and the posts
   * disappearing immediately is most of the point - somebody who has just
   * muted an account and still sees them has no way to tell whether it worked.
   */
  const toggle = useCallback(
    async (address, on) => {
      const key = typeof address === 'string' ? address.toLowerCase() : null
      if (!account || !key || busy.has(key)) return

      setError(null)
      setBusy((current) => new Set(current).add(key))
      setAddresses((current) => {
        const next = new Set(current)
        if (on) next.add(key)
        else next.delete(key)
        return next
      })

      try {
        await setMuted({ address: key, on })
        /*
         * The list of people is refetched rather than patched, and only on the
         * way in. Muting from a post card has a handle and a picture to hand;
         * muting from a mention or a notification may have neither, and a row
         * in the settings list with nothing on it but an address is a row
         * nobody can act on. Unmuting needs no refetch - the row is gone.
         */
        if (on) {
          const { muted: rows } = await fetchMutes()
          setPeople(rows)
        } else {
          setPeople((current) => current.filter((row) => row.address !== key))
        }
      } catch (err) {
        setAddresses((current) => {
          const next = new Set(current)
          if (on) next.delete(key)
          else next.add(key)
          return next
        })
        setError(err.message)
      } finally {
        setBusy((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
      }
    },
    [account, busy],
  )

  return {
    /** The set itself, for `fetchPostPage`. */
    addresses,
    /** Rows with handles and pictures, for the list in profile settings. */
    people,
    isMuted,
    /** Null when nobody is signed in, so a control can simply not be drawn. */
    toggle: account ? toggle : null,
    error,
  }
}
