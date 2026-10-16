import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { FEED_POST_LIMITS, POST_LIMITS, longestWindowMs } from '../../../src/utils/chatRate.js'

/**
 * How much of their own posting allowance this account has used.
 *
 * The limits have existed since the chat shipped and have never been visible.
 * The limiter only speaks when it refuses, so the first anybody knew about a
 * limit was being stopped mid-sentence by a number they had never seen - which
 * reads as the site being broken rather than as a rule being applied. The
 * roadmap asked for "per-account rate limits the account can actually see";
 * seeing them is the whole feature.
 *
 * This account only. `address` comes from the cookie and is never read from
 * the request, so there is no version of this route that reports on somebody
 * else - which matters more than it looks: posting times are a record of when
 * an account is awake.
 *
 * The arithmetic is in src/utils/rateUsage.js, tested without a database. This
 * is the part that cannot be: two counts, bounded by the longest window either
 * set cares about.
 */
export default async function handler(req, res) {
  // One person's posting history. A shared cache holding it under a URL with
  // no account in it would report one account's usage to the next.
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

  if (!address) return res.status(401).json({ error: 'Sign in first.' })

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'This is not configured on this deployment.' })

  /*
   * Timestamps only, and only back as far as the longest window. The limiter
   * cannot be influenced by anything older, so reading more would be weight on
   * a request somebody is waiting on - and a count of rows would not do,
   * because every window needs to know which of them fall inside it.
   */
  const since = (limits) => new Date(Date.now() - longestWindowMs(limits)).toISOString()

  const [posts, messages] = await Promise.all([
    db
      .from('posts')
      .select('created_at')
      .eq('address', address)
      .gte('created_at', since(FEED_POST_LIMITS))
      /*
       * Removed posts still count, and this is the one judgement call in the
       * file. A post that was published and then taken down was still a post:
       * excluding it would make deleting your own posts a way of resetting the
       * limit, which is a trivial loop for anything automated.
       */
      .limit(200),
    db
      .from('messages')
      .select('created_at')
      .eq('address', address)
      .gte('created_at', since(POST_LIMITS))
      .limit(200),
  ])

  if (posts.error || messages.error) {
    console.error('limits: read failed:', (posts.error || messages.error).message)
    return res.status(503).json({ error: 'Your limits could not be loaded.' })
  }

  /*
   * Epoch milliseconds, not ISO strings. `rateUsage` reads either - it has a
   * test for the string case precisely because a row holds one - but sending
   * numbers means the browser does not re-parse the same timestamps on every
   * keystroke in the composer.
   */
  const at = (rows) => (rows || []).map((row) => Date.parse(row.created_at)).filter(Number.isFinite)

  return res.status(200).json({
    posts: at(posts.data),
    messages: at(messages.data),
    /*
     * The limits themselves ride along rather than being imported by the
     * browser, although the browser could import them. It means the numbers a
     * person is shown are the numbers the deployment they are talking to
     * actually enforces - a bundle cached from before a limit changed would
     * otherwise display the old one confidently.
     */
    limits: { posts: FEED_POST_LIMITS, messages: POST_LIMITS },
  })
}
