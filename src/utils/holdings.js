/**
 * Which of somebody's tokens a profile actually shows.
 *
 * `fetchWalletPortfolio` returns everything an address holds, which on
 * PulseChain means the four tokens they bought and the fifty they were
 * airdropped by somebody hoping they would look. The portfolio page can afford
 * to list all of it - it is the reader's own wallet and they know what is
 * theirs. A profile cannot: it is a stranger's wallet being read as a claim
 * about them, and a list where the real holdings are buried under scam
 * airdrops is a list that says nothing.
 *
 * So this filters. And because filtering somebody's money is the kind of thing
 * that should never happen quietly, it returns a count of what it left out and
 * why, so the panel can say so on the page rather than presenting a trimmed
 * list as a complete one.
 */

/** How many rows a profile shows before it stops. Eight is about what fits
 *  without the panel becoming the page. */
export const MAX_HOLDINGS = 8

/** Below this, a holding is noise rather than a position. A dollar is low
 *  enough to keep anything somebody meant to buy. */
export const DUST_USD = 1

/**
 * The holdings worth drawing, and an account of what was dropped.
 *
 * Four reasons something is left out, counted separately because they mean
 * different things to a reader and the panel words them differently:
 *
 * - `spam`: flagged by `isSpamToken`. Airdropped advertising.
 * - `unpriced`: held, but no market this app can find - so there is no number
 *   to put beside it. Counted rather than shown at $0.00, which would read as
 *   a worthless holding rather than an unknown one.
 * - `dust`: priced, and worth less than a dollar.
 * - `overflow`: real, and past the row limit.
 *
 * `totalUsd` is the sum over everything that is not spam, including the rows
 * that were hidden - so the total is the truth about the wallet even though
 * the list below it is a selection. Spam is excluded from it because spam
 * tokens carry invented prices, and one of them claiming a million dollars of
 * liquidity would make the total a lie in the other direction.
 *
 * @param {Array<object>|null|undefined} tokens as fetchWalletPortfolio returns
 * @param {{ max?: number, dustUsd?: number }} [options]
 */
export function visibleHoldings(tokens, { max = MAX_HOLDINGS, dustUsd = DUST_USD } = {}) {
  const hidden = { spam: 0, unpriced: 0, dust: 0, overflow: 0 }

  const rows = Array.isArray(tokens) ? tokens : []
  const real = []
  let totalUsd = 0

  for (const token of rows) {
    if (!token || typeof token !== 'object') continue

    if (token.isSpam) {
      hidden.spam += 1
      continue
    }

    const value = Number(token.valueUsd)
    const balance = Number(token.balance)
    const priced = Number.isFinite(value) && value > 0

    if (priced) totalUsd += value

    /*
     * The native token is exempt from the dust rule.
     *
     * It is the one token every address on the chain has, so a wallet showing
     * a list that does not mention PLS reads as a failed lookup rather than as
     * a small balance. Any amount of it is worth a row.
     */
    if (token.isNative) {
      if (Number.isFinite(balance) && balance > 0) real.push(token)
      continue
    }

    if (!priced) {
      // Held, but with no market to value it against. Counted, not drawn: a
      // row reading $0.00 claims the holding is worthless, which is a
      // different statement from not knowing what it is worth.
      if (Number.isFinite(balance) && balance > 0) hidden.unpriced += 1
      continue
    }

    if (value < dustUsd) {
      hidden.dust += 1
      continue
    }

    real.push(token)
  }

  /*
   * Sorted here rather than trusted from upstream. `fetchWalletPortfolio`
   * does sort by value, and relying on that would make this function's output
   * depend on a detail of another module that nothing holds in place.
   */
  real.sort((a, b) => (Number(b.valueUsd) || 0) - (Number(a.valueUsd) || 0))

  const shown = real.slice(0, Math.max(0, max))
  hidden.overflow = real.length - shown.length

  return {
    shown,
    totalUsd,
    hidden,
    hiddenCount: hidden.spam + hidden.unpriced + hidden.dust + hidden.overflow,
  }
}

/**
 * The sentence under the list, saying what is not in it.
 *
 * One line, naming the reasons that apply and no others, because "47 hidden"
 * invites the reading that something is being kept from the reader. Null when
 * nothing was left out, and the caller draws nothing.
 *
 * Spam is named as spam. A reader looking at somebody's holdings on a token
 * site is making a judgement about them, and counting forty airdropped scam
 * tokens into an unexplained "hidden" number would let that judgement land on
 * the wrong person.
 *
 * @param {{ spam: number, unpriced: number, dust: number, overflow: number }} hidden
 * @returns {string|null}
 */
export function hiddenHoldingsLabel(hidden) {
  if (!hidden || typeof hidden !== 'object') return null

  const parts = []
  if (hidden.overflow > 0) parts.push(`${hidden.overflow} smaller`)
  if (hidden.dust > 0) parts.push(`${hidden.dust} under a dollar`)
  if (hidden.unpriced > 0) parts.push(`${hidden.unpriced} with no market`)
  if (hidden.spam > 0) parts.push(`${hidden.spam} airdropped`)

  if (parts.length === 0) return null
  return `Not shown: ${parts.join(', ')}.`
}
