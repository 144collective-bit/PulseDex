/**
 * How much of their own posting allowance an account has used.
 *
 * `chatRate.js` answers "is this one refused", which is what an endpoint needs.
 * This answers "how am I doing", which is what a person needs, and they are
 * not the same question: the limiter only ever speaks when it says no, so
 * until now the first an account knew about a limit was being stopped by it
 * mid-sentence with a number it had never seen.
 *
 * The roadmap asked for "per-account rate limits the account can actually
 * see". Seeing them is the whole feature - the limits themselves have existed
 * since the chat shipped.
 *
 * Pure, and given the timestamps rather than fetching them, like the limiter
 * it reports on.
 */

/**
 * One window's worth of usage.
 *
 * `used` counts posts inside the window, which is the same arithmetic
 * `exceededLimit` does - deliberately recomputed here rather than shared,
 * because that function returns only the window that refused and this one
 * needs every window whether it refused or not.
 *
 * `resetsInMs` is when the oldest post inside the window falls out of it,
 * which is when there is room again. Zero when there is already room: a
 * countdown on a limit nobody is near is a timer that invites being watched.
 *
 * @param {number[]} timestamps epoch milliseconds
 * @param {{ limit: number, windowMs: number }} window
 * @param {number} now
 */
function usageFor(timestamps, { limit, windowMs }, now) {
  const inWindow = timestamps.filter((at) => now - at < windowMs)
  const used = inWindow.length

  /*
   * The oldest one still counting decides when room opens up. Reporting the
   * whole window instead would tell somebody who has been quiet for nine of
   * the last ten minutes to wait another ten.
   */
  const oldest = inWindow.length > 0 ? Math.min(...inWindow) : null
  const resetsInMs = used >= limit && oldest !== null ? Math.max(0, windowMs - (now - oldest)) : 0

  return { limit, windowMs, used, left: Math.max(0, limit - used), resetsInMs }
}

/**
 * Every window, with usage against each.
 *
 * All of them rather than the tightest, because which one is binding changes:
 * somebody writing three posts quickly is held by the per-minute window and
 * somebody writing twenty over an afternoon by the per-hour one, and a
 * display that only ever showed one of them would be wrong half the time.
 *
 * @param {unknown} timestamps epoch milliseconds of this account's recent posts
 * @param {{ limit: number, windowMs: number }[]} limits
 * @param {number} [now]
 */
export function rateUsage(timestamps, limits, now = Date.now()) {
  const clean = Array.isArray(timestamps)
    ? timestamps
        .map((at) => (typeof at === 'number' ? at : Date.parse(at)))
        .filter((at) => Number.isFinite(at))
        /*
         * Anything in the future is clamped to now, the same correction
         * `exceededLimit` makes: the timestamps come from the database's clock
         * and `now` from this one, and an age that comes out negative counts
         * toward every window and produces a reset time in the past.
         */
        .map((at) => Math.min(at, now))
    : []

  const windows = (Array.isArray(limits) ? limits : []).map((window) =>
    usageFor(clean, window, now),
  )

  return {
    windows,
    /** The window closest to refusing, which is what a single line reports. */
    tightest: windows.reduce(
      (worst, window) =>
        !worst || window.left < worst.left || (window.left === worst.left && window.windowMs < worst.windowMs)
          ? window
          : worst,
      null,
    ),
    /** Whether anything would refuse a post right now. */
    blocked: windows.some((window) => window.left === 0),
  }
}

/**
 * A window as a phrase: "3 of 20 an hour".
 *
 * Units a person uses, not milliseconds. The windows in this app are seconds,
 * minutes and hours, and anything else falls back to minutes rather than
 * inventing a unit - a limit described in a unit nobody recognises is a limit
 * nobody reads.
 *
 * @param {{ limit: number, windowMs: number, used: number }} window
 */
export function usageLabel(window) {
  if (!window) return null
  const { limit, windowMs, used } = window

  const per =
    windowMs >= 3_600_000
      ? perUnit(windowMs / 3_600_000, 'hour')
      : windowMs >= 60_000
        ? perUnit(windowMs / 60_000, 'minute')
        : perUnit(windowMs / 1000, 'second')

  return `${used} of ${limit} ${per}`
}

/*
 * "a hour" is the kind of thing nobody writes and every template produces.
 *
 * The article is listed per unit rather than tested for a leading vowel,
 * because the rule is about sound and not spelling: "hour" begins with a
 * consonant letter and takes "an" anyway. Three units, so three entries beats
 * a regex that is wrong about one of them.
 */
const ARTICLES = { second: 'a', minute: 'a', hour: 'an' }

const perUnit = (count, unit) => {
  const rounded = Math.round(count)
  return rounded === 1 ? `${ARTICLES[unit] ?? 'a'} ${unit}` : `per ${rounded} ${unit}s`
}

/**
 * How long until there is room, in words: "try again in 40s".
 *
 * Null when there is room now, so the caller draws nothing. Seconds under two
 * minutes and minutes above, because "try again in 312 seconds" is arithmetic
 * somebody has to do.
 *
 * @param {number} resetsInMs
 */
export function resetLabel(resetsInMs) {
  const ms = Number(resetsInMs)
  if (!Number.isFinite(ms) || ms <= 0) return null

  const seconds = Math.ceil(ms / 1000)
  if (seconds < 120) return `${seconds}s`
  return `${Math.ceil(seconds / 60)}m`
}
