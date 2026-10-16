import { FRESH_WALLET_DAYS, walletAgeDays } from './walletAge.js'

/**
 * What order "For you" is in.
 *
 * This file reverses a decision this codebase wrote down, so the argument is
 * here rather than in a commit message.
 *
 * `src/services/discover.js` has said since it was written: "there is no
 * engagement signal worth ranking on yet, and inventing one would be a
 * recommendation nobody asked for dressed up as a discovery feature." That was
 * right when nothing could be reacted to, bookmarked or replied to. All three
 * exist now, so the premise is gone - but the caution underneath it is not,
 * and it is sharper here than on a general social network:
 *
 *   **A feed ranked on engagement, on a site about which tokens to buy, is a
 *   pump amplifier.** Whoever can manufacture reactions gets their token in
 *   front of everybody, and an account here is a wallet address, which is
 *   free. "Most engaged" and "most promoted" are the same list.
 *
 * So the primary signal is not engagement at all. It is **affinity**: what
 * this reader has themselves reacted to, replied to, bookmarked and followed.
 * That cannot be bought, because it is not a score about the post - it is a
 * record of the reader's own behaviour, and the only person who can move it is
 * them. A thousand bought reactions do not make a post rank for somebody who
 * has never engaged with its author.
 *
 * Engagement is in here, as a second term, because affinity answers nothing
 * for somebody who arrived this morning. It is **gated**: only engagement from
 * wallets the chain first saw more than a month ago counts, which is the same
 * floor src/utils/autoHide.js uses and the same economics - the cost of moving
 * this moves from "some clicks" to "some wallets with a month of history
 * each".
 *
 * Three further rules keep it honest:
 *
 * - **The gate is on who engages, never on who posts.** A new account's post
 *   is ranked exactly like anybody else's. Penalising young authors would
 *   entrench whoever arrived first, which is the thing `fetchActiveProfiles`
 *   refuses to do on the discovery page, and it would make this a feed you
 *   have to buy your way into.
 * - **Recency is the spine, not a tiebreak.** On a trading site a day-old post
 *   outranking an hour-old one is wrong whatever its score.
 * - **Every post can say why it is where it is**, and the reader can turn the
 *   whole thing off and have the feed back in time order. A ranking nobody can
 *   inspect or refuse is one they have to take on trust, and this one decides
 *   which claims about money they see first.
 *
 * Pure, and given its signals rather than fetching them, so every branch can
 * be checked without a database.
 */

/**
 * How fast a post stops being news.
 *
 * Six hours, which is deliberately short. The posts here are about what is
 * moving right now; something from yesterday can be excellent and is no longer
 * the thing a reader opened the feed for. A half-life this short also bounds
 * how much any score can do: at a day old a post is down to around 1/16 of its
 * weight, so no amount of engagement keeps it at the top for long.
 */
export const HALF_LIFE_HOURS = 6

/**
 * How old an engager's wallet must be to count toward the shared term.
 *
 * The same line `isFreshWallet` draws and `shouldAutoHide` reuses, imported
 * rather than restated: one threshold, one meaning, one place to change it. An
 * account this app already describes to readers as a "new wallet" is not an
 * account whose reaction should move somebody else's post up the feed.
 */
export const ENGAGER_MIN_DAYS = FRESH_WALLET_DAYS

/**
 * What each kind of affinity is worth.
 *
 * A follow is an explicit, durable statement and is worth the most. A bookmark
 * is next and is arguably stronger evidence - it is private, so nobody saves a
 * post to be seen saving it - but it is rarer, so it would do less work with a
 * higher weight. A reply is engagement with the person; a reaction is the
 * cheapest signal of the four and is weighted accordingly.
 *
 * These are a starting point and are meant to be changed. They are exported so
 * the tests can state what they are rather than hard-coding numbers that
 * silently drift away from the code.
 */
export const AFFINITY_WEIGHTS = {
  follow: 1,
  bookmark: 0.8,
  reply: 0.6,
  reaction: 0.3,
}

/**
 * The most affinity any one author can contribute.
 *
 * Without a cap, somebody who follows one account, reacted to six of its posts
 * and saved two of them gets a feed that is that account and nothing else -
 * which is not a ranked feed, it is an accidental mute of everybody else. The
 * cap is what keeps affinity a thumb on the scale rather than a filter.
 */
export const MAX_AFFINITY = 2

