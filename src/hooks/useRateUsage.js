import { useCallback, useEffect, useState } from 'react'
import { fetchMyLimits } from '../services/moderation'
import { rateUsage } from '../utils/rateUsage'
import { FEED_POST_LIMITS, POST_LIMITS } from '../utils/chatRate'
import { useSiweAuth } from '../context/SiweAuthContext'

/**
 * How much of their own posting allowance this account has used.
 *
 * The limits have been enforced since the chat shipped and have never been
 * visible, so the first anybody knew about one was being stopped mid-sentence
 * by a number they had never seen - which reads as the site being broken
 * rather than as a rule being applied.
 *
 * Fetched once per mount and recomputed locally from then on. The arithmetic
 * needs no server: the endpoint returns the timestamps, `rateUsage` does the
 * counting, and a post made in this session is added to the local list by
 * `record` rather than refetched. A composer that asked the server after every
 * keystroke would be a rate limit of its own.
 *
 * @param {{ kind?: 'posts'|'messages' }} [options] which allowance to report on
 */
export function useRateUsage({ kind = 'posts' } = {}) {
  const { account } = useSiweAuth()

  const [timestamps, setTimestamps] = useState(null)
  const [limits, setLimits] = useState(null)

  useEffect(() => {
    if (!account) {
      // Cleared on sign-out, so one account's posting history is never used to
      // describe another's allowance.
      setTimestamps(null)
      setLimits(null)
      return undefined
    }

    let alive = true
    fetchMyLimits().then((payload) => {
      if (!alive || !payload) return
      setTimestamps(payload[kind] || [])
      setLimits(payload.limits?.[kind] || null)
    })

    return () => {
      alive = false
    }
  }, [account, kind])

  /**
   * Count a post this session just made.
   *
   * Local rather than a refetch, and the reason is the one case this feature
   * exists for: somebody writing their third post in a minute needs the line
   * to say so before they write a fourth, and a round trip to find that out is
   * a round trip during which they have already written it.
   *
   * The stamp is this clock's rather than the database's, which is the same
   * small lie `exceededLimit` corrects for - and it errs toward counting the
   * post slightly early, so the display is never more permissive than the
   * endpoint.
   */
  const record = useCallback((at = Date.now()) => {
    setTimestamps((current) => (current === null ? current : [...current, at]))
  }, [])

  /*
   * The deployment's limits when they arrived, and the bundle's otherwise.
   *
   * The endpoint sends them so the numbers somebody is shown are the ones the
   * server they are talking to actually enforces - a bundle cached from before
   * a limit changed would otherwise display the old one confidently. The
   * fallback is what makes the line appear at all before the fetch lands.
   */
  const applied = limits || (kind === 'messages' ? POST_LIMITS : FEED_POST_LIMITS)

  /*
   * Null until the fetch answers, so nothing is drawn rather than "0 of 3 a
   * minute" for somebody who has posted twice. A usage line that is confidently
   * wrong for a second is worse than one that appears a second late.
   */
  const usage = timestamps === null ? null : rateUsage(timestamps, applied)

  return { usage, record, limits: applied }
}
