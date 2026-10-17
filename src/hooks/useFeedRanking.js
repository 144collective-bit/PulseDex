import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAffinity, fetchWalletAges } from '../services/feedSignals'
import { affinityMap, rankFeed } from '../utils/feedRank'
import { useSiweAuth } from '../context/SiweAuthContext'

/** Where the reader's choice of order is remembered. Per browser, because it
 *  is a preference about how to read rather than a fact about the account. */
const STORAGE_KEY = 'pulsedex:feed-order'

/**
 * Whether the feed is ranked, and if so in what order.
 *
 * The ranking itself is src/utils/feedRank.js, which is pure and argues the
 * design at length. This is the part that cannot be pure: fetching the
 * reader's own history, looking up wallet ages for whoever engaged, and
 * remembering whether they wanted any of it.
 *
 * **Chronological is one press away and the choice is remembered.** That is
 * not a courtesy, it is the thing that makes ranking defensible here: this
 * order decides which claims about money somebody sees first, and a reader who
 * cannot refuse it has to take it on trust.
 *
 * Signed out means chronological, always. Affinity is the primary signal and a
 * signed-out reader has none, so what is left would be engagement and
 * recency - a feed ordered by what strangers reacted to, which is the pump
 * amplifier this design exists to avoid. Recency is the honest default for
 * somebody we know nothing about.
 */
export function useFeedRanking(posts) {
  const { account } = useSiweAuth()

  /*
   * Read once, during the first render, rather than in an effect.
   *
   * An effect would mean the feed draws in one order and then reorders itself
   * a frame later, which looks like a bug and loses the reader's place. The
   * accessor is wrapped because it throws in a private window and comes back
   * empty with site data blocked - and this must render correctly either way.
   */
  const [ranked, setRanked] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== 'time'
    } catch {
      return true
    }
  })

  const [affinity, setAffinity] = useState(null)
  const [walletAges, setWalletAges] = useState(() => new Map())

  /*
   * The clock the ranking is computed against, held in state rather than read
   * during render.
   *
   * `Date.now()` inside the memo below was the first version and was a bug:
   * the memo would recompute with a different `now` on any unrelated
   * re-render - a reaction landing, a bookmark toggling - and two posts whose
   * scores are close would swap places while somebody was reading. That is the
   * same instability `rankFeed`'s tie-break exists to prevent, one level up,
   * and it is worse here because it is invisible in a diff.
   *
   * Refreshed on a timer instead, so decay still moves. Two minutes is far
   * finer than a six-hour half-life needs and coarse enough that the order
   * holds still while somebody reads.
   */
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 120_000)
    return () => clearInterval(timer)
  }, [])

  const choose = useCallback((next) => {
    setRanked(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'ranked' : 'time')
    } catch {
      // A reader whose browser refuses storage gets their choice for this
      // session and not the next. Worth nothing to handle further.
    }
  }, [])

  useEffect(() => {
    if (!account || !ranked) {
      // Cleared, so one account's reading history never orders another's feed.
      setAffinity(null)
      return undefined
    }

    let alive = true
    fetchAffinity().then((history) => {
      if (alive) setAffinity(affinityMap(history))
    })

    return () => {
      alive = false
    }
  }, [account, ranked])

  /*
   * Every address that reacted to anything on screen.
   *
   * Derived from the posts rather than fetched, because the feed already has
   * them - POST_FIELDS embeds `post_reactions ( emoji, address )`. What it
   * does not have is their wallet ages, which is the one lookup the gated
   * engagement term needs.
   */
  const reactorKey = useMemo(() => {
    if (!ranked || !Array.isArray(posts)) return ''

    const addresses = new Set()
    for (const post of posts) {
      for (const reaction of post?.reactions || []) {
        if (reaction?.address) addresses.add(reaction.address.toLowerCase())
      }
    }

    /*
     * A sorted joined string rather than the Set itself. A Set is a new object
     * every render, so depending on it would refetch wallet ages continuously;
     * sorted, so the same addresses in a different order are one key.
     */
    return [...addresses].sort().join(',')
  }, [posts, ranked])

  useEffect(() => {
    if (!reactorKey) {
      setWalletAges(new Map())
      return undefined
    }

    let alive = true
    fetchWalletAges(reactorKey.split(',')).then((ages) => {
      if (alive) setWalletAges(ages)
    })

    return () => {
      alive = false
    }
  }, [reactorKey])

  /*
   * The ordered list.
   *
   * Returned unranked until the affinity fetch answers, rather than ranked on
   * a partial signal. The difference is visible: ranking on recency and
   * engagement alone, for one second, puts whatever strangers reacted to at
   * the top and then rearranges it - which is both the wrong order and the
   * jump this hook reads localStorage synchronously to avoid.
   */
  const ordered = useMemo(() => {
    if (!ranked || !account || affinity === null) return posts
    return rankFeed(posts, { affinity, walletAges, viewer: account, now })
  }, [posts, ranked, account, affinity, walletAges, now])

  return {
    posts: ordered,
    /*
     * What the reader asked for, which is what the control reflects.
     *
     * Separate from `ranked` below, and the distinction was a bug before it
     * was a distinction: the switch used to toggle the derived state, so
     * pressing it while the history was still loading computed
     * `choose(!false)` - setting a preference that was already true - and
     * visibly did nothing. A control has to act on the thing it controls.
     */
    prefers: Boolean(ranked),
    /*
     * Whether ranking is on AND doing anything right now. Signed out, or
     * before the history lands, this is false and the feed is in time order -
     * which is what decides whether to draw a post's reason, because a reason
     * on a chronologically ordered feed would be a claim it is not making.
     */
    ranked: Boolean(ranked && account && affinity !== null),
    /** Whether to offer the switch at all. Nothing to offer when signed out:
     *  there is no history to rank on. */
    canRank: Boolean(account),
    choose,
  }
}
