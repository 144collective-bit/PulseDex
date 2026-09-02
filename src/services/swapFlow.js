import { parseUnits } from 'viem'
import { needsApproval, hasSufficientAllowance, buildSwapCall } from './swap'

/**
 * Whether a swap may proceed, how far along it is, and what the button says.
 *
 * `swap.js` answers what call to make. This answers whether to make it. The two
 * are kept apart because this half is where the branching lives, and branching
 * is what needs testing: every function below is pure and takes its clock, its
 * chain and its receipts as arguments, so the whole decision surface can be
 * driven from Node without a wallet, a fork or a private key.
 *
 * The hook that consumes this holds no logic of its own. That is deliberate -
 * this project's test setup (node environment, `src/**\/*.test.js`) cannot
 * render a component, so anything that decides something has to live here or it
 * cannot be verified at all.
 */

/** How far along a swap is. */
export const SWAP_PHASE = {
  idle: 'idle',
  checking: 'checking',
  needsApproval: 'needsApproval',
  approving: 'approving',
  approveConfirming: 'approveConfirming',
  ready: 'ready',
  swapping: 'swapping',
  swapConfirming: 'swapConfirming',
  success: 'success',
  error: 'error',
  rejected: 'rejected',
}

/** Why a swap cannot proceed. Orthogonal to phase - a block outranks progress. */
export const SWAP_BLOCK = {
  none: 'none',
  disabled: 'disabled',
  disconnected: 'disconnected',
  chainUnknown: 'chainUnknown',
  wrongChain: 'wrongChain',
  noAmount: 'noAmount',
  noRoute: 'noRoute',
  quoting: 'quoting',
  unbuildable: 'unbuildable',
}

/** What pressing the button should do. */
export const SWAP_INTENT = {
  none: 'none',
  connect: 'connect',
  switchChain: 'switchChain',
  approve: 'approve',
  swap: 'swap',
  reset: 'reset',
}

/** Whether the router may move the sending token. */
export const APPROVAL = {
  notRequired: 'notRequired',
  unknown: 'unknown',
  required: 'required',
  satisfied: 'satisfied',
  unreadable: 'unreadable',
}

/**
 * Which network the wallet is on, as far as this trade is concerned.
 *
 * `unknown` is its own answer and must block. A wallet parked on a chain the
 * app does not list reports no chain id at all, and treating a missing id as
 * acceptable would hand a PulseChain router call to whatever network happened
 * to be selected.
 */
export function chainGate({ isConnected, chainId, expected }) {
  if (!isConnected) return 'disconnected'
  if (chainId === undefined || chainId === null) return 'unknown'
  return chainId === expected ? 'ok' : 'wrong'
}

/**
 * The typed amount, in the sending token's raw units.
 *
 * One wrapper, used by the gate, the allowance comparison and the call builder
 * alike, so those three can never disagree about what was typed. The panel's
 * input accepts anything matching /^\d*\.?\d*$/, which includes '', '.' and
 * '1.' - none of which parseUnits will take - and a value with more decimal
 * places than the token has, which it silently rounds.
 *
 * @returns {bigint|null} null when there is no usable amount.
 */
export function parseAmountRaw(amount, decimals) {
  if (amount === null || amount === undefined) return null
  const text = String(amount).trim()
  if (!text || text === '.') return null

  const numeric = Number(text)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  if (!Number.isInteger(decimals) || decimals < 0) return null

  try {
    const raw = parseUnits(text, decimals)
    return raw > 0n ? raw : null
  } catch {
    // More decimal places than the token carries, or a shape parseUnits
    // refuses. Either way there is no amount to trade.
    return null
  }
}

/**
 * The first reason this trade cannot go ahead.
 *
 * The order is the specification. Connection outranks the amount because
 * "enter an amount" is unhelpful advice to someone with no wallet attached, and
 * the chain outranks the quote because a quote is priced on PulseChain
 * regardless of where the wallet is pointed.
 */