/** How much the gated engagement term can contribute at most, relative to
 *  affinity. Lower, because it is the signal that can be bought - expensively,
 *  but bought - and affinity cannot. */
export const MAX_ENGAGEMENT = 1

/**
 * One author's standing with one reader.
 *
 * Built from the reader's own history and nothing else. Addresses are
 * lowercased because an address arrives from a row in one case and a URL in
 * another, and the two are the same account to everyone except a string
 * compare.
 *
 * @param {object} history
 * @param {Iterable<string>} [history.follows] addresses this reader follows
 * @param {Iterable<string>} [history.bookmarked] authors of posts they saved
 * @param {Iterable<string>} [history.replied] authors they have replied to
 * @param {Iterable<string>} [history.reacted] authors they have reacted to
 * @returns {Map<string, number>} address to affinity, capped
 */
export function affinityMap({ follows, bookmarked, replied, reacted } = {}) {
  const scores = new Map()

  const add = (list, weight) => {
    if (!list) return
    /*
     * Counted once per author per kind, not once per row. Somebody who reacted
     * to forty of one account's posts has told us one thing - that they read
     * that account - and letting it accumulate forty times would make the cap
     * below the only thing doing any work.
     */
    const seen = new Set()
    for (const value of list) {
      const address = typeof value === 'string' ? value.toLowerCase() : null
      if (!address || seen.has(address)) continue
      seen.add(address)
      scores.set(address, (scores.get(address) || 0) + weight)
    }
  }

  add(follows, AFFINITY_WEIGHTS.follow)
  add(bookmarked, AFFINITY_WEIGHTS.bookmark)
  add(replied, AFFINITY_WEIGHTS.reply)
  add(reacted, AFFINITY_WEIGHTS.reaction)

  for (const [address, score] of scores) {
    scores.set(address, Math.min(score, MAX_AFFINITY))
  }

  return scores
}

/**
 * How much weight a post still has, from its age alone.
 *
 * Exponential decay on a six-hour half-life. Clamped at both ends: a post
 * dated in the future is treated as new rather than as infinitely valuable
 * (the timestamps come from the database's clock and `now` from this one), and
 * an unreadable date is treated as old rather than thrown over, because a feed
 * that will not render because one row has a bad timestamp is worse than one
 * row in the wrong place.
 *
 * @param {string|number} createdAt
 * @param {number} now
 * @returns {number} between 0 and 1
 */
export function recencyWeight(createdAt, now = Date.now()) {
  const at = typeof createdAt === 'number' ? createdAt : Date.parse(createdAt)
  if (!Number.isFinite(at)) return 0

  const ageHours = Math.max(0, now - at) / 3_600_000
  return 0.5 ** (ageHours / HALF_LIFE_HOURS)
}

/**
 * How many established accounts engaged with this post.
 *
 * Distinct addresses, and only those whose wallet age is known to clear the
 * floor. An address whose age we have not looked up does **not** count - the
 * same one-sided rule `qualifyingReporters` applies, and for the same reason:
 * treating "we do not know" as "old enough" would make the gate satisfiable by
 * wallets created this morning, which is the whole thing it exists to refuse.
 *
 * The reader's own engagement is excluded. It is already counted, at a higher
 * weight, as affinity - and a post somebody reacted to themselves should not
 * also be boosted for them as though a stranger had.
 *
 * @param {object} post a post with `reactions`
 * @param {Map<string, string|null>} walletAges address to first-seen date
 * @param {object} [options]
 * @param {string|null} [options.viewer] the reader, excluded from the count
 * @param {Iterable<string>} [options.repliers] addresses that replied to it
 * @param {number} [options.now]
 * @returns {number} how many distinct established accounts engaged
 */
export function establishedEngagement(post, walletAges, { viewer, repliers, now = Date.now() } = {}) {
  if (!post) return 0

  const ages = walletAges instanceof Map ? walletAges : new Map()
  const mine = typeof viewer === 'string' ? viewer.toLowerCase() : null

  const counted = new Set()

  const consider = (value) => {
    const address = typeof value === 'string' ? value.toLowerCase() : null
    if (!address || address === mine || counted.has(address)) return

    const days = walletAgeDays(ages.get(address), now)
    // Null is "we have not looked it up", which must not read as "old enough".
    if (days === null || days < ENGAGER_MIN_DAYS) return

    counted.add(address)
  }

  if (Array.isArray(post.reactions)) {
    for (const reaction of post.reactions) consider(reaction?.address)
  }
  if (repliers) {
    for (const address of repliers) consider(address)
  }

  return counted.size
}

