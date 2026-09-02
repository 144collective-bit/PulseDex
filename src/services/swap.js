import { parseUnits } from 'viem'
import {
  ERC20_ALLOWANCE_ABI,
  ROUTER_SWAP_ABI,
  NATIVE_PLS,
} from '../config/dex'

/**
 * Building the calls a swap is made of - and nothing else.
 *
 * Every function here returns a description of a contract call. None of them
 * send one. That separation is the point: what gets signed is decided by pure
 * arithmetic over a quote, which can be tested exhaustively without a wallet,
 * a fork or a private key, and the thin layer that eventually hands these to
 * wagmi has no decisions left to get wrong.
 *
 * Two rules run through all of it.
 *
 * Money is integers. Floats appear in this app only to be displayed; anything
 * that reaches a router is a bigint the whole way, because a rounding error in
 * an amountOutMin is a rounding error in what a user is guaranteed to receive.
 *
 * The router is whichever one quoted. PulseX has a V1 and a V2 and they hold
 * different pools, so `quoteSwap` picks per trade - and an approval granted to
 * one is worthless to the other.
 */

/** Which router method a trade needs, decided by where native PLS sits. */
export const SWAP_KIND = {
  ethForTokens: 'ETH_FOR_TOKENS',
  tokensForEth: 'TOKENS_FOR_ETH',
  tokensForTokens: 'TOKENS_FOR_TOKENS',
}

const isNative = (token) => token?.address === NATIVE_PLS

/**
 * @param {{address:string}} from
 * @param {{address:string}} to
 * @returns {string|null} A SWAP_KIND, or null if both sides are native.
 */
export function swapKind(from, to) {
  if (!from || !to) return null
  if (isNative(from) && isNative(to)) return null
  if (isNative(from)) return SWAP_KIND.ethForTokens
  if (isNative(to)) return SWAP_KIND.tokensForEth
  return SWAP_KIND.tokensForTokens
}

/**
 * Native PLS has no contract, so there is no allowance to grant.
 *
 * Asking for one is not merely unnecessary - there is nothing to ask, and a
 * panel that shows an Approve step before a PLS sale is describing a
 * transaction that cannot exist.
 */
export function needsApproval(from) {
  return Boolean(from) && !isNative(from)
}

/**
 * The floor, in raw units, that the router will be told to enforce.
 *
 * Integer arithmetic end to end. Slippage becomes basis points first, so a
 * tolerance like 0.5% is 50/10000 rather than a binary fraction that cannot
 * represent 0.005 exactly.
 *
 * Basis points round to nearest. A tolerance finer than a hundredth of a
 * percent is not something the presets offer, and rounding it either way moves
 * the floor by less than a basis point.
 *
 * @param {bigint} amountOutRaw The quote's raw output.
 * @param {number} slippagePct  Tolerance in percent, e.g. 0.5.
 */
export function minimumReceivedRaw(amountOutRaw, slippagePct) {
  if (typeof amountOutRaw !== 'bigint' || amountOutRaw <= 0n) return 0n

  const bps = BigInt(Math.round(Number(slippagePct) * 100))
  // A tolerance at or beyond 100% would floor at zero, which is a swap with no
  // protection at all; a negative one would demand more than the quote.
  if (bps < 0n || bps >= 10_000n) return 0n

  return (amountOutRaw * (10_000n - bps)) / 10_000n
}

/**
 * The unix second a router should stop accepting this trade.
 *
 * Seconds, because that is what the contract compares against `block.timestamp`
 * - passing milliseconds sets a deadline fifty thousand years out, which is
 * the same as having none.
 *
 * @param {number} nowMs   Milliseconds, as Date.now() gives them.
 * @param {number} minutes Minutes of validity.
 */
export function deadlineFrom(nowMs, minutes) {
  return BigInt(Math.floor(nowMs / 1000) + Math.round(minutes * 60))
}

/**
 * Whether the spender may already move this amount.
 *
 * Compared against the exact amount being spent rather than against zero: an
 * allowance left over from a smaller trade is not nothing, but it is not
 * enough either, and treating it as enough produces a swap that reverts after
 * the user has already signed an approval.
 */
