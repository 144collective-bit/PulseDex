/**
 * Reading what a wallet or a node just told us.
 *
 * Wallet errors arrive in several shapes - an EIP-1193 code, a wrapped cause, or
 * nothing but a message - and the difference between them decides whether a user
 * sees an error at all. Declining a prompt is a decision, not a fault, and
 * reporting it as one trains people to ignore the messages that matter.
 */

/**
 * The wallet prompt was dismissed, rather than anything going wrong.
 *
 * Lifted from SiweAuthContext, which had this privately and needed the same
 * judgement the swap flow needs. Shared rather than copied, so the two cannot
 * drift into disagreeing about what counts as a refusal.
 */
export const isRejection = (err) =>
  err?.code === 4001 ||
  err?.cause?.code === 4001 ||
  /user rejected|user denied|rejected the request|cancell?ed/i.test(err?.message || '')

const text = (err) => `${err?.shortMessage || ''} ${err?.message || ''} ${err?.details || ''}`

/**
 * What to tell someone whose transaction failed.
 *
 * A raw revert string is not an explanation, and on this chain the commonest
 * ones have specific causes worth naming. `TRANSFER_FROM_FAILED` in particular
 * almost never means what it says: it is an approval that did not stick, or a
 * token that taxes transfers so the pool receives less than the router was told
 * to expect.
 *
 * @param {unknown} err
 * @param {{ step?: 'approve'|'swap'|'allowance' }} [options]
 */
export function describeTxError(err, { step = 'swap' } = {}) {
  if (!err) return null
  if (isRejection(err)) return null

  const message = text(err)

  if (/insufficient funds|exceeds balance|gas required exceeds/i.test(message)) {
    return 'Not enough PLS to cover gas. Leave some unspent to pay for the transaction.'
  }

  if (/TRANSFER_FROM_FAILED|TransferHelper/i.test(message)) {
    return step === 'approve'
      ? 'The token refused the approval. Some tokens require an existing allowance to be cleared first.'
      : 'The transfer was refused. The approval may not have gone through, or this token charges a fee on transfer.'
  }

  if (/INSUFFICIENT_OUTPUT_AMOUNT/i.test(message)) {
    return 'The price moved past your slippage tolerance before the trade landed. Try again, or raise the tolerance.'
  }

  if (/EXPIRED|deadline/i.test(message)) {
    return 'The transaction sat too long and passed its deadline. Try again.'
  }

  if (/INSUFFICIENT_LIQUIDITY/i.test(message)) {
    return 'This pool does not hold enough liquidity for a trade that size.'
  }

  if (/execution reverted/i.test(message)) {
    return step === 'approve'
      ? 'The approval was rejected by the token contract.'
      : 'The swap was rejected by the router. The pool may have moved since it was quoted.'
  }

  if (/chain|network/i.test(message) && /unsupported|unrecognized|not (been )?added/i.test(message)) {
    return 'Your wallet does not know PulseChain yet. Add the network (chain 369) and try again.'
  }

  // Short messages from a wallet are usually the readable half; a full stack is
  // not something to put in a panel.
  const short = err?.shortMessage
  return short && short.length < 160 ? short : 'The transaction failed. Nothing was traded.'
}
