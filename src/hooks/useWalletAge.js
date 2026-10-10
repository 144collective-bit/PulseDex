import { useEffect, useState } from 'react'

/**
 * How old is this wallet?
 *
 * Two sources, in order. The profile row carries `first_seen_at` once anybody
 * has looked it up, and that is almost always the answer - an address's first
 * transaction does not change, so the value is written once in the life of
 * the site and read from the database forever after. Only the first visitor to
 * a given profile pays for the lookup.
 *
 * So this hook is mostly a pass-through, and the endpoint call is the cold
 * path. Written that way deliberately: the obvious version asks the endpoint
 * every time and lets it answer from its own cache, which is one extra
 * serverless invocation on every profile view to learn something the profile
 * query already returned.
 *
 * Returns null while it does not know, and null is also the final answer for
 * an address the explorer has no record of. The caller must draw nothing for
 * null rather than drawing a date - see walletAgeLabel, which returns null for
 * the same reason, and isFreshWallet, which is false for an unknown age rather
 * than true.
 *
 * @param {string|null} address
 * @param {string|null} cached `firstSeenAt` from the profile row
 * @returns {string|null} an ISO timestamp, or null
 */
export function useWalletAge(address, cached = null) {
  const [found, setFound] = useState(null)

  useEffect(() => {
    // Known already, or nothing to ask about. Either way no request.
    if (!address || cached) return undefined

    let active = true

    fetch(`/api/profile/first-seen?address=${encodeURIComponent(address)}`, {
      credentials: 'same-origin',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (active) setFound(payload?.firstSeenAt || null)
      })
      /*
       * Swallowed, and this is the whole error handling. A wallet's age is one
       * line on a page; a deployment with no explorer reachable, or none
       * configured, shows a profile without that line. There is nothing for a
       * reader to do about it and nothing for them to be told.
       */
      .catch(() => {})

    return () => {
      active = false
    }
  }, [address, cached])

  /*
   * The cached value wins whenever there is one, including when it arrives
   * after a lookup already started - the profile and this hook load in
   * parallel, so a slow profile query can land second.
   */
  return cached || found
}
