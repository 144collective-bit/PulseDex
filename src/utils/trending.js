/**
 * What is unusually busy right now.
 *
 * Extracted from src/dashboard/modules/market/Trending.jsx, which computed it
 * inline and had no tests. Moved here because the social section needs the
 * same answer, and two trending definitions in one app is a number that
 * disagrees with itself depending on which page you are on.
 *
 * The definition is that module's and is kept exactly: **the last hour's
 * volume against the last day's average hour.** A pair trading at its normal
 * rate scores 1; one doing five times its usual hourly volume scores 5.
 *
 * That is acceleration, which is what the word is meant to convey. Ranking by
 * raw volume - which `calculateTokenMarketScore` does, correctly, for the
 * screener - would be the same large pairs every hour of every day, and
 * calling that list "trending" would be a lie by labelling.
 *
 * **Why this is ranked on-chain and not on what people are posting.** A
 * trending list built from mentions is a pump button: a handful of accounts
 * posting a ticker repeatedly puts it in front of everybody, labelled as
 * organic interest. Trading a token moves this list; posting about it does
 * not. Social activity rides alongside as context - see `withMentions` - and
 * never as a ranking signal.
 *
 * Pure. Given pairs rather than fetching them.
 */

/**
 * Below these, the ratio is noise rather than a measurement.
 *
 * Both floors are load-bearing and the first one is a safety check rather
 * than a tidiness one. A pair that has existed for an hour has almost no
 * 24-hour volume, so its average hour is near zero and the ratio is enormous -
 * which means without a floor, the top of a trending list is permanently
 * whatever pool was created most recently. On a site about which tokens to
 * buy, that is a list of fresh rug pools presented as the most interesting
 * thing happening.
 *
 * The liquidity floor is the second half of the same problem: a pool with no
 * depth can be moved through by one transaction, so its volume says what one
 * person did rather than what a market did.
 */
export const MIN_HOUR_VOLUME = 5_000
export const MIN_LIQUIDITY = 25_000

/**
 * The most acceleration any pair can report.
 *
 * Capped, because the ratio is unbounded and a pair with a near-zero daily
 * average that just did its floor-clearing hour can produce a number in the
 * thousands. Past about twenty the figure stops describing a market and starts
 * describing a pair with no history, which the floors above are already
 * supposed to have excluded - so the cap is the third line of defence rather
 * than the first.
 */
export const MAX_SCORE = 20

/**
 * How fast this pair is trading relative to its own day.
 *
 * Null rather than zero when the pair does not qualify, so a caller can tell
 * "not trending" from "not measurable" - the first belongs at the bottom of a
 * list and the second does not belong on it at all.
 *
 * @param {object} pair a DexScreener pair
 * @returns {number|null} 1 is its normal rate; null when unmeasurable
 */
export function trendingScore(pair) {
  const hour = Number(pair?.volume?.h1 ?? 0)
  const day = Number(pair?.volume?.h24 ?? 0)
  const liquidity = Number(pair?.liquidity?.usd ?? 0)

  if (!Number.isFinite(hour) || !Number.isFinite(day) || !Number.isFinite(liquidity)) return null
  if (hour < MIN_HOUR_VOLUME || liquidity < MIN_LIQUIDITY) return null

  const averageHour = day / 24
  if (averageHour <= 0) return null

  return Math.min(hour / averageHour, MAX_SCORE)
}

/**
 * The pairs that are running hot, fastest first.
 *
 * `exclude` is for stablecoins, which the dashboard filters by symbol. Taken
 * as a predicate rather than importing the check, because this file is pure
 * and `isStablecoin` lives in a service that reaches the network.
 *
 * @param {object[]} pairs
 * @param {{ limit?: number, exclude?: (pair: object) => boolean }} [options]
 * @returns {{ pair: object, score: number }[]}
 */
export function trendingPairs(pairs, { limit = 10, exclude } = {}) {
  if (!Array.isArray(pairs)) return []

  const scored = []

  for (const pair of pairs) {
    if (typeof exclude === 'function' && exclude(pair)) continue

    const score = trendingScore(pair)
    if (score === null) continue

    scored.push({ pair, score })
  }

  /*
   * The pair address is the tiebreak, so a list of pairs at the cap comes back
   * in the same order every time. Without it the top of the list would
   * reshuffle on every refresh among whichever pairs are pinned at MAX_SCORE,
   * which reads as the data being unstable rather than the order being
   * arbitrary.
   */
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      String(a.pair?.pairAddress || '').localeCompare(String(b.pair?.pairAddress || '')),
  )

  return scored.slice(0, Math.max(0, limit))
}

/**
 * The same list, with how much each token is being talked about attached.
 *
 * **Attached, never ranked on.** The order is already decided by the
 * on-chain figures above and this does not touch it. That is the whole design:
 * a reader can see when a token is moving and nobody is discussing it, or
 * being discussed and not moving, and the disagreement between the two is
 * itself the useful signal - which a single blended score would destroy.
 *
 * `messages` is null when there is no room for the token rather than 0, so the
 * interface can say "no room yet" instead of "0 messages", which read the same
 * and mean different things.
 *
 * The map is the one `byToken` in src/utils/talkedAbout.js produces, whose
 * values are `{ count, at }`. The first version of this read `messageCount`,
 * which is the field on a room row before `byToken` folds it - so every count
 * came back as 0 and the surface said nothing was being discussed. The unit
 * test passed because its fixture used the same wrong name. `count` is read
 * with a fallback to `messageCount` so a caller passing raw rooms is not
 * silently wrong in the same way.
 *
 * @param {{ pair: object, score: number }[]} rows from trendingPairs
 * @param {Map<string, { count?: number, messageCount?: number }>} rooms
 *   by token address, as `byToken` returns
 */
export function withMentions(rows, rooms) {
  const lookup = rooms instanceof Map ? rooms : new Map()

  return (rows || []).map((row) => {
    const token = row?.pair?.baseToken?.address
    const room = token ? lookup.get(token.toLowerCase()) : null

    return {
      ...row,
      messages: room ? Number(room.count ?? room.messageCount) || 0 : null,
    }
  })
}

/**
 * The acceleration as a phrase: "4.2× its usual hour".
 *
 * The unit is spelled out because a bare "4.2×" invites being read as a price
 * move, which on this site is the number everybody is looking for and is not
 * what this is.
 *
 * @param {number} score
 */
export function trendingLabel(score) {
  const value = Number(score)
  if (!Number.isFinite(value) || value <= 0) return null

  // At the cap, said as "over" rather than as the cap itself: reporting 20.0
  // exactly, for every pair that hit it, would read as a measurement.
  if (value >= MAX_SCORE) return `over ${MAX_SCORE}× its usual hour`

  return `${value.toFixed(1)}× its usual hour`
}
