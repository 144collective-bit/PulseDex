// Extension spelled out, because this file is read by api/_lib/moderation.js
// and so loads under Node's ESM resolver as well as Vite's. Vite fills in a
// missing `.js`; Node refuses outright, which is a deployment that boots and
// then 500s on the first report. Every other util api/ imports does the same.
import { FRESH_WALLET_DAYS, walletAgeDays } from './walletAge.js'

/**
 * When reports are enough to take a post out of the feed pending review.
 *
 * This file is the reversal of a decision recorded in an earlier batch, and
 * the argument is worth having in front of whoever changes the numbers.
 *
 * `api/_routes/posts/report.js` said, when reporting was built: "an endpoint
 * that hid a post at some threshold of reports would be a brigading tool
 * wearing a safety feature's name." That is true of a plain count, and it is
 * why this is not one. A count of reports measures how many people disliked a
 * post, and on a site about which tokens to buy, "several people dislike this"
 * is the ordinary condition of anything worth saying.
 *
 * So the gate is not how many reports but **who**: distinct accounts whose
 * wallets the chain first saw more than a month ago. That is not
 * unforgeable - somebody with four aged wallets can still arrange a hide - but
 * it moves the cost from "four clicks" to "four wallets with a month of
 * history each", and makes the cheap version of the attack stop working.
 *
 * Three further things keep the mistake cheap when it happens:
 *
 * - A hide is not a removal. The post stays, its author is told it is pending
 *   review, and a moderator reverses it in one press.
 * - Every hide is logged, with the count that caused it, so a pattern of
 *   wrong hides is visible rather than anecdotal.
 * - The author always sees their own post. The failure mode is "nobody else
 *   can see this for a few hours", not "this vanished".
 *
 * Pure, and given the reporters rather than fetching them, so every branch can
 * be checked without a database.
 */

/**
 * How many qualifying reports hide a post.
 *
 * Three. Two is a pair of people who agree, which happens constantly and
 * honestly; four would mean almost nothing ever hides on a site this size.
 * Three distinct established accounts is a weak signal on its own, which is
 * exactly why what it triggers is reversible and temporary rather than a
 * removal.
 */
export const AUTO_HIDE_REPORTS = 3

/**
 * How old a reporter's wallet must be to count.
 *
 * The same line `isFreshWallet` draws, deliberately reused rather than given a
 * number of its own: an account this app already describes to readers as a
 * "new wallet" is not an account whose report should be able to hide somebody
 * else's post. One threshold, one meaning, one place to change it.
 */
export const REPORTER_MIN_DAYS = FRESH_WALLET_DAYS

/**
 * Which of these reporters count.
 *
 * Deduplicated by address, because the question is how many people rather than
 * how many rows - `post_reports` already has a unique constraint on
 * (post_id, reporter), but this function is given whatever a caller read and
 * should not depend on a constraint it cannot see.
 *
 * A reporter whose wallet age is unknown does NOT count. That is the same
 * one-sided rule `isFreshWallet` applies and it matters more here: an unknown
 * age is usually an account nobody has looked up yet, and treating "we do not
 * know" as "old enough" would make the gate satisfiable by three accounts
 * created this morning, which is the brigading case this exists to refuse.
 *
 * @param {Array<{ address?: string, firstSeenAt?: string|null }>} reporters
 * @param {number} [now]
 * @returns {string[]} the addresses that count, lowercased
 */
export function qualifyingReporters(reporters, now = Date.now()) {
  const seen = new Set()

  /*
   * `Array.isArray`, not `reporters || []`.
   *
   * The latter reads as a guard and is not one: a truthy non-iterable - an
   * object, which is what a mistyped query result looks like - passes the
   * `||` and then throws on the `for...of`. In this function that would be a
   * 500 inside the report endpoint, which fails in the direction of a report
   * not being filed.
   */
  if (!Array.isArray(reporters)) return []

  for (const reporter of reporters) {
    const address = typeof reporter?.address === 'string' ? reporter.address.toLowerCase() : null
    if (!address) continue

    const days = walletAgeDays(reporter.firstSeenAt, now)
    // Null is "we have not looked it up", which must not read as "old enough".
    if (days === null || days < REPORTER_MIN_DAYS) continue

    seen.add(address)
  }

  return [...seen]
}

/**
 * Should this post be hidden pending review?
 *
 * Returns the decision and the count behind it, because the count is written
 * into the audit trail - a reviewer asks "what did the system see when it
 * acted", and recounting later gives the wrong answer once reports or
 * reporters have been deleted.
 *
 * `alreadyHidden` short-circuits to false rather than to true, which looks
 * like a detail and is the thing that stops a loop: a post hidden by a
 * moderator and then reported twice more must not be re-hidden by the system,
 * because that would write a second log entry attributing the hide to reports
 * and overwrite who actually did it.
 *
 * @param {object} params
 * @param {Array<{ address?: string, firstSeenAt?: string|null }>} params.reporters
 * @param {boolean} [params.alreadyHidden]
 * @param {boolean} [params.authorIsModerator] a moderator's own post is never
 *   auto-hidden: the list of moderators is an environment variable, so a hide
 *   that silenced one could not be undone from inside the app by anybody else
 * @param {number} [params.now]
 * @returns {{ hide: boolean, qualifying: number }}
 */
export function shouldAutoHide({
  reporters,
  alreadyHidden = false,
  authorIsModerator = false,
  now = Date.now(),
}) {
  const qualifying = qualifyingReporters(reporters, now).length

  if (alreadyHidden || authorIsModerator) return { hide: false, qualifying }

  return { hide: qualifying >= AUTO_HIDE_REPORTS, qualifying }
}

/**
 * What the author is told, and what a stranger is told.
 *
 * Two sentences from one function so they cannot drift apart, because the pair
 * is the whole honesty of this feature: the author has to know their post is
 * still there and why nobody is seeing it, and a stranger has to know
 * something is being withheld rather than that nothing was ever written.
 *
 * Neither sentence names the reporters or the count. A post hidden by three
 * accounts should not become a way for its author to work out which three.
 *
 * @param {{ hiddenBy?: string|null }|null} post
 * @param {boolean} isAuthor
 * @returns {string}
 */
export function hiddenNotice(post, isAuthor) {
  const byModerator = Boolean(post?.hiddenBy)

  if (isAuthor) {
    return byModerator
      ? 'A moderator has hidden this post. It is not in anybody else’s feed. You can still see it, and it has not been deleted.'
      : 'This post was hidden automatically after several established accounts reported it, and is waiting for a moderator to read it. It is not in anybody else’s feed. You can still see it, and it has not been deleted.'
  }

  return 'This post is hidden while a moderator reads it.'
}
