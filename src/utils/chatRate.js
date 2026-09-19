/**
 * How often one wallet may post.
 *
 * Separate from the per-IP limiter in api/_lib/guard.js, and not a replacement
 * for it. That one is in-memory, so it is per serverless instance and a spread
 * of requests across cold starts walks around it; it is there to blunt one
 * client hammering one endpoint. This one counts rows in the database, so it
 * holds across every instance, and it counts per address rather than per IP -
 * which is the identity that actually matters here, because posting requires a
 * wallet signature and an address cannot be changed as cheaply as an IP.
 *
 * Pure, and given the timestamps rather than fetching them, so the decision can
 * be tested without a database.
 */

/**
 * Two windows, because they stop different things.
 *
 * The short one stops a burst: a script that posts as fast as the endpoint
 * answers, which is what makes a chat unreadable within seconds. The long one
 * stops the patient version - one message every three seconds, forever, which
 * passes the burst check every time and still amounts to a flood by the end of
 * the afternoon.
 *
 * Both are generous for a person. Five messages in ten seconds is faster than
 * anyone types, and sixty in ten minutes is a conversation nobody would notice
 * being limited.
 */
export const POST_LIMITS = [
  { limit: 5, windowMs: 10_000 },
  { limit: 60, windowMs: 10 * 60_000 },
]

/** The oldest message worth fetching to make this decision. */
export const LONGEST_WINDOW_MS = Math.max(...POST_LIMITS.map((l) => l.windowMs))

/**
 * Has this address posted too much?
 *
 * @param {number[]} timestamps epoch milliseconds of this address's recent posts
 * @param {number} now
 * @param {{limit: number, windowMs: number}[]} [limits]
 * @returns {null | {limit: number, windowMs: number, retryAfterMs: number}}
 *   null when the post is allowed; otherwise the window that refused it and
 *   how long until it would be allowed
 */
export function exceededLimit(timestamps, now, limits = POST_LIMITS) {
  if (!Array.isArray(timestamps)) return null

  /*
   * Anything in the future is treated as now.
   *
   * The timestamps come from the database's clock and `now` from the
   * function's, and the two are not the same clock. A row a few hundred
   * milliseconds "ahead" is ordinary skew, and left alone it produces a
   * negative age, which counts toward every window and gives a retry time in
   * the past - a limit that either never lifts or never applies.
   */
  const ages = timestamps
    .filter((t) => typeof t === 'number' && Number.isFinite(t))
    .map((t) => Math.max(0, now - t))

  for (const { limit, windowMs } of limits) {
    const withinWindow = ages.filter((age) => age < windowMs)
    if (withinWindow.length < limit) continue

    /*
     * When the oldest post that counts falls out of the window, there is room
     * again. Reporting the whole window instead would tell someone who has been
     * quiet for nine of the last ten seconds to wait another ten.
     */
    const oldest = Math.max(...withinWindow)
    return { limit, windowMs, retryAfterMs: Math.max(0, windowMs - oldest) }
  }

  return null
}

/** Seconds, rounded up and never zero - a `Retry-After: 0` invites an
 *  immediate retry, which is the thing being limited. */
export const retryAfterSeconds = (retryAfterMs) => Math.max(1, Math.ceil(retryAfterMs / 1000))