export function hasSufficientAllowance(allowanceRaw, amountInRaw) {
  if (typeof allowanceRaw !== 'bigint' || typeof amountInRaw !== 'bigint') return false
  return allowanceRaw >= amountInRaw
}

/**
 * The approval call, granting exactly what this trade spends.
 *
 * Exact rather than unlimited. An infinite approval is one compromised router
 * away from draining a wallet, it persists long after the trade that prompted
 * it, and this app links a revoke tool from its own directory - offering the
 * risk it advises against would be incoherent.
 */
export function buildApproveCall({ token, spender, amountRaw }) {
  if (!token || isNative(token)) return null
  if (!spender || typeof amountRaw !== 'bigint' || amountRaw <= 0n) return null

  return {
    address: token.address,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: 'approve',
    args: [spender, amountRaw],
  }
}

/**
 * A read of what the spender is currently allowed to move.
 */
export function buildAllowanceRead({ token, owner, spender }) {
  if (!token || isNative(token) || !owner || !spender) return null

  return {
    address: token.address,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  }
}

/**
 * The swap itself, as a call description.
 *
 * Everything is taken from the quote rather than recomputed: the path, and the
 * router that produced it. Rebuilding either here would let the trade that is
 * signed differ from the trade that was priced.
 *
 * @returns {null|{address:string, abi:object[], functionName:string, args:any[], value:bigint}}
 */
export function buildSwapCall({
  quote,
  from,
  to,
  amount,
  slippagePct,
  recipient,
  deadlineMinutes,
  nowMs = Date.now(),
}) {
  if (!quote || !from || !to || !recipient) return null

  const kind = swapKind(from, to)
  if (!kind) return null

  const parsed = Number(amount)
  if (!isFinite(parsed) || parsed <= 0) return null

  const amountInRaw = parseUnits(String(amount), from.decimals)
  if (amountInRaw <= 0n) return null

  const amountOutMin = minimumReceivedRaw(quote.amountOutRaw, slippagePct)
  // A zero floor is an unprotected trade. Refuse to build one rather than let
  // it reach a wallet looking like any other swap.
  if (amountOutMin <= 0n) return null

  const deadline = deadlineFrom(nowMs, deadlineMinutes)
  const path = quote.path
  if (!Array.isArray(path) || path.length < 2) return null

  const base = { address: quote.router, abi: ROUTER_SWAP_ABI }

  if (kind === SWAP_KIND.ethForTokens) {
    return {
      ...base,
      functionName: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
      // The amount in is the value sent, so it is not also an argument.
      args: [amountOutMin, path, recipient, deadline],
      value: amountInRaw,
    }
  }

  return {
    ...base,
    functionName:
      kind === SWAP_KIND.tokensForEth
        ? 'swapExactTokensForETHSupportingFeeOnTransferTokens'
        : 'swapExactTokensForTokensSupportingFeeOnTransferTokens',
    args: [amountInRaw, amountOutMin, path, recipient, deadline],
    value: 0n,
  }
}

/**
 * Where `amountOutMin` sits in a built call's arguments.
 *
 * The native-in variant takes no `amountIn` - the amount is the value sent -
 * so its floor is the first argument where the other two have it second.
 * Returned rather than assumed, because rewriting the wrong slot would edit
 * the path or the deadline and the mistake would look like a revert.
 */
export function floorArgIndex(functionName) {
  if (functionName === 'swapExactETHForTokensSupportingFeeOnTransferTokens') return 0
  if (
    functionName === 'swapExactTokensForETHSupportingFeeOnTransferTokens' ||
    functionName === 'swapExactTokensForTokensSupportingFeeOnTransferTokens'
  ) {
    return 1
  }
  return -1
}

/**
 * The same call with a different floor.
 *
 * Used to ask the chain what a trade would actually deliver: the floor is the
 * only thing that varies between probes, and everything else - path, router,
 * recipient, deadline, value - has to stay identical or the answer describes a
 * different trade.
 */
export function withFloor(call, amountOutMinRaw) {
  if (!call || typeof amountOutMinRaw !== 'bigint' || amountOutMinRaw < 0n) return null
  const i = floorArgIndex(call.functionName)
  if (i < 0 || !Array.isArray(call.args) || i >= call.args.length) return null

  const args = [...call.args]
  args[i] = amountOutMinRaw
  return { ...call, args }
}
