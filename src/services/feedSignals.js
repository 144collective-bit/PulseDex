import { supabase, hasSupabase } from '../config/supabase'

/**
 * What "For you" needs in order to be in an order.
 *
 * Two different things, fetched two different ways, and the split is the
 * security model rather than an accident.
 *
 * **Affinity** - who this reader reads - comes from our own endpoint, because
 * part of it is `post_bookmarks`, which has no read policy for any
 * browser-facing role. See api/_routes/me/affinity.js, which also says why it
 * returns addresses and never the saved posts themselves.
 *
 * **Wallet ages** come straight from Supabase over the anon key, because
 * `profiles.first_seen_at` is public - it is already drawn on every profile
 * page as "first seen". There is nothing to protect and an endpoint would only
 * add a hop.
 */

/**
 * The reader's own reading history, as four lists of addresses.
 *
 * Never throws and never writes to the console. Both are deliberate, and the
 * second one was a bug in Batch 5 before it was a rule here: a page load has
 * to be console-clean, because scripts/smoke-browser.mjs treats any console
 * error during a load as a failed surface - and a 200 from this origin is not
 * a promise of JSON, since a deployment with no API answers every request with
 * index.html.
 *
 * Empty lists on any failure, which is the safe direction: with no affinity
 * the ranking falls back to recency and the feed is where it was before any of
 * this existed. The alternative - a feed that will not load because its
 * ordering could not be personalised - is worse than an unpersonalised feed.
 */
export async function fetchAffinity() {
  const empty = { follows: [], bookmarked: [], replied: [], reacted: [] }

  try {
    const res = await fetch('/api/me/affinity', { credentials: 'same-origin' })
    if (!res.ok) return empty

    const payload = await res.json()
    const list = (value) => (Array.isArray(value) ? value : [])

    return {
      follows: list(payload.follows),
      bookmarked: list(payload.bookmarked),
      replied: list(payload.replied),
      reacted: list(payload.reacted),
    }
  } catch {
    return empty
  }
}

/**
 * When the chain first saw each of these addresses.
 *
 * Needed because the gated engagement term counts only established accounts,
 * and what the feed has to hand is reactor addresses with no ages attached.
 * One query for the whole page rather than one per address, which is the
 * lesson every list in this app has already paid for.
 *
 * **Most of these will come back null, and that is the honest cold state.**
 * `first_seen_at` is filled in lazily by api/_routes/profile/first-seen.js
 * when somebody opens a profile, so on a young deployment almost nobody's age
 * is known. `establishedEngagement` treats unknown as not established, so the
 * engagement term is simply inert until ages accumulate - the feed is ranked
 * on affinity and recency alone. That fails toward the order this feed had
 * before ranking existed, which is the right direction to fail in.
 *
 * Returns a Map, including the nulls: the difference between "we looked and do
 * not know" and "we have not looked" is not one this function keeps, because
 * `establishedEngagement` treats them identically and deliberately.
 *
 * @param {Iterable<string>} addresses
 * @returns {Promise<Map<string, string|null>>}
 */
export async function fetchWalletAges(addresses) {
  const wanted = [
    ...new Set(
      [...(addresses || [])]
        .filter((value) => typeof value === 'string' && value)
        .map((value) => value.toLowerCase()),
    ),
  ]

  if (!hasSupabase || wanted.length === 0) return new Map()

  /*
   * Bounded, because this is built from whatever is on screen and a feed of
   * fifty well-reacted posts could name hundreds of addresses. Two hundred is
   * more than a page of posts produces in practice and keeps the URL inside
   * what PostgREST will accept - a request too long to send fails as a
   * network error, which would read as the database being down.
   */
  const { data, error } = await supabase
    .from('profiles')
    .select('address, first_seen_at')
    .in('address', wanted.slice(0, 200))

  // Swallowed into an empty map rather than thrown. This decorates an ordering
  // that works without it; losing it drops the engagement term to zero.
  if (error) return new Map()

  return new Map((data || []).map((row) => [row.address, row.first_seen_at || null]))
}
