import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'

/**
 * Who this reader actually reads.
 *
 * The signal "For you" is ranked on. Four lists of addresses, all of them
 * derived from this account's own behaviour: who it follows, whose posts it
 * saved, who it replied to, who it reacted to. src/utils/feedRank.js turns
 * them into weights and says at length why they are the primary signal rather
 * than engagement:
 *
 *   A feed ranked on engagement, on a site about which tokens to buy, is a
 *   pump amplifier. Affinity cannot be bought, because it is not a score about
 *   the post - it is a record of the reader's own behaviour, and the only
 *   person who can move it is them.
 *
 * One endpoint rather than four queries from the browser, for two reasons. The
 * smaller one is that it is one request where the feed would otherwise make
 * four before it could draw anything. The larger one is `post_bookmarks`,
 * which has no read policy for any browser-facing role - see 0020 - so the
 * saved list cannot be read from the browser at all.
 *
 * **It returns addresses and not posts.** A bookmark is private, and the
 * private part is *which posts* somebody saved. Who they tend to save from is
 * a weaker fact and the only one ranking needs, so that is all this sends.
 * Nothing here lets the browser reconstruct the saved list.
 *
 * This account only. `address` comes from the cookie and is never read from
 * the request, so there is no version of this route that reports on somebody
 * else - which matters: "who do you read" is a more revealing question than
 * "who do you follow", because the follow is public and the rest is not.
 */
export default async function handler(req, res) {
  /*
   * `no-store`. This is one person's reading history, and a shared cache
   * holding it under a URL with no account in it would hand one reader's
   * affinity to the next - which would also silently rank their feed on
   * somebody else's taste.
   */
  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let address = null
  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    address = session?.sub || null
  } catch {
    address = null
  }

  /*
   * 200 with empty lists rather than 401, which is the one place this differs
   * from every other private route here. A signed-out reader has no affinity,
   * which is an answer; and the feed asks for this before it knows whether
   * anybody is signed in, so a 401 would be an error logged on every cold
   * load by somebody who simply has not signed in.
   */
  if (!address) return res.status(200).json(EMPTY)

  const db = serviceClient()
  if (!db) return res.status(200).json(EMPTY)

  /*
   * How far back to look. Ninety days, which is long enough that somebody's
   * taste is represented and short enough that an account they stopped reading
   * six months ago stops ranking - affinity should describe what somebody
   * reads now, not what they once read.
   */
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()

  try {
    const [follows, bookmarks, replies, reactions] = await Promise.all([
      db.from('follows').select('followee').eq('follower', address).limit(LIMIT),

      /*
       * The authors of saved posts, through the embed rather than two queries.
       * The post ids come back too and are deliberately dropped below: what
       * ranking needs is who, and the private part of a bookmark is which.
       */
      db
        .from('post_bookmarks')
        .select('posts ( address )')
        .eq('address', address)
        .limit(LIMIT),

      /*
       * This account's own replies - the ids they answer, not the authors.
       *
       * Two queries rather than the obvious embed, and the reason is worth
       * writing down because the embed looks fine and is a trap.
       * `parent:posts!posts_parent_id_fkey ( address )` would need that
       * constraint to exist, and 0008 declared it as
       * `add column if not exists parent_id bigint references ...` - ONE
       * statement, skipped whole on a database where the column already
       * existed, taking the constraint with it silently. That is precisely
       * what 0012 did to `messages.reply_to` and what 0017 exists to repair.
       *
       * Nothing in this app has ever used that relationship, so nobody has
       * found out whether it survived. 0022 repairs it properly; this route
       * deliberately does not depend on the repair having been run, because
       * what it would cost is the feed's ordering, for everybody, on a
       * deployment that is otherwise fine.
       */
      db
        .from('posts')
        .select('parent_id')
        .eq('address', address)
        .not('parent_id', 'is', null)
        .is('deleted_at', null)
        .gte('created_at', since)
        .limit(LIMIT),

      db
        .from('post_reactions')
        .select('posts ( address )')
        .eq('address', address)
        .gte('created_at', since)
        .limit(LIMIT),
    ])

    /*
     * The authors of the posts those replies answer, in one more query.
     *
     * After the others rather than beside them, because it needs their result.
     * One extra round trip inside an endpoint, which is the price of not
     * depending on a constraint name nobody has verified - see above.
     */
    let repliedTo = { data: [], error: null }
    const parentIds = [...new Set((replies.data || []).map((row) => row.parent_id).filter(Boolean))]

    if (!replies.error && parentIds.length > 0) {
      repliedTo = await db.from('posts').select('address').in('id', parentIds.slice(0, LIMIT))
    }

    const failed = [follows, bookmarks, replies, reactions, repliedTo].find((r) => r.error)
    if (failed) {
      /*
       * Answered as empty rather than as a failure, and the direction is the
       * point: with no affinity the feed falls back to recency, which is where
       * it was before this existed. A 503 here would mean a feed that will not
       * load because its ordering could not be personalised.
       */
      console.error('affinity: read failed:', failed.error.message)
      return res.status(200).json(EMPTY)
    }

    return res.status(200).json({
      follows: addresses(follows.data, (row) => row.followee),
      bookmarked: addresses(bookmarks.data, (row) => row.posts?.address),
      replied: addresses(repliedTo.data, (row) => row.address),
      reacted: addresses(reactions.data, (row) => row.posts?.address),
    })
  } catch (err) {
    console.error('affinity: read failed:', err.message)
    return res.status(200).json(EMPTY)
  }
}

/** What a reader with no history gets, and what every failure answers. */
const EMPTY = { follows: [], bookmarked: [], replied: [], reacted: [] }

/**
 * How many rows of each kind to read.
 *
 * Bounded because this runs inside a request somebody is waiting on, and
 * because `affinityMap` counts one author once however many rows name them -
 * so the five hundredth reaction to the same account changes nothing. Somebody
 * past this limit has a feed ranked on their most recent few hundred actions,
 * which is what "what they read now" means anyway.
 */
const LIMIT = 500

/** Distinct, lowercased, nothing unreadable. One pass rather than four copies
 *  of the same three lines. */
const addresses = (rows, pick) => [
  ...new Set(
    (rows || [])
      .map((row) => pick(row))
      .filter((value) => typeof value === 'string' && value)
      .map((value) => value.toLowerCase()),
  ),
]
