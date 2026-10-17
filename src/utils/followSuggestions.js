/**
 * Who to suggest following, from what somebody has actually done.
 *
 * `src/services/discover.js` offers "who has been posting", and says why it is
 * recency and not popularity: "a most-followed list on a site this young is a
 * list of whoever arrived first, and putting it on the discovery page is how
 * that becomes permanent." That stands, and this does not replace it - a list
 * of who is here is what a new account needs, and nothing below can help
 * somebody with no history at all.
 *
 * What this adds is the other case: somebody who has been reading for a while,
 * whose behaviour says plainly who they are interested in, and who is still
 * being shown a list of recent posters as though they had just arrived.
 *
 * Two signals, both of them about the reader rather than about the candidate:
 *
 * - **Read but not followed.** They reacted to, replied to or saved somebody's
 *   posts and never followed them. This is the strongest suggestion a site can
 *   make, because it is not a prediction - it is pointing out something the
 *   reader has already demonstrated and simply not acted on.
 * - **Followed by people they follow.** The follow graph one step out. Weaker,
 *   and deliberately second: it is a guess, and it is the signal that in
 *   aggregate turns a young network into a clique around whoever arrived
 *   first - so it is capped and never outranks the first.
 *
 * Neither is a popularity count. A candidate's own follower total is not read
 * at all, which is the point: "lots of people follow them" is exactly the
 * signal that makes early accounts permanent, and it says nothing about
 * whether this reader would want to.
 *
 * Pure, and given its signals rather than fetching them.
 */

/** What each signal is worth. Read-but-not-followed leads by enough that no
 *  amount of graph overlap overtakes it - see MAX_OVERLAP. */
export const SUGGESTION_WEIGHTS = {
  bookmarked: 1.2,
  replied: 1,
  reacted: 0.6,
  /** Per person-you-follow who also follows them. */
  overlap: 0.25,
}

/**
 * The most the follow graph can contribute.
 *
 * Capped below the weakest direct signal on purpose. Somebody followed by
 * twenty of your followees is a strong hint and still a guess; somebody whose
 * posts you have reacted to is a fact. If the graph could outrank the fact,
 * this would be a list of the best-connected accounts wearing a personalised
 * label.
 */
export const MAX_OVERLAP = 0.5

/**
 * Suggestions, best first.
 *
 * @param {object} signals
 * @param {{ bookmarked?: string[], replied?: string[], reacted?: string[] }} [signals.affinity]
 *   the reader's own history, as api/_routes/me/affinity.js returns it
 * @param {Map<string, number>|object} [signals.overlap] candidate address to
 *   how many of the reader's followees follow them
 * @param {Iterable<string>} [signals.following] who they already follow
 * @param {Iterable<string>} [signals.muted] who they have chosen not to see
 * @param {string|null} [signals.viewer] the reader, who is never suggested
 * @param {number} [signals.limit]
 * @returns {{ address: string, score: number, reason: string }[]}
 */
export function followSuggestions({
  affinity = {},
  overlap = null,
  following = null,
  muted = null,
  viewer = null,
  limit = 10,
} = {}) {
  const lower = (value) => (typeof value === 'string' && value ? value.toLowerCase() : null)

  /*
   * Everybody who must not be suggested, in one set.
   *
   * The reader themselves, anyone they already follow, and anyone they have
   * muted. The last one is the one worth being explicit about: suggesting an
   * account somebody has deliberately silenced is the worst thing a
   * recommendation can do - it tells them the mute did not take, and it is
   * also the one case where the reader has said something unambiguous.
   */
  const excluded = new Set()
  const exclude = (list) => {
    for (const value of list || []) {
      const address = lower(value)
      if (address) excluded.add(address)
    }
  }
  exclude(following)
  exclude(muted)
  if (lower(viewer)) excluded.add(lower(viewer))

  /** address -> { score, reasons } */
  const candidates = new Map()

  const consider = (address, weight, kind) => {
    if (!address || excluded.has(address)) return

    const held = candidates.get(address) || { score: 0, kinds: new Set() }
    held.score += weight
    held.kinds.add(kind)
    candidates.set(address, held)
  }

  /*
   * The direct signals, each counted once per candidate however many rows name
   * them - the same rule `affinityMap` applies, and for the same reason:
   * reacting to forty of somebody's posts says one thing about the reader, and
   * letting it accumulate would make this a list of one account.
   */
  for (const kind of ['bookmarked', 'replied', 'reacted']) {
    for (const value of new Set(affinity?.[kind] || [])) {
      consider(lower(value), SUGGESTION_WEIGHTS[kind], kind)
    }
  }

  // And the graph, capped.
  const overlapEntries = overlap instanceof Map ? overlap : new Map(Object.entries(overlap || {}))
  for (const [value, count] of overlapEntries) {
    const shared = Number(count)
    if (!Number.isFinite(shared) || shared <= 0) continue
    consider(lower(value), Math.min(shared * SUGGESTION_WEIGHTS.overlap, MAX_OVERLAP), 'overlap')
  }

  return [...candidates.entries()]
    .map(([address, held]) => ({
      address,
      score: held.score,
      reason: suggestionReason(held.kinds, overlapEntries.get(address)),
    }))
    /*
     * Address as the tiebreak, so a list of candidates with identical scores
     * is the same list on every render. Without it two accounts the reader has
     * reacted to once each would swap places whenever anything re-rendered,
     * which reads as a list being shuffled at them.
     */
    .sort((a, b) => b.score - a.score || a.address.localeCompare(b.address))
    .slice(0, Math.max(0, limit))
}

/**
 * Why somebody is being suggested, in words.
 *
 * Always a sentence, never null - the opposite of `rankReason` in
 * feedRank.js, and the difference is what the two are for. A post in a feed
 * mostly needs no explanation because time put it there. A suggestion is the
 * site telling somebody to do something, and one that cannot say why is one
 * nobody should act on.
 *
 * The strongest kind wins the sentence rather than listing all of them. "You
 * saved their posts, replied to them and 3 people you follow follow them" is
 * three facts where one would do.
 *
 * The overlap count is named but the people are not. Who follows whom is
 * public here, so naming them would leak nothing - but a suggestion that
 * names your friends is social pressure rather than information.
 *
 * @param {Set<string>} kinds
 * @param {number} [shared]
 */
export function suggestionReason(kinds, shared) {
  const has = (kind) => kinds instanceof Set && kinds.has(kind)

  if (has('bookmarked')) return 'You saved their posts'
  if (has('replied')) return 'You have replied to them'
  if (has('reacted')) return 'You reacted to their posts'

  const count = Number(shared)
  if (Number.isFinite(count) && count > 0) {
    return count === 1
      ? 'Followed by somebody you follow'
      : `Followed by ${count} people you follow`
  }

  // Unreachable through followSuggestions, which only builds a candidate from
  // one of the above. Here so the function is total rather than mostly total.
  return 'Posting on PulseDex'
}
