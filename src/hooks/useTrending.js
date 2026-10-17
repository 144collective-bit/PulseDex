import { useEffect, useMemo, useState } from 'react'
import { fetchActiveTokenRooms } from '../services/rooms'
import { byToken } from '../utils/talkedAbout'
import { trendingPairs, withMentions } from '../utils/trending'
import { isStablecoin } from '../services/dexscreener'

/** How often to re-read which rooms are busy. Matches useTalkedAbout and
 *  useTokenRooms: long enough not to be a poll, short enough that a token
 *  somebody just started discussing turns up without a reload. */
const REFRESH_MS = 120_000

/**
 * What is moving, and whether anybody is talking about it.
 *
 * **Ranked entirely on-chain.** The order is `trendingPairs` and nothing else
 * touches it. Room activity is fetched and attached, never ranked on, and the
 * reason is the whole shape of this surface:
 *
 *   A trending list built from mentions is a pump button. A handful of
 *   accounts posting a ticker repeatedly would put it in front of everybody,
 *   labelled as organic interest. Trading a token moves this list; posting
 *   about it does not.
 *
 * What the social half adds is the disagreement. A token moving hard with an
 * empty room, or a busy room around a token doing nothing, are both worth
 * knowing - and a single blended score would have destroyed exactly that
 * information.
 *
 * The pairs are passed in rather than fetched. The screener already holds
 * them, one request for the whole app, and a second fetch here would be the
 * same data twice and two different answers while they disagreed.
 *
 * @param {object[]} pairs from the screener
 * @param {{ limit?: number, enabled?: boolean }} [options]
 */
export function useTrending(pairs, { limit = 12, enabled = true } = {}) {
  const [rooms, setRooms] = useState(() => new Map())

  useEffect(() => {
    if (!enabled) return undefined

    let active = true

    const load = () => {
      /*
       * A wider limit than the sidebar's eight, for the reason useTalkedAbout
       * gives: that list is read as a list, and this is a lookup. A token on
       * screen whose room is busy and shows nothing is worse than one more row
       * in the query.
       */
      fetchActiveTokenRooms({ limit: 60 })
        .then((found) => {
          if (active) setRooms(byToken(found))
        })
        .catch(() => {
          /*
           * Swallowed into an empty map. The ranking does not depend on this -
           * it is context beside an on-chain figure - so a database hiccup
           * should take the message counts off the rows, not put an error over
           * a surface about what is trading.
           */
          if (active) setRooms(new Map())
        })
    }

    load()
    const timer = setInterval(load, REFRESH_MS)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [enabled])

  const rows = useMemo(() => {
    if (!enabled) return []

    return withMentions(
      trendingPairs(pairs, {
        limit,
        // Stablecoins are excluded by symbol, the same check the dashboard
        // module applies: a dollar trading against a dollar is not a trend.
        exclude: (pair) => isStablecoin(pair?.baseToken?.symbol),
      }),
      rooms,
    )
  }, [pairs, rooms, limit, enabled])

  return rows
}
