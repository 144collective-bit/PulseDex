import { useCallback, useEffect, useState } from 'react'
import { fetchFollowCounts, isFollowing, setFollowing } from '../services/follows'
import { useSiweAuth } from '../context/SiweAuthContext'
import { hasSupabase } from '../config/supabase'

/**
 * The follow relationship between the reader and one profile.
 *
 * Holds three things that are always wanted together and would otherwise be
 * three separate pieces of state in whatever component drew the button: the
 * counts, whether the reader follows this person, and whether a change is in
 * flight.
 *
 * The counts move optimistically. Pressing Follow and watching the number sit
 * still for half a second reads as a button that did not work, and the honest
 * alternative - a spinner on a number - is worse. A failure puts both back and
 * says why.
 *
 * @param {string|null} address whose profile is being looked at
 */
export function useFollow(address) {
  const { account } = useSiweAuth()

  const [counts, setCounts] = useState({ followers: 0, following: 0 })
  const [following, setFollows] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const target = address ? address.toLowerCase() : null
  const me = account ? account.toLowerCase() : null

  // Following yourself is refused by the database and by the endpoint; this is
  // what stops the button being drawn in the first place.
  const canFollow = Boolean(me && target && me !== target && hasSupabase)

  useEffect(() => {
    if (!target) return undefined

    let active = true

    fetchFollowCounts(target).then((next) => {
      if (active) setCounts(next)
    })

    // Asked separately, because it depends on who is reading and the counts do
    // not - so signing in refreshes this without refetching those.
    if (me && me !== target) {
      isFollowing({ follower: me, followee: target }).then((yes) => {
        if (active) setFollows(yes)
      })
    } else {
      setFollows(false)
    }

    return () => {
      active = false
    }
  }, [target, me])

  const toggle = useCallback(async () => {
    if (!canFollow || busy) return

    const next = !following
    setError(null)
    setBusy(true)

    // Moved first, put back on failure. The button and the count have to agree
    // with each other at every moment, so they change together either way.
    setFollows(next)
    setCounts((c) => ({ ...c, followers: Math.max(0, c.followers + (next ? 1 : -1)) }))

    try {
      await setFollowing({ address: target, on: next })
    } catch (err) {
      setFollows(!next)
      setCounts((c) => ({ ...c, followers: Math.max(0, c.followers + (next ? -1 : 1)) }))
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [canFollow, busy, following, target])

  return { counts, following, canFollow, busy, error, toggle }
}