export function blockingReason({
  enabled,
  isConnected,
  chainId,
  expectedChainId,
  from,
  to,
  amountRaw,
  quote,
  isQuoteFetching,
  isQuoteError,
  canBuild,
}) {
  if (!enabled) return SWAP_BLOCK.disabled

  const gate = chainGate({ isConnected, chainId, expected: expectedChainId })
  if (gate === 'disconnected') return SWAP_BLOCK.disconnected
  if (gate === 'unknown') return SWAP_BLOCK.chainUnknown
  if (gate === 'wrong') return SWAP_BLOCK.wrongChain

  if (!from || !to) return SWAP_BLOCK.noAmount
  if (!amountRaw || amountRaw <= 0n) return SWAP_BLOCK.noAmount

  // A failed route is a fact about the pair; a pending one is temporary. The
  // fact is the more useful thing to say, so it goes first.
  if (isQuoteError) return SWAP_BLOCK.noRoute
  if (!quote) return isQuoteFetching ? SWAP_BLOCK.quoting : SWAP_BLOCK.noRoute
  if (isQuoteFetching) return SWAP_BLOCK.quoting

  if (!canBuild) return SWAP_BLOCK.unbuildable

  return SWAP_BLOCK.none
}

/** Whether the router may move this token, as far as we can tell. */
export function approvalState({ from, allowanceRaw, amountInRaw, isLoading, isError }) {
  if (!needsApproval(from)) return APPROVAL.notRequired
  if (isError) return APPROVAL.unreadable
  if (isLoading || typeof allowanceRaw !== 'bigint') return APPROVAL.unknown
  if (!amountInRaw || amountInRaw <= 0n) return APPROVAL.unknown

  return hasSufficientAllowance(allowanceRaw, amountInRaw)
    ? APPROVAL.satisfied
    : APPROVAL.required
}

/**
 * Whether the allowance must be cleared before it can be raised.
 *
 * USDT and its clones revert `approve(n)` outright when a non-zero allowance
 * already stands, so raising one from 100 to 200 fails where setting it from
 * zero would not. Bridged USDT is on the curated list, which makes this a real
 * path rather than a hypothetical: approve, trade part of it, then trade more.
 */
export function needsAllowanceReset({ allowanceRaw, amountInRaw }) {
  if (typeof allowanceRaw !== 'bigint' || typeof amountInRaw !== 'bigint') return false
  return allowanceRaw > 0n && allowanceRaw < amountInRaw
}

/**
 * What a mined receipt actually says.
 *
 * A reverted transaction still produces a receipt, and the hook that waits for
 * one resolves successfully when it arrives. Reading that resolution as success
 * is the standard way this goes wrong: the panel congratulates someone whose
 * trade failed and whose gas is gone.
 */
export function receiptOutcome(receipt) {
  if (!receipt || !receipt.status) return null
  return receipt.status === 'success' ? 'success' : 'reverted'
}

/**
 * Whether to keep showing "approving" while a fresh allowance propagates.
 *
 * The read after an approval very often lands on a different node than the one
 * that accepted it - the client fans out over three, ranked by latency - and
 * that node can be a block or two behind. Without this the panel drops back to
 * "Approve" for a second and invites a second, needless signature.
 */
export function isApprovalSettling({ approveConfirmed, approval, refetchesSinceConfirm, maxRefetches = 3 }) {
  if (!approveConfirmed) return false
  if (approval === APPROVAL.satisfied) return false
  return refetchesSinceConfirm < maxRefetches
}

/**
 * How long to wait before re-reading the allowance, or null when done trying.
 *
 * Bounded on purpose. If the allowance still reads short after the last
 * attempt, saying so is more honest than spinning forever on the assumption
 * that the chain will catch up.
 */
export function nextAllowancePollMs(attempt, { base = 1500, max = 3 } = {}) {
  if (!Number.isInteger(attempt) || attempt < 0 || attempt >= max) return null
  return base * (attempt + 1)
}

