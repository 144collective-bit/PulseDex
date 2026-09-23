import { useCallback, useEffect, useState } from 'react'
import { fetchTokenClaim } from '../services/claims'

/**
 * Who has claimed this token, if anybody.
 *
 * Returns the claimant's address or null, plus a way to ask again - which the
 * claim flow calls once it has succeeded, so the badge appears without a
 * reload.
 *
 * A failed lookup is null, same as no claim. That conflation is right here:
 * the badge is a statement this site is making about somebody, and the safe
 * answer when we cannot check is to make no statement at all. It fails
 * towards showing nothing rather than towards showing a badge.
 *
 * @param {string|null} token
 */
export function useTokenClaim(token) {
  const [claim, setClaim] = useState(null)
  const [round, setRound] = useState(0)

  const refresh = useCallback(() => setRound((n) => n + 1), [])

  useEffect(() => {
    if (!token) {
      setClaim(null)
      return undefined
    }

    let active = true

    fetchTokenClaim(token)
      .then((found) => {
        if (active) setClaim(found)
      })
      .catch(() => {
        if (active) setClaim(null)
      })

    return () => {
      active = false
    }
  }, [token, round])

  return { claim, refresh }
}
