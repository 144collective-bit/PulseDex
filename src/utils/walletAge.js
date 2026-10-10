/**
 * How long an address has existed, and how to say it.
 *
 * The one piece of on-chain identity shown on every profile by default. The
 * reasoning is in 0019_profile_depth.sql and worth repeating here, because
 * this is the file somebody edits when they want to show more: a date is not a
 * balance. "First seen March 2024" tells a reader nothing about what an
 * account holds or did, and it is the single most useful thing to know about a
 * stranger recommending a token - because the wallet that was created this
 * morning is the one about to take their money.
 *
 * Pure, and separate from the lookup that fetches it (api/_lib/walletAge.js),
 * for the usual reason: the parsing is the part that gets a malformed payload
 * and has to not throw, and that can be checked without a network.
 */

/**
 * Below this, an account is new enough that saying so is the point.
 *
 * Thirty days. Not tuned - chosen because it is the shortest span a person
 * would describe as "a while", and because a scam wallet's useful life is
 * measured in days. What matters is that there is a threshold at all, so the
 * page can distinguish "new" from "not old" rather than leaving a reader to
 * do arithmetic on a date.
 */
export const FRESH_WALLET_DAYS = 30

/** Seconds since the epoch that could plausibly be a PulseChain timestamp.
 *  The chain launched in May 2023; anything before 2015 is some other
 *  number that happens to be in this field. */
const EARLIEST_PLAUSIBLE = 1_420_070_400 // 2015-01-01

/**
 * The first transaction's timestamp, out of a Blockscout `txlist` response.
 *
 * Blockscout's v1 compatibility API answers `{ status, message, result }` and
 * uses `status: "0"` for both "no transactions" and "something went wrong",
 * with the difference only in `message`. Both are treated the same here and
 * that is correct: neither is a date, and an address we cannot date is one the
 * page says nothing about.
 *
 * Asked for with `sort=asc&page=1&offset=1`, so `result` holds the earliest
 * transaction and nothing else - but the first row is taken rather than
 * assuming the array has exactly one, because a parser that depends on a
 * query parameter staying right is a parser that breaks when somebody tunes
 * the query.
 *
 * @param {unknown} payload whatever the explorer returned, already JSON
 * @returns {string|null} an ISO timestamp, or null
 */
export function readFirstSeen(payload) {
  const rows = payload && typeof payload === 'object' ? payload.result : null
  if (!Array.isArray(rows) || rows.length === 0) return null

  const first = rows[0]
  if (!first || typeof first !== 'object') return null

  // A string from this API, a number from some forks of it. Both are accepted
  // because the field is the same field either way.
  const seconds = Number(first.timeStamp ?? first.timestamp)
  if (!Number.isFinite(seconds) || seconds < EARLIEST_PLAUSIBLE) return null

  /*
   * A timestamp in the future is refused rather than clamped.
   *
   * It can only mean the field was not what we think it is - a block number,
   * milliseconds, a misread - and "first seen in 2065" on a profile is worse
   * than saying nothing. Clamping to now would be worse still: it would read
   * as a brand new wallet, which is the one claim this value is used to make.
   */
  const at = new Date(seconds * 1000)
  if (at.getTime() > Date.now()) return null

  return at.toISOString()
}

/**
 * How many whole days old, or null if we do not know.
 *
 * @param {unknown} iso
 * @param {number} [now] milliseconds, injectable so the tests are not about
 *   what day it is
 */
export function walletAgeDays(iso, now = Date.now()) {
  if (typeof iso !== 'string') return null

  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null

  const days = Math.floor((now - at) / 86_400_000)
  // A negative age is a clock disagreement, not a fact about the wallet.
  return days < 0 ? 0 : days
}

/**
 * The line a profile shows: "First seen March 2024".
 *
 * A month and a year, never a day and never "11 months ago". The exact date
 * goes on the tooltip for anybody who wants it - the same choice the Joined
 * line makes, and for the same reason: on the page this is read as a rough
 * vintage, which is the question being asked.
 *
 * Null when there is nothing to say, and the caller draws nothing. An absent
 * value here means we have not looked it up or could not, which is not the
 * same as the wallet being new - so it must never render as a date.
 *
 * @param {unknown} iso
 * @returns {string|null}
 */
export function walletAgeLabel(iso) {
  if (typeof iso !== 'string') return null

  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null

  const when = new Date(at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  return `First seen ${when}`
}

/**
 * Is this wallet new enough that a reader should be told so plainly?
 *
 * Deliberately one-sided. True means "say this is new"; false means "say
 * nothing extra", and that includes the case where we have no date at all.
 * An unknown age must never read as an old one - this app's whole exposure is
 * somebody trusting an account they should not have.
 *
 * @param {unknown} iso
 * @param {number} [now]
 */
export function isFreshWallet(iso, now = Date.now()) {
  const days = walletAgeDays(iso, now)
  return days !== null && days < FRESH_WALLET_DAYS
}