/**
 * The phase, from everything known at once.
 *
 * First match wins, and the order carries two rules worth stating. The swap
 * outranks the approval throughout, so an approval settling underneath a
 * running swap cannot drag the display backwards. And settling outranks the
 * allowance itself, which is what stops the flicker described above.
 *
 * `approve` and `swap` are plain records - { pending, hash, outcome, error } -
 * rather than wagmi objects, so the whole table is drivable from a test.
 */
export function derivePhase({ block, approval, approve = {}, swap = {}, approvalSettling = false, isRejection }) {
  const rejected = typeof isRejection === 'function' ? isRejection : () => false

  if (swap.outcome === 'success') return { phase: SWAP_PHASE.success, failedStep: null }
  if (swap.outcome === 'reverted') return { phase: SWAP_PHASE.error, failedStep: 'swap' }
  if (swap.error) {
    return rejected(swap.error)
      ? { phase: SWAP_PHASE.rejected, failedStep: 'swap' }
      : { phase: SWAP_PHASE.error, failedStep: 'swap' }
  }
  if (swap.hash) return { phase: SWAP_PHASE.swapConfirming, failedStep: null }
  if (swap.pending) return { phase: SWAP_PHASE.swapping, failedStep: null }

  if (approve.error) {
    return rejected(approve.error)
      ? { phase: SWAP_PHASE.rejected, failedStep: 'approve' }
      : { phase: SWAP_PHASE.error, failedStep: 'approve' }
  }
  if (approve.outcome === 'reverted') return { phase: SWAP_PHASE.error, failedStep: 'approve' }
  if (approve.hash && !approve.outcome) return { phase: SWAP_PHASE.approveConfirming, failedStep: null }
  if (approve.pending) return { phase: SWAP_PHASE.approving, failedStep: null }

  if (approvalSettling) return { phase: SWAP_PHASE.approveConfirming, failedStep: null }

  if (block && block !== SWAP_BLOCK.none) return { phase: SWAP_PHASE.idle, failedStep: null }

  if (approval === APPROVAL.unknown) return { phase: SWAP_PHASE.checking, failedStep: null }
  if (approval === APPROVAL.unreadable) return { phase: SWAP_PHASE.error, failedStep: 'allowance' }
  if (approval === APPROVAL.required) return { phase: SWAP_PHASE.needsApproval, failedStep: null }

  return { phase: SWAP_PHASE.ready, failedStep: null }
}

const IN_FLIGHT = new Set([
  SWAP_PHASE.approving,
  SWAP_PHASE.approveConfirming,
  SWAP_PHASE.swapping,
  SWAP_PHASE.swapConfirming,
])

/** Whether a signature or a transaction is outstanding. Pauses quote refreshes. */
export function isSwapInFlight(phase) {
  return IN_FLIGHT.has(phase)
}

/**
 * Whether the trade inputs should be frozen.
 *
 * The same set. Re-routing a trade while its signature is in the wallet is the
 * shortest path to a receipt nobody can account for.
 */
export function shouldLockInputs(phase) {
  return IN_FLIGHT.has(phase)
}

/**
 * Whether the allowance we checked actually covers the call we are about to send.
 *
 * PulseX has two routers holding different pools, and the quote picks whichever
 * one priced the trade. An allowance granted to the other is worth nothing, and
 * the resulting revert costs a real transaction - after the user has already
 * paid for an approval.
 */
export function approvalCoversCall({ allowanceRaw, spender, call, amountInRaw }) {
  if (!call || !spender) return false
  if (typeof allowanceRaw !== 'bigint' || typeof amountInRaw !== 'bigint') return false
  if (String(spender).toLowerCase() !== String(call.address).toLowerCase()) return false
  return hasSufficientAllowance(allowanceRaw, amountInRaw)
}

/**
 * What the button says and does.
 *
 * Pure, so the whole matrix is a table test. The hook attaches an onClick and
 * nothing else.
 */