/**
 * The score for one post, and why.
 *
 * Returned together on purpose. The reason is what the interface shows, and a
 * score computed in one place and explained in another is two things that
 * drift - the explanation stops matching the order and nobody can tell which
 * of them is lying.
 *
 * The shape is `recency × (1 + affinity + engagement)`. Multiplicative rather
 * than additive, so recency bounds everything: a post with every signal it can
 * have is worth at most four times a bare one of the same age, and at a day
 * old that is still less than a bare post from this hour. A sum would let a
 * well-engaged post from yesterday sit above live ones, which on a feed about
 * what is moving right now is simply wrong.
 *
 * @param {object} post
 * @param {object} signals
 * @param {Map<string, number>} [signals.affinity] from affinityMap
 * @param {Map<string, string|null>} [signals.walletAges]
 * @param {string|null} [signals.viewer]
 * @param {Map<number, string[]>} [signals.repliers] post id to addresses
 * @param {number} [signals.now]
 * @returns {{ score: number, recency: number, affinity: number,
 *   engagement: number, established: number, reason: string|null }}
 */
export function scorePost(post, signals = {}) {
  const { affinity, walletAges, viewer, repliers, now = Date.now() } = signals

  const recency = recencyWeight(post?.createdAt, now)

  const author = typeof post?.address === 'string' ? post.address.toLowerCase() : null
  const affinityScore = author && affinity instanceof Map ? affinity.get(author) || 0 : 0

  const established = establishedEngagement(post, walletAges, {
    viewer,
    repliers: repliers instanceof Map ? repliers.get(post?.id) : undefined,
    now,
  })

  /*
   * Log-scaled, and capped. Twenty established reactions are not twenty times
   * one: the difference between nobody and somebody is the informative part,
   * and past a handful the number says more about how many people were awake
   * than about the post. Without the log a single post with a crowd on it
   * would hold the top of the feed until it decayed out.
   */
  const engagement = Math.min(Math.log2(1 + established) / 2, MAX_ENGAGEMENT)

  return {
    score: recency * (1 + affinityScore + engagement),
    recency,
    affinity: affinityScore,
    engagement,
    established,
    reason: null,
  }
}

/**
 * Why this post is where it is, in words, or null.
 *
 * Null when nothing but time put it there, which is most posts - a label on
 * every row would be noise, and "because it is recent" explains nothing.
 *
 * Affinity is named before engagement because it is the stronger signal and
 * the one the reader can act on: "you follow them" is a fact about a choice
 * they made, and they can unfollow. The engagement phrase deliberately says
 * "established accounts" rather than a count of reactions - the number is the
 * ones that passed the wallet-age floor, and a reader told "12 reactions"
 * would go looking for twelve and find thirty.
 *
 * It never names who engaged. A ranked feed should not become a way of working
 * out who is reading whom.
 *
 * @param {{ affinity: number, established: number }} scored
 * @returns {string|null}
 */
export function rankReason({ affinity = 0, established = 0 } = {}) {
  if (affinity > 0 && established > 1) {
    return 'From somebody you read, and established accounts engaged with it'
  }
  if (affinity > 0) return 'From somebody you read'
  if (established > 1) return `${established} established accounts engaged with it`
  return null
}

/**
 * The feed, in ranked order.
 *
 * Returns new objects rather than mutating, with the scoring attached as
 * `rank`, so a component can draw the reason without recomputing it and a
 * caller can sort back by time without having lost anything.
 *
 * Stable on ties, and that matters more than it sounds: two posts with no
 * signals and the same timestamp must not swap places between renders, which
 * is a feed that visibly shuffles while somebody is reading it. The tiebreak
 * is id descending, which is the order `fetchPostPage` already uses.
 *
 * @param {object[]} posts
 * @param {object} [signals] as scorePost takes
 * @returns {object[]} new array, highest score first
 */
export function rankFeed(posts, signals = {}) {
  if (!Array.isArray(posts)) return []

  const scored = posts.map((post) => {
    const rank = scorePost(post, signals)
    return { ...post, rank: { ...rank, reason: rankReason(rank) } }
  })

  return scored.sort((a, b) => b.rank.score - a.rank.score || b.id - a.id)
}
