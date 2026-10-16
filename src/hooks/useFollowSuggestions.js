import { useEffect, useState } from 'react'
import { fetchAffinity } from '../services/feedSignals'
import { fetchFollowOverlap, fetchFollowing } from '../services/follows'
import { fetchProfilesByAddress } from '../services/discover'
import { followSuggestions } from '../utils/followSuggestions'
import { useMutes } from './useMutes'
import { useSiweAuth } from '../context/SiweAuthContext'

/**
 * Who to suggest this reader follows.
 *
 * Empty for somebody signed out or with no history, and that is the honest
 * answer rather than a gap: every signal here is about what the reader has
 * done, so there is nothing to compute for somebody who has done nothing.
 * `DiscoverPanel` keeps showing "who has been posting" underneath, which is
 * what a new account actually needs - see src/services/discover.js, which
 * argues that recency beats popularity on a site this young.
 *
 * Four fetches and then one pure function. The fetches are the reader's own
 * history, who they already follow, who their followees follow, and the
 * profiles of whatever comes out - in that order, because the last one needs
 * the result of the others and there is no point fetching profiles for
 * accounts that will be filtered out.
 */
export function useFollowSuggestions({ limit = 6 } = {}) {
  const { account } = useSiweAuth()
  const mutes = useMutes()

  const [suggestions, setSuggestions] = useState([])

  /*
   * The mute set as a stable key. A Set is a new object every render, so
   * depending on it directly would refetch continuously; sorted, so the same
   * addresses in a different insertion order are one key.
   */
  const mutedKey = [...mutes.addresses].sort().join(',')

  useEffect(() => {
    if (!account) {
      setSuggestions([])
      return undefined
    }

    let alive = true

    const load = async () => {
      /*
       * Affinity and the existing follow list together: neither needs the
       * other, and the overlap query needs the second.
       */
      const [affinity, following] = await Promise.all([
        fetchAffinity(),
        fetchFollowing(account).catch(() => []),
      ])
      if (!alive) return

      const overlap = await fetchFollowOverlap(following)
      if (!alive) return

      const picked = followSuggestions({
        affinity,
        overlap,
        following,
        muted: mutedKey ? mutedKey.split(',') : [],
        viewer: account,
        limit,
      })

      if (picked.length === 0) {
        setSuggestions([])
        return
      }

      /*
       * The profiles last, for the ones that survived the filtering. Fetching
       * them earlier would mean a query for every candidate the graph threw up,
       * most of which are dropped for being followed or muted already.
       */
      const profiles = await fetchProfilesByAddress(picked.map((s) => s.address))
      if (!alive) return

      const byAddress = new Map(profiles.map((profile) => [profile.address, profile]))

      /*
       * Kept in the scored order, and dropped when there is no profile row.
       *
       * An account with no row has never set a handle or a bio, so a card for
       * it would be an address and a Follow button with nothing to decide on.
       * That is a worse suggestion than one fewer suggestion.
       */
      setSuggestions(
        picked
          .map((s) => ({ ...s, profile: byAddress.get(s.address) || null }))
          .filter((s) => s.profile),
      )
    }

    load().catch(() => {
      // Swallowed, and nothing drawn. This is a panel of suggestions below a
      // list that works without it; a failure should remove the suggestions,
      // not put an error over discovery.
      if (alive) setSuggestions([])
    })

    return () => {
      alive = false
    }
  }, [account, mutedKey, limit])

  return { suggestions, canSuggest: Boolean(account) }
}