export function swapAction({ phase, block, fromSymbol = 'token', failedStep = null }) {
  const idle = (label, intent, extra = {}) => ({
    label,
    intent,
    disabled: intent === SWAP_INTENT.none,
    busy: false,
    tone: null,
    ...extra,
  })

  if (block === SWAP_BLOCK.disabled) return idle('Trading not enabled', SWAP_INTENT.none)
  if (block === SWAP_BLOCK.disconnected) return idle('Connect wallet', SWAP_INTENT.connect)
  if (block === SWAP_BLOCK.chainUnknown) {
    return { label: 'Checking network…', intent: SWAP_INTENT.none, disabled: true, busy: true, tone: null }
  }
  if (block === SWAP_BLOCK.wrongChain) {
    return { label: 'Switch to PulseChain', intent: SWAP_INTENT.switchChain, disabled: false, busy: false, tone: 'warn' }
  }
  if (block === SWAP_BLOCK.noAmount) return idle('Enter an amount', SWAP_INTENT.none)
  if (block === SWAP_BLOCK.noRoute) return idle('No route for this pair', SWAP_INTENT.none, { tone: 'danger' })
  if (block === SWAP_BLOCK.quoting) {
    return { label: 'Fetching quote…', intent: SWAP_INTENT.none, disabled: true, busy: true, tone: null }
  }
  if (block === SWAP_BLOCK.unbuildable) {
    return idle('Cannot build a protected trade', SWAP_INTENT.none, { tone: 'danger' })
  }

  switch (phase) {
    case SWAP_PHASE.checking:
      return { label: 'Checking allowance…', intent: SWAP_INTENT.none, disabled: true, busy: true, tone: null }
    case SWAP_PHASE.needsApproval:
      return idle(`Approve ${fromSymbol}`, SWAP_INTENT.approve)
    case SWAP_PHASE.approving:
    case SWAP_PHASE.swapping:
      return { label: 'Confirm in your wallet…', intent: SWAP_INTENT.none, disabled: true, busy: true, tone: 'info' }
    case SWAP_PHASE.approveConfirming:
      return { label: `Approving ${fromSymbol}…`, intent: SWAP_INTENT.none, disabled: true, busy: true, tone: 'info' }
    case SWAP_PHASE.swapConfirming:
      return { label: 'Swapping…', intent: SWAP_INTENT.none, disabled: true, busy: true, tone: 'info' }
    case SWAP_PHASE.success:
      return idle('Swap again', SWAP_INTENT.reset, { tone: 'ok' })
    case SWAP_PHASE.rejected:
      // Declining a prompt is a decision, not a fault. The button returns to
      // whatever it was offering, with nothing reported.
      return idle(
        failedStep === 'approve' ? `Approve ${fromSymbol}` : 'Swap',
        failedStep === 'approve' ? SWAP_INTENT.approve : SWAP_INTENT.swap
      )
    case SWAP_PHASE.error:
      return idle(
        'Try again',
        failedStep === 'approve' ? SWAP_INTENT.approve : SWAP_INTENT.swap,
        { tone: 'danger' }
      )
    case SWAP_PHASE.ready:
      return idle('Swap', SWAP_INTENT.swap)
    default:
      return idle('Swap', SWAP_INTENT.none)
  }
}

/**
 * Identity of a trade, for noticing when it has been replaced.
 *
 * Used to clear a finished transaction's state when the user moves on, without
 * clearing one that is still running.
 */
export function executionKey({ from, to, amount, slippagePct, recipient, chainId, router }) {
  return [
    from?.address ?? '',
    to?.address ?? '',
    String(amount ?? ''),
    String(slippagePct ?? ''),
    (recipient ?? '').toLowerCase(),
    String(chainId ?? ''),
    (router ?? '').toLowerCase(),
  ].join('|')
}

/**
 * Whether a swap call can be built at all, without keeping the result.
 *
 * The call itself must be built at the moment of clicking, because it carries a
 * deadline - one built at render and held would be signed stale. This asks the
 * same question for gating and throws the answer away.
 */
export function canBuildSwap(args) {
  return buildSwapCall({ ...args, nowMs: args.nowMs ?? Date.now() }) !== null
}
