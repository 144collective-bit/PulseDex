import { useCallback, useEffect, useState } from 'react'
import { fetchFollowingAmong, setFollowing } from '../services/follows'
import { useSiweAuth } from '../context/SiweAuthContext'
import { hasSupabase } from '../config/supabase'

/**
 * Follow state for a list of people, in one query.
 *
 * The list counterpart to useFollow, which is for a single profile. The
 * difference is not style: useFollow asks three questions per person, and a
 * page rendering twenty of them asked sixty - with a browser running six at a
 * time, that is ten round trips before the buttons know what to say.
 *
 * This asks once, for everybody, and answers the only question a row's button
 * has: do I follow this person. Follower counts are deliberately absent -
 * a list does not show them, and fetching them was two thirds of the cost.
 *
 * @param {string[]} addresses everyone currently on screen
 */
export function useFollowSet(addresses) {
  const { account } = useSiweAuth()

  const [followed, setFollowed] = useState(() => new Set())
  const [busy, setBusy] = useState(() => new Set())
  const [error, setError] = useState(null)

  const me = account ? account.toLowerCase() : null

  /*
   * A stable key for the list.
   *
   * `addresses` is built by its caller, so it is a new array on every render
   * and depending on it directly would refetch forever. The joined string
   * changes only when the people actually change.
   */
  const key = (addresses || []).join(',')

  useEffect(() => {
    if (!me || !hasSupabase) {
      setFollowed(new Set())
      return undefined
    }

    let active = true
    fetchFollowingAmong(me, addresses).then((set) => {
      if (active) setFollowed(set)
    })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, key])

  const toggle = useCallback(
    async (address) => {
      const target = address.toLowerCase()
      if (!me || me === target || busy.has(target)) return

      const next = !followed.has(target)
      setError(null)
      setBusy((current) => new Set(current).add(target))

      // Moved first, put back on failure. A button that sits still for half a
      // second after a press reads as one that did not work.
      setFollowed((current) => {
        const updated = new Set(current)
        if (next) updated.add(target)
        else updated.delete(target)
        return updated
      })

      try {
        await setFollowing({ address: target, on: next })
      } catch (err) {
        setFollowed((current) => {
          const updated = new Set(current)
          if (next) updated.delete(target)
          else updated.add(target)
          return updated
        })
        setError(err.message)
      } finally {
        setBusy((current) => {
          const updated = new Set(current)
          updated.delete(target)
          return updated
        })
      }
    },
    [me, followed, busy],
  )

  return {
    /** Does the reader follow this address? */
    isFollowing: useCallback((address) => followed.has(address.toLowerCase()), [followed]),
    /** Is a change for this address in flight? */
    isBusy: useCallback((address) => busy.has(address.toLowerCase()), [busy]),
    /** Can the reader follow at all - signed in, and not themselves. */
    canFollow: useCallback(
      (address) => Boolean(me && hasSupabase && me !== address.toLowerCase()),
      [me],
    ),
    error,
    toggle,
  }
}
