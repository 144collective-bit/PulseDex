import { describe, it, expect } from 'vitest'
import { parseUnits } from 'viem'
import {
  SWAP_PHASE,
  SWAP_BLOCK,
  SWAP_INTENT,
  APPROVAL,
  BALANCE,
  balanceState,
  estimateGasReserve,
  maxSpendable,
  chainGate,
  parseAmountRaw,
  blockingReason,
  approvalState,
  needsAllowanceReset,
  needsRequoteConfirmation,
  quoteDrift,
  receiptOutcome,
  routeChanged,
  PROBE,
  FEE_DUST_PCT,
  probeTolerance,
  probeStep,
  effectiveFeePct,
  needsFeeConsent,
  isApprovalSettling,
  nextAllowancePollMs,
  derivePhase,
  isSwapInFlight,
  shouldLockInputs,
  approvalCoversCall,
  swapAction,
  executionKey,
} from './swapFlow'
import { buildSwapCall } from './swap'
import { NATIVE_PLS, PULSEX_ROUTER_V2, PULSEX_ROUTER_V1 } from '../config/dex'
import { isRejection } from '../utils/walletErrors'

/*
 * Whether a swap may proceed, and what the button says.
 *
 * This is where the branching lives, so this is where the tests are. The three
 * things that would cost someone real money if they were wrong get the closest
 * attention: the chain gate letting a PulseChain call reach another network,
 * an allowance validated against one router being spent on the other, and a
 * reverted receipt being read as a success.
 *
 * The precedence orders in `blockingReason` and `derivePhase` are specifications
 * rather than implementation details, so each adjacent pair is pinned
 * separately - a reordering has to fail, not merely change which message shows.
 */

const TOKEN = { address: '0x1111111111111111111111111111111111111111', decimals: 18, symbol: 'AAA' }
const TOKEN_B = { address: '0x2222222222222222222222222222222222222222', decimals: 18, symbol: 'BBB' }
const USDC = { address: '0x3333333333333333333333333333333333333333', decimals: 6, symbol: 'USDC' }
const PLS = { address: NATIVE_PLS, decimals: 18, symbol: 'PLS' }
const RECIPIENT = '0x9999999999999999999999999999999999999999'
const PULSECHAIN = 369

const quote = (over = {}) => ({
  amountOut: 100,
  amountOutRaw: parseUnits('100', 18),
  path: [TOKEN.address, TOKEN_B.address],
  router: PULSEX_ROUTER_V2,
  ...over,
})

/** Everything green: connected, right chain, quoted, buildable. */
const passing = {
  enabled: true,
  isConnected: true,
  chainId: PULSECHAIN,
  expectedChainId: PULSECHAIN,
  from: TOKEN,
  to: TOKEN_B,
  amountRaw: parseUnits('1', 18),
  quote: quote(),
  isQuoteFetching: false,
  isQuoteError: false,
  canBuild: true,
}

describe('chainGate', () => {
  it('reads the four states', () => {
    expect(chainGate({ isConnected: false, chainId: 369, expected: 369 })).toBe('disconnected')
    expect(chainGate({ isConnected: true, chainId: 369, expected: 369 })).toBe('ok')
    expect(chainGate({ isConnected: true, chainId: 1, expected: 369 })).toBe('wrong')
  })

  it('treats a missing chain id as unknown, never as ok', () => {
    /*
     * A wallet sitting on a network the app does not list reports no id at all.
     * Reading that as acceptable would hand a PulseChain router call to
     * whatever chain happened to be selected.
     */
    expect(chainGate({ isConnected: true, chainId: undefined, expected: 369 })).toBe('unknown')
    expect(chainGate({ isConnected: true, chainId: null, expected: 369 })).toBe('unknown')
  })
})

describe('parseAmountRaw', () => {
  it('scales by the token decimals', () => {
    expect(parseAmountRaw('1', 18)).toBe(parseUnits('1', 18))
    expect(parseAmountRaw('1', 6)).toBe(1_000_000n)
  })

  it('agrees with what buildSwapCall computes for the same input', () => {
    // The gate, the allowance check and the call must not disagree about what
    // was typed, so they share this function.
    const call = buildSwapCall({
      quote: quote(),
      from: USDC,
      to: TOKEN_B,
      amount: '12.5',
      slippagePct: 0.5,
      recipient: RECIPIENT,
      deadlineMinutes: 20,
      nowMs: 1_700_000_000_000,
    })

    expect(parseAmountRaw('12.5', USDC.decimals)).toBe(call.args[0])
  })

  it('refuses the shapes the panel input allows but parseUnits will not', () => {
    // /^\d*\.?\d*$/ admits all of these.
    for (const amount of ['', '.', '0', '0.0']) {
      expect(parseAmountRaw(amount, 18)).toBeNull()
    }
  })

  it('refuses more decimal places than the token carries', () => {
    // Rounding this silently would trade a different amount than was typed.
    expect(parseAmountRaw('0.0000001', 6)).toBeNull()
  })

  it('accepts a trailing point, which is mid-typing rather than invalid', () => {
    expect(parseAmountRaw('1.', 18)).toBe(parseUnits('1', 18))
  })

  it('refuses nonsense and negatives', () => {
    for (const amount of ['abc', '-1', null, undefined]) {
      expect(parseAmountRaw(amount, 18)).toBeNull()
    }
  })
})

describe('blockingReason precedence', () => {
  it('passes everything when nothing is wrong', () => {
    expect(blockingReason(passing)).toBe(SWAP_BLOCK.none)
  })

  it('the feature flag outranks everything', () => {
    expect(blockingReason({ ...passing, enabled: false, isConnected: false })).toBe(SWAP_BLOCK.disabled)
  })

  it('disconnected outranks an unknown chain', () => {
    expect(blockingReason({ ...passing, isConnected: false, chainId: undefined })).toBe(
      SWAP_BLOCK.disconnected
    )
  })

  it('an unknown chain outranks a wrong one', () => {
    expect(blockingReason({ ...passing, chainId: undefined })).toBe(SWAP_BLOCK.chainUnknown)
  })

  it('the wrong chain outranks a missing amount', () => {
    // "Enter an amount" is unhelpful advice to someone on the wrong network.
    expect(blockingReason({ ...passing, chainId: 1, amountRaw: null })).toBe(SWAP_BLOCK.wrongChain)
  })

  it('a short balance outranks a missing route', () => {
    // No point pricing a route for an amount that cannot be sent.
    expect(
      blockingReason({ ...passing, balance: BALANCE.insufficient, isQuoteError: true })
    ).toBe(SWAP_BLOCK.insufficientBalance)
  })

  it('reports missing gas separately from a missing balance', () => {
    expect(blockingReason({ ...passing, balance: BALANCE.insufficientGas })).toBe(
      SWAP_BLOCK.insufficientGas
    )
  })

  it('a missing amount outranks a short balance', () => {
    expect(blockingReason({ ...passing, amountRaw: null, balance: BALANCE.insufficient })).toBe(
      SWAP_BLOCK.noAmount
    )
  })

  it('does not block on a balance it has not read', () => {
    expect(blockingReason({ ...passing, balance: BALANCE.unknown })).toBe(SWAP_BLOCK.none)
  })

  it('a missing amount outranks a missing route', () => {
    expect(blockingReason({ ...passing, amountRaw: null, isQuoteError: true })).toBe(
      SWAP_BLOCK.noAmount
    )
  })

  it('a failed route outranks a pending quote', () => {
    // The failure is a fact about the pair; the pending state is temporary.
    expect(blockingReason({ ...passing, isQuoteError: true, isQuoteFetching: true })).toBe(
      SWAP_BLOCK.noRoute
    )
  })

  it('a pending quote outranks an unbuildable call', () => {
    expect(blockingReason({ ...passing, isQuoteFetching: true, canBuild: false })).toBe(
      SWAP_BLOCK.quoting
    )
  })

  it('reports an unbuildable call last, when nothing else is wrong', () => {
    expect(blockingReason({ ...passing, canBuild: false })).toBe(SWAP_BLOCK.unbuildable)
  })

  it('treats no quote and no pending fetch as no route', () => {
    expect(blockingReason({ ...passing, quote: null })).toBe(SWAP_BLOCK.noRoute)
    expect(blockingReason({ ...passing, quote: null, isQuoteFetching: true })).toBe(SWAP_BLOCK.quoting)
  })
})

describe('approvalState', () => {
  const amountInRaw = parseUnits('10', 18)

  it('is not required for native PLS whatever the allowance says', () => {
    expect(approvalState({ from: PLS, allowanceRaw: 0n, amountInRaw })).toBe(APPROVAL.notRequired)
  })

  it('is satisfied at exactly the amount, and required a wei below it', () => {
    expect(approvalState({ from: TOKEN, allowanceRaw: amountInRaw, amountInRaw })).toBe(
      APPROVAL.satisfied
    )
    expect(approvalState({ from: TOKEN, allowanceRaw: amountInRaw - 1n, amountInRaw })).toBe(
      APPROVAL.required
    )
  })

  it('is unknown while the read is in flight or absent', () => {
    expect(approvalState({ from: TOKEN, allowanceRaw: undefined, amountInRaw })).toBe(APPROVAL.unknown)
    expect(approvalState({ from: TOKEN, allowanceRaw: 0n, amountInRaw, isLoading: true })).toBe(
      APPROVAL.unknown
    )
  })

  it('is unreadable when the read failed, which is not the same as zero', () => {
    expect(approvalState({ from: TOKEN, allowanceRaw: undefined, amountInRaw, isError: true })).toBe(
      APPROVAL.unreadable
    )
  })
})

describe('needsAllowanceReset', () => {
  const amountInRaw = parseUnits('10', 18)

  it('is true only in the window where a token would refuse to raise it', () => {
    // USDT and its clones revert approve(n) when a non-zero allowance stands.
    expect(needsAllowanceReset({ allowanceRaw: parseUnits('5', 18), amountInRaw })).toBe(true)
  })

  it('is false at zero, since there is nothing to clear', () => {
    expect(needsAllowanceReset({ allowanceRaw: 0n, amountInRaw })).toBe(false)
  })

  it('is false once the allowance already covers the amount', () => {
    expect(needsAllowanceReset({ allowanceRaw: amountInRaw, amountInRaw })).toBe(false)
  })
})

describe('receiptOutcome', () => {
  it('reads a reverted receipt as a failure, not a success', () => {
    // The hook that waits for a receipt resolves for a reverted transaction
    // too. Reading that resolution as success congratulates someone whose
    // trade failed and whose gas is gone.
    expect(receiptOutcome({ status: 'reverted' })).toBe('reverted')
    expect(receiptOutcome({ status: 'success' })).toBe('success')
  })

  it('has no answer until a receipt exists', () => {
    expect(receiptOutcome(undefined)).toBeNull()
    expect(receiptOutcome({})).toBeNull()
  })
})

describe('isApprovalSettling', () => {
  it('holds while a confirmed approval has not yet shown up in the allowance', () => {
    expect(
      isApprovalSettling({ approveConfirmed: true, approval: APPROVAL.required, refetchesSinceConfirm: 0 })
    ).toBe(true)
  })

  it('stops as soon as the allowance satisfies the amount', () => {
    expect(
      isApprovalSettling({ approveConfirmed: true, approval: APPROVAL.satisfied, refetchesSinceConfirm: 0 })
    ).toBe(false)
  })

  it('gives up rather than holding forever', () => {
    expect(
      isApprovalSettling({
        approveConfirmed: true,
        approval: APPROVAL.required,
        refetchesSinceConfirm: 3,
        maxRefetches: 3,
      })
    ).toBe(false)
  })

  it('does nothing before an approval confirms', () => {
    expect(
      isApprovalSettling({ approveConfirmed: false, approval: APPROVAL.required, refetchesSinceConfirm: 0 })
    ).toBe(false)
  })
})

describe('nextAllowancePollMs', () => {
  it('backs off and then terminates', () => {
    expect(nextAllowancePollMs(0)).toBe(1500)
    expect(nextAllowancePollMs(1)).toBe(3000)
    expect(nextAllowancePollMs(2)).toBe(4500)
    expect(nextAllowancePollMs(3)).toBeNull()
  })
})

describe('derivePhase', () => {
  const rejection = new Error('User rejected the request')
  const failure = new Error('execution reverted')

  it('reports readiness when nothing is outstanding', () => {
    expect(
      derivePhase({ block: SWAP_BLOCK.none, approval: APPROVAL.satisfied, isRejection }).phase
    ).toBe(SWAP_PHASE.ready)
  })

  it('walks the approval steps', () => {
    const base = { block: SWAP_BLOCK.none, approval: APPROVAL.required, isRejection }

    expect(derivePhase(base).phase).toBe(SWAP_PHASE.needsApproval)
    expect(derivePhase({ ...base, approve: { pending: true } }).phase).toBe(SWAP_PHASE.approving)
    expect(derivePhase({ ...base, approve: { hash: '0xabc' } }).phase).toBe(
      SWAP_PHASE.approveConfirming
    )
  })

  it('walks the swap steps', () => {
    const base = { block: SWAP_BLOCK.none, approval: APPROVAL.satisfied, isRejection }

    expect(derivePhase({ ...base, swap: { pending: true } }).phase).toBe(SWAP_PHASE.swapping)
    expect(derivePhase({ ...base, swap: { hash: '0xabc' } }).phase).toBe(SWAP_PHASE.swapConfirming)
    expect(derivePhase({ ...base, swap: { hash: '0xabc', outcome: 'success' } }).phase).toBe(
      SWAP_PHASE.success
    )
  })

  it('keeps the swap in front of a settled approval underneath it', () => {
    // Otherwise a confirming approval drags the display backwards mid-swap.
    const phase = derivePhase({
      block: SWAP_BLOCK.none,
      approval: APPROVAL.satisfied,
      approve: { hash: '0xapprove', outcome: 'success' },
      swap: { pending: true },
      isRejection,
    })

    expect(phase.phase).toBe(SWAP_PHASE.swapping)
  })

  it('keeps the swap in front of an approval still pending underneath it', () => {
    /*
     * The stronger form of the rule above, and the one a reordering slips
     * past: not merely a finished approval under a running swap, but a
     * pending one. The writer for the approval can still report itself busy
     * while the swap is already in the wallet, and if that outranked the swap
     * the panel would announce an approval that is no longer what is
     * happening.
     */
    const both = derivePhase({
      block: SWAP_BLOCK.none,
      approval: APPROVAL.satisfied,
      approve: { pending: true },
      swap: { pending: true },
      isRejection,
    })
    expect(both.phase).toBe(SWAP_PHASE.swapping)

    const submitted = derivePhase({
      block: SWAP_BLOCK.none,
      approval: APPROVAL.satisfied,
      approve: { pending: true },
      swap: { hash: '0xabc' },
      isRejection,
    })
    expect(submitted.phase).toBe(SWAP_PHASE.swapConfirming)

    // And a failed swap is still the swap's failure, not the approval's.
    const failed = derivePhase({
      block: SWAP_BLOCK.none,
      approval: APPROVAL.satisfied,
      approve: { pending: true },
      swap: { hash: '0xabc', outcome: 'reverted' },
      isRejection,
    })
    expect(failed).toEqual({ phase: SWAP_PHASE.error, failedStep: 'swap' })
  })

  it('reports a reverted swap as an error, naming the step', () => {
    const phase = derivePhase({
      block: SWAP_BLOCK.none,
      approval: APPROVAL.satisfied,
      swap: { hash: '0xabc', outcome: 'reverted' },
      isRejection,
    })

    expect(phase).toEqual({ phase: SWAP_PHASE.error, failedStep: 'swap' })
  })

  it('separates a declined prompt from a failure, on either step', () => {
    const declinedSwap = derivePhase({
      block: SWAP_BLOCK.none,
      approval: APPROVAL.satisfied,
      swap: { error: rejection },
      isRejection,
    })
    const failedSwap = derivePhase({
      block: SWAP_BLOCK.none,
      approval: APPROVAL.satisfied,
      swap: { error: failure },
      isRejection,
    })

    expect(declinedSwap.phase).toBe(SWAP_PHASE.rejected)
    expect(failedSwap.phase).toBe(SWAP_PHASE.error)

    expect(
      derivePhase({
        block: SWAP_BLOCK.none,
        approval: APPROVAL.required,
        approve: { error: rejection },
        isRejection,
      }).phase
    ).toBe(SWAP_PHASE.rejected)
  })

  it('holds at approving while a fresh allowance propagates', () => {
    // Without this the panel offers Approve again for a second and invites a
    // needless second signature.
    const phase = derivePhase({
      block: SWAP_BLOCK.none,
      approval: APPROVAL.required,
      approvalSettling: true,
      isRejection,
    })

    expect(phase.phase).toBe(SWAP_PHASE.approveConfirming)
  })

  it('shows a moved price only while there is still a decision to make', () => {
    const base = { block: SWAP_BLOCK.none, approval: APPROVAL.satisfied, priceMoved: true, isRejection }

    expect(derivePhase(base).phase).toBe(SWAP_PHASE.priceMoved)

    // A transaction already signed has passed the point of deciding.
    expect(derivePhase({ ...base, swap: { pending: true } }).phase).toBe(SWAP_PHASE.swapping)
    expect(derivePhase({ ...base, swap: { hash: '0xabc' } }).phase).toBe(SWAP_PHASE.swapConfirming)
  })

  it('reports idle when something is blocking', () => {
    expect(
      derivePhase({ block: SWAP_BLOCK.wrongChain, approval: APPROVAL.satisfied, isRejection }).phase
    ).toBe(SWAP_PHASE.idle)
  })

  it('lets a live transaction outrank a block that appeared under it', () => {
    // A quote refresh going stale mid-swap must not blank the pending state.
    const phase = derivePhase({
      block: SWAP_BLOCK.quoting,
      approval: APPROVAL.satisfied,
      swap: { hash: '0xabc' },
      isRejection,
    })

    expect(phase.phase).toBe(SWAP_PHASE.swapConfirming)
  })

  it('reports an unreadable allowance as an error naming that step', () => {
    expect(
      derivePhase({ block: SWAP_BLOCK.none, approval: APPROVAL.unreadable, isRejection })
    ).toEqual({ phase: SWAP_PHASE.error, failedStep: 'allowance' })
  })

  it('reports checking while the allowance is unknown', () => {
    expect(
      derivePhase({ block: SWAP_BLOCK.none, approval: APPROVAL.unknown, isRejection }).phase
    ).toBe(SWAP_PHASE.checking)
  })
})

describe('isSwapInFlight and shouldLockInputs', () => {
  const inFlight = [
    SWAP_PHASE.approving,
    SWAP_PHASE.approveConfirming,
    SWAP_PHASE.swapping,
    SWAP_PHASE.swapConfirming,
  ]
  const settled = [
    SWAP_PHASE.idle,
    SWAP_PHASE.checking,
    SWAP_PHASE.needsApproval,
    SWAP_PHASE.ready,
    SWAP_PHASE.success,
    SWAP_PHASE.error,
    SWAP_PHASE.rejected,
  ]

  it('covers exactly the phases with something outstanding', () => {
    for (const phase of inFlight) {
      expect(isSwapInFlight(phase)).toBe(true)
      expect(shouldLockInputs(phase)).toBe(true)
    }
    for (const phase of settled) {
      expect(isSwapInFlight(phase)).toBe(false)
      expect(shouldLockInputs(phase)).toBe(false)
    }
  })
})

describe('approvalCoversCall', () => {
  const amountInRaw = parseUnits('10', 18)
  const call = { address: PULSEX_ROUTER_V2 }

  it('accepts an allowance granted to the router being called', () => {
    expect(
      approvalCoversCall({ allowanceRaw: amountInRaw, spender: PULSEX_ROUTER_V2, call, amountInRaw })
    ).toBe(true)
  })

  it('refuses an allowance granted to the other router', () => {
    /*
     * PulseX has two routers holding different pools and the quote picks one.
     * An allowance aimed at the other is worthless, and the revert costs a real
     * transaction after an approval has already been paid for.
     */
    expect(
      approvalCoversCall({ allowanceRaw: amountInRaw, spender: PULSEX_ROUTER_V1, call, amountInRaw })
    ).toBe(false)
  })

  it('compares addresses without caring about case', () => {
    expect(
      approvalCoversCall({
        allowanceRaw: amountInRaw,
        spender: PULSEX_ROUTER_V2.toLowerCase(),
        call: { address: PULSEX_ROUTER_V2.toUpperCase().replace('0X', '0x') },
        amountInRaw,
      })
    ).toBe(true)
  })

  it('refuses when the allowance does not cover the amount', () => {
    expect(
      approvalCoversCall({
        allowanceRaw: amountInRaw - 1n,
        spender: PULSEX_ROUTER_V2,
        call,
        amountInRaw,
      })
    ).toBe(false)
  })

  it('refuses without a call or a spender', () => {
    expect(approvalCoversCall({ allowanceRaw: amountInRaw, spender: null, call, amountInRaw })).toBe(false)
    expect(
      approvalCoversCall({ allowanceRaw: amountInRaw, spender: PULSEX_ROUTER_V2, call: null, amountInRaw })
    ).toBe(false)
  })
})

describe('swapAction', () => {
  const blocks = Object.values(SWAP_BLOCK).filter((b) => b !== SWAP_BLOCK.none)
  const phases = Object.values(SWAP_PHASE)

  it('always produces a label', () => {
    for (const block of blocks) {
      expect(swapAction({ phase: SWAP_PHASE.idle, block }).label).toBeTruthy()
    }
    for (const phase of phases) {
      expect(swapAction({ phase, block: SWAP_BLOCK.none }).label).toBeTruthy()
    }
  })

  it('never offers an action it has no intent for', () => {
    for (const block of blocks) {
      const action = swapAction({ phase: SWAP_PHASE.idle, block })
      if (action.intent === SWAP_INTENT.none) expect(action.disabled).toBe(true)
      else expect(action.disabled).toBe(false)
    }
    for (const phase of phases) {
      const action = swapAction({ phase, block: SWAP_BLOCK.none })
      if (action.intent === SWAP_INTENT.none) expect(action.disabled).toBe(true)
    }
  })

  it('offers the switch on the wrong chain rather than a dead button', () => {
    const action = swapAction({ phase: SWAP_PHASE.idle, block: SWAP_BLOCK.wrongChain })

    expect(action.intent).toBe(SWAP_INTENT.switchChain)
    expect(action.disabled).toBe(false)
  })

  it('offers connect when disconnected', () => {
    expect(swapAction({ phase: SWAP_PHASE.idle, block: SWAP_BLOCK.disconnected }).intent).toBe(
      SWAP_INTENT.connect
    )
  })

  it('names the token it is approving', () => {
    expect(
      swapAction({ phase: SWAP_PHASE.needsApproval, block: SWAP_BLOCK.none, fromSymbol: 'HEX' }).label
    ).toBe('Approve HEX')
  })

  it('shows a spinner for every waiting state', () => {
    for (const phase of [
      SWAP_PHASE.approving,
      SWAP_PHASE.approveConfirming,
      SWAP_PHASE.swapping,
      SWAP_PHASE.swapConfirming,
      SWAP_PHASE.checking,
    ]) {
      expect(swapAction({ phase, block: SWAP_BLOCK.none }).busy).toBe(true)
    }
  })

  it('returns a declined prompt to its resting state with no alarm', () => {
    // Declining is a decision, not a fault.
    const afterApprove = swapAction({
      phase: SWAP_PHASE.rejected,
      block: SWAP_BLOCK.none,
      failedStep: 'approve',
      fromSymbol: 'HEX',
    })

    expect(afterApprove.label).toBe('Approve HEX')
    expect(afterApprove.intent).toBe(SWAP_INTENT.approve)
    expect(afterApprove.tone).toBeNull()
  })

  it('retries the step that actually failed', () => {
    expect(
      swapAction({ phase: SWAP_PHASE.error, block: SWAP_BLOCK.none, failedStep: 'approve' }).intent
    ).toBe(SWAP_INTENT.approve)
    expect(
      swapAction({ phase: SWAP_PHASE.error, block: SWAP_BLOCK.none, failedStep: 'swap' }).intent
    ).toBe(SWAP_INTENT.swap)
  })

  it('asks for consent by name when the price has moved', () => {
    const action = swapAction({ phase: SWAP_PHASE.priceMoved, block: SWAP_BLOCK.none })

    expect(action.label).toBe('Accept new price')
    expect(action.intent).toBe(SWAP_INTENT.acceptPrice)
    expect(action.disabled).toBe(false)
  })

  it('lets a finished swap start another', () => {
    const action = swapAction({ phase: SWAP_PHASE.success, block: SWAP_BLOCK.none })

    expect(action.intent).toBe(SWAP_INTENT.reset)
    expect(action.disabled).toBe(false)
  })

  it('says trading is off when the flag is down', () => {
    const action = swapAction({ phase: SWAP_PHASE.idle, block: SWAP_BLOCK.disabled })

    expect(action.intent).toBe(SWAP_INTENT.none)
    expect(action.disabled).toBe(true)
  })
})

describe('executionKey', () => {
  const base = {
    from: TOKEN,
    to: TOKEN_B,
    amount: '1',
    slippagePct: 0.5,
    recipient: RECIPIENT,
    chainId: PULSECHAIN,
    router: PULSEX_ROUTER_V2,
  }

  it('is stable for the same trade', () => {
    expect(executionKey(base)).toBe(executionKey({ ...base }))
  })

  it('changes when any part of the trade changes', () => {
    const changes = [
      { from: TOKEN_B },
      { to: TOKEN },
      { amount: '2' },
      { slippagePct: 1 },
      { recipient: '0x1234567890123456789012345678901234567890' },
      { chainId: 1 },
      { router: PULSEX_ROUTER_V1 },
    ]

    for (const change of changes) {
      expect(executionKey({ ...base, ...change })).not.toBe(executionKey(base))
    }
  })

  it('ignores address casing, which wallets disagree about', () => {
    expect(executionKey({ ...base, recipient: RECIPIENT.toUpperCase() })).toBe(executionKey(base))
  })
})

describe('estimateGasReserve', () => {
  it('scales with the gas price rather than guessing a round number of PLS', () => {
    // Gas here is quoted in enormous numbers of wei and moves, so a fixed
    // reserve is either too small to cover a fee or eats a small wallet.
    const cheap = estimateGasReserve(1_000_000_000n)
    const dear = estimateGasReserve(10_000_000_000n)

    expect(dear).toBe(cheap * 10n)
  })

  it('carries a margin over a single swap, for a price that moves', () => {
    const reserve = estimateGasReserve(1_000_000_000n, { gasUnits: 400_000n, buffer: 2n })

    expect(reserve).toBe(1_000_000_000n * 400_000n * 2n)
  })

  it('reserves nothing when the price is unknown, rather than blocking', () => {
    // An unread gas price must not make every native trade look unaffordable.
    expect(estimateGasReserve(undefined)).toBe(0n)
    expect(estimateGasReserve(0n)).toBe(0n)
  })
})

describe('maxSpendable', () => {
  const balance = parseUnits('100', 18)
  const reserve = parseUnits('1', 18)

  it('offers the whole balance for a token', () => {
    expect(maxSpendable({ balanceRaw: balance, isNative: false, gasReserveRaw: reserve })).toBe(balance)
  })

  it('holds back the fee for native PLS', () => {
    // Filling in the whole balance is the commonest way a first native swap
    // fails: the transaction has nothing left to pay for itself.
    expect(maxSpendable({ balanceRaw: balance, isNative: true, gasReserveRaw: reserve })).toBe(
      balance - reserve
    )
  })

  it('offers nothing rather than a negative when the balance is under the reserve', () => {
    expect(maxSpendable({ balanceRaw: reserve / 2n, isNative: true, gasReserveRaw: reserve })).toBe(0n)
  })

  it('offers nothing for an empty or unknown balance', () => {
    expect(maxSpendable({ balanceRaw: 0n, isNative: false })).toBe(0n)
    expect(maxSpendable({ balanceRaw: undefined, isNative: false })).toBe(0n)
  })
})

describe('balanceState', () => {
  const amountInRaw = parseUnits('10', 18)
  const reserve = parseUnits('1', 18)

  it('passes when the wallet covers the trade and the fee', () => {
    expect(
      balanceState({
        isNative: false,
        balanceRaw: amountInRaw,
        nativeBalanceRaw: reserve,
        amountInRaw,
        gasReserveRaw: reserve,
      })
    ).toBe(BALANCE.ok)
  })

  it('catches a token balance that is short', () => {
    expect(
      balanceState({
        isNative: false,
        balanceRaw: amountInRaw - 1n,
        nativeBalanceRaw: reserve,
        amountInRaw,
        gasReserveRaw: reserve,
      })
    ).toBe(BALANCE.insufficient)
  })

  it('catches a token trade with no PLS to pay the fee', () => {
    // Holding the token is not enough - the fee is paid in something else.
    expect(
      balanceState({
        isNative: false,
        balanceRaw: amountInRaw,
        nativeBalanceRaw: reserve - 1n,
        amountInRaw,
        gasReserveRaw: reserve,
      })
    ).toBe(BALANCE.insufficientGas)
  })

  it('takes the fee out of the same balance for a native trade', () => {
    // Exactly the amount is affordable only if nothing is needed for gas.
    expect(
      balanceState({ isNative: true, balanceRaw: amountInRaw, amountInRaw, gasReserveRaw: reserve })
    ).toBe(BALANCE.insufficientGas)

    expect(
      balanceState({
        isNative: true,
        balanceRaw: amountInRaw + reserve,
        amountInRaw,
        gasReserveRaw: reserve,
      })
    ).toBe(BALANCE.ok)
  })

  it('does not block on a balance it has not read yet', () => {
    // A read in flight is not evidence of an empty wallet.
    expect(balanceState({ isNative: false, balanceRaw: undefined, amountInRaw })).toBe(BALANCE.unknown)
    expect(
      balanceState({ isNative: false, balanceRaw: amountInRaw, amountInRaw, isLoading: true })
    ).toBe(BALANCE.unknown)
    expect(
      balanceState({ isNative: false, balanceRaw: amountInRaw, amountInRaw, isError: true })
    ).toBe(BALANCE.unknown)
  })
})

describe('quoteDrift', () => {
  const shown = parseUnits('100', 18)

  it('reports how much worse a fresh quote is, in percent', () => {
    expect(quoteDrift(shown, parseUnits('99', 18))).toBeCloseTo(1, 6)
    expect(quoteDrift(shown, parseUnits('95', 18))).toBeCloseTo(5, 6)
  })

  it('reports a move in the user favour as negative', () => {
    // An improvement needs no permission, so it must not read as a loss.
    expect(quoteDrift(shown, parseUnits('101', 18))).toBeCloseTo(-1, 6)
  })

  it('is zero when nothing moved', () => {
    expect(quoteDrift(shown, shown)).toBe(0)
  })

  it('resolves moves smaller than a percent', () => {
    // Computed in basis points first: doing it in percent over bigints would
    // truncate every sub-one-percent move to zero.
    expect(quoteDrift(shown, parseUnits('99.5', 18))).toBeCloseTo(0.5, 6)
    expect(quoteDrift(shown, parseUnits('99.9', 18))).toBeCloseTo(0.1, 6)
  })

  it('has no answer without two figures to compare', () => {
    expect(quoteDrift(undefined, shown)).toBeNull()
    expect(quoteDrift(shown, undefined)).toBeNull()
    expect(quoteDrift(0n, shown)).toBeNull()
  })
})

describe('needsRequoteConfirmation', () => {
  const shownRaw = parseUnits('100', 18)

  it('asks when the price fell further than the tolerance they set', () => {
    expect(
      needsRequoteConfirmation({ shownRaw, freshRaw: parseUnits('98', 18), slippagePct: 0.5 })
    ).toBe(true)
  })

  it('does not ask for a move inside their own tolerance', () => {
    // They have already said how much worse than the quote they will accept.
    expect(
      needsRequoteConfirmation({ shownRaw, freshRaw: parseUnits('99.7', 18), slippagePct: 0.5 })
    ).toBe(false)
  })

  it('never asks when the price improved', () => {
    expect(
      needsRequoteConfirmation({ shownRaw, freshRaw: parseUnits('105', 18), slippagePct: 0.5 })
    ).toBe(false)
  })

  it('does not ask at exactly the tolerance', () => {
    expect(
      needsRequoteConfirmation({ shownRaw, freshRaw: parseUnits('99.5', 18), slippagePct: 0.5 })
    ).toBe(false)
  })

  it('cannot ask when there is nothing to compare', () => {
    expect(
      needsRequoteConfirmation({ shownRaw: undefined, freshRaw: shownRaw, slippagePct: 0.5 })
    ).toBe(false)
  })
})

describe('routeChanged', () => {
  it('notices when re-pricing lands on the other router', () => {
    /*
     * An allowance granted to one PulseX router is worth nothing to the other.
     * Missing this sends the user to approve the router they are not trading
     * through, which fails, which sends them to approve it again - a loop with
     * a fee on every lap.
     */
    expect(routeChanged(PULSEX_ROUTER_V2, PULSEX_ROUTER_V1)).toBe(true)
  })

  it('is quiet when the route held', () => {
    expect(routeChanged(PULSEX_ROUTER_V2, PULSEX_ROUTER_V2)).toBe(false)
  })

  it('does not mistake casing for a different router', () => {
    // The two sides come from different places and wallets disagree about case.
    expect(routeChanged(PULSEX_ROUTER_V2.toLowerCase(), PULSEX_ROUTER_V2.toUpperCase().replace('0X', '0x'))).toBe(
      false
    )
  })

  it('claims nothing when either side is missing', () => {
    expect(routeChanged(null, PULSEX_ROUTER_V1)).toBe(false)
    expect(routeChanged(PULSEX_ROUTER_V2, null)).toBe(false)
  })
})

describe('probeTolerance', () => {
  it('stops the search a basis point from the quote', () => {
    expect(probeTolerance(10_000n)).toBe(1n)
    expect(probeTolerance(1_000_000n)).toBe(100n)
  })

  it('never returns zero, which would make the search unable to finish', () => {
    // hi - lo <= 0 is only true when they are equal, so a zero tolerance turns
    // the loop into one bounded solely by the probe budget - sixteen round
    // trips to resolve something a basis point would have settled.
    expect(probeTolerance(1n)).toBe(1n)
    expect(probeTolerance(0n)).toBe(1n)
    expect(probeTolerance(null)).toBe(1n)
  })
})

describe('probeStep', () => {
  it('halves the remaining gap', () => {
    expect(probeStep({ lo: 0n, hi: 1000n, tolerance: 1n, probesLeft: 10 })).toEqual({
      done: false,
      mid: 500n,
    })
  })

  it('always picks a point strictly inside the gap, so the search moves', () => {
    // A midpoint equal to lo would retest a floor already known to pass and
    // narrow nothing: the loop would spend its whole budget standing still.
    const { mid } = probeStep({ lo: 100n, hi: 102n, tolerance: 1n, probesLeft: 10 })
    expect(mid).toBeGreaterThan(100n)
    expect(mid).toBeLessThan(102n)
  })

  it('stops once the gap is within tolerance', () => {
    expect(probeStep({ lo: 0n, hi: 100n, tolerance: 100n, probesLeft: 10 })).toEqual({
      done: true,
      mid: null,
    })
  })

  it('stops when the probe budget runs out', () => {
    // Each step is a network round trip with a wallet waiting behind it.
    expect(probeStep({ lo: 0n, hi: 1_000_000n, tolerance: 1n, probesLeft: 0 })).toEqual({
      done: true,
      mid: null,
    })
  })

  it('terminates from any starting gap', () => {
    // The property the loop depends on. Without it the panel hangs with a
    // wallet waiting behind it.
    const quoted = 10n ** 24n
    const tolerance = probeTolerance(quoted)
    let lo = 0n
    let hi = quoted
    let steps = 0
    for (let probesLeft = 64; ; probesLeft -= 1) {
      const { done, mid } = probeStep({ lo, hi, tolerance, probesLeft })
      if (done) break
      steps += 1
      // The worst case for the search: every probe fails, so hi does all the
      // moving and the gap only ever closes from above.
      hi = mid
    }
    expect(steps).toBeLessThanOrEqual(14)
    expect(hi - lo).toBeLessThanOrEqual(tolerance)
  })

  it('needs a tolerance fixed to the quote, not to the shrinking gap', () => {
    /*
     * Computing it from `hi` inside the loop shrinks it exactly as fast as the
     * gap it is measured against, so `hi - lo <= tolerance` never comes true
     * and the search runs to its budget every time - sixteen round trips on
     * every taxed trade instead of fourteen, and no convergence guarantee at
     * all. The probe computes it once, before the loop, for this reason.
     */
    let lo = 0n
    let hi = 10n ** 24n
    let steps = 0
    for (let probesLeft = 64; ; probesLeft -= 1) {
      const { done, mid } = probeStep({ lo, hi, tolerance: probeTolerance(hi), probesLeft })
      if (done) break
      steps += 1
      hi = mid
    }
    expect(steps).toBe(64)
  })

  it('has nothing to do when the bounds have crossed', () => {
    expect(probeStep({ lo: 100n, hi: 100n, tolerance: 1n, probesLeft: 10 }).done).toBe(true)
    expect(probeStep({ lo: 200n, hi: 100n, tolerance: 1n, probesLeft: 10 }).done).toBe(true)
  })
})

describe('effectiveFeePct', () => {
  it('measures the part of the quote that never arrives', () => {
    // A real PulseChain token measured at 3.69% against a live pool.
    expect(effectiveFeePct({ quotedRaw: 10_000n, deliverableRaw: 9631n })).toBeCloseTo(3.69, 2)
  })

  it('reads a token that delivers the full quote as no fee at all', () => {
    expect(effectiveFeePct({ quotedRaw: 10_000n, deliverableRaw: 10_000n })).toBe(0)
  })

  it('does not report a negative fee', () => {
    // A rebasing token can deliver more than quoted. That is not a charge.
    expect(effectiveFeePct({ quotedRaw: 10_000n, deliverableRaw: 10_500n })).toBe(0)
  })

  it('has no answer without both figures', () => {
    expect(effectiveFeePct({ quotedRaw: 0n, deliverableRaw: 10n })).toBeNull()
    expect(effectiveFeePct({ quotedRaw: 10n, deliverableRaw: null })).toBeNull()
  })
})

describe('needsFeeConsent', () => {
  it('puts a real fee to the user', () => {
    // The floor is rebuilt so the trade is protected either way. What consent
    // covers is the fee: several percent going somewhere other than the user is
    // not something to find out afterwards from a wallet balance.
    expect(needsFeeConsent({ feePct: 3.69, acknowledgedPct: null })).toBe(true)
  })

  it('does not stop a trade over rounding dust', () => {
    // A notice on every swap is a notice nobody reads.
    expect(needsFeeConsent({ feePct: FEE_DUST_PCT, acknowledgedPct: null })).toBe(false)
    expect(needsFeeConsent({ feePct: 0.001, acknowledgedPct: null })).toBe(false)
  })

  it('does not ask twice for a fee already accepted', () => {
    expect(needsFeeConsent({ feePct: 3.69, acknowledgedPct: 3.69 })).toBe(false)
  })

  it('lets an acknowledgement cover a fee that eased', () => {
    expect(needsFeeConsent({ feePct: 3.0, acknowledgedPct: 3.69 })).toBe(false)
  })

  it('asks again when the fee rose above what was accepted', () => {
    expect(needsFeeConsent({ feePct: 9.0, acknowledgedPct: 3.69 })).toBe(true)
  })

  it('asks when there is no usable fee reading', () => {
    expect(needsFeeConsent({ feePct: null, acknowledgedPct: null })).toBe(false)
  })
})

describe('PROBE', () => {
  it('separates a node that will not answer from a trade that will not go through', () => {
    // Conflating them either refuses good swaps whenever an RPC is unwell, or
    // signs a doomed one because a node timed out.
    expect(PROBE.unavailable).not.toBe(PROBE.unsellable)
  })
})

describe('derivePhase: a token fee against a transaction already in flight', () => {
  const base = { block: SWAP_BLOCK.none, approval: APPROVAL.satisfied, isRejection: () => false }

  it('does not pull a pending swap back to a consent prompt', () => {
    /*
     * Phase decides whether inputs lock and whether quoting pauses, and the
     * button's own label comes from it. A fee notice surfacing over a swap
     * already sent would offer "Accept token fee & swap" on a transaction in
     * the mempool - and the press would send a second one.
     */
    expect(derivePhase({ ...base, tokenFee: true, swap: { pending: true } }).phase).toBe(
      SWAP_PHASE.swapping
    )
  })

  it('does not pull a confirming swap back either', () => {
    expect(derivePhase({ ...base, tokenFee: true, swap: { hash: '0xabc' } }).phase).toBe(
      SWAP_PHASE.swapConfirming
    )
  })

  it('does not reopen a finished swap', () => {
    expect(derivePhase({ ...base, tokenFee: true, swap: { outcome: 'success' } }).phase).toBe(
      SWAP_PHASE.success
    )
  })

  it('stays out of the way of an approval in flight', () => {
    expect(derivePhase({ ...base, tokenFee: true, approve: { pending: true } }).phase).toBe(
      SWAP_PHASE.approving
    )
  })

  it('yields to a price that moved, which is the more perishable of the two', () => {
    // Both want the same press to mean consent, so only one can be asked at a
    // time. A fee is a fixed property of the token and will still be there on
    // the next press; a stale price only gets staler.
    expect(derivePhase({ ...base, tokenFee: true, priceMoved: true }).phase).toBe(
      SWAP_PHASE.priceMoved
    )
  })

  it('is asked once nothing is in flight', () => {
    expect(derivePhase({ ...base, tokenFee: true }).phase).toBe(SWAP_PHASE.tokenFee)
  })

  it('offers a press that names what it consents to', () => {
    const action = swapAction({ phase: SWAP_PHASE.tokenFee, block: SWAP_BLOCK.none })
    expect(action.intent).toBe(SWAP_INTENT.acceptFee)
    expect(action.disabled).toBe(false)
    expect(action.label).not.toBe('Swap')
  })
})

describe('an approval started after a swap has settled', () => {
  const base = { block: SWAP_BLOCK.none, approval: APPROVAL.required, isRejection: () => false }

  it('is invisible while the settled swap is still in the record', () => {
    /*
     * Reproduces what a user hit on the live site. A swap had confirmed; their
     * wallet had not caught up, so they pressed Approve. The approval reached
     * the chain and succeeded - and the panel showed nothing about it, because
     * a successful swap outranks every approve rule and keeps doing so.
     *
     * This test pins the mechanism rather than the fix: given both, the swap
     * still wins. The fix is that the hook stops producing this state, by
     * clearing the settled swap when an approval starts.
     */
    expect(derivePhase({ ...base, swap: { outcome: 'success' }, approve: { pending: true } }).phase).toBe(
      SWAP_PHASE.success
    )
    expect(derivePhase({ ...base, swap: { outcome: 'success' }, approve: { hash: '0xa' } }).phase).toBe(
      SWAP_PHASE.success
    )
  })

  it('is visible once the settled swap has been cleared, which is what the fix does', () => {
    expect(derivePhase({ ...base, swap: {}, approve: { pending: true } }).phase).toBe(
      SWAP_PHASE.approving
    )
    expect(derivePhase({ ...base, swap: {}, approve: { hash: '0xa' } }).phase).toBe(
      SWAP_PHASE.approveConfirming
    )
  })

  it('leaves a settled swap unable to hold the inputs open behind it', () => {
    /*
     * The second half of the failure. `success` is deliberately not in flight,
     * so inputs unlock and quotes resume - and the next edit resets the record,
     * taking a live approval hash with it. An approval that is visible is also
     * in flight, which is what stops that.
     */
    expect(isSwapInFlight(SWAP_PHASE.success)).toBe(false)
    expect(isSwapInFlight(SWAP_PHASE.approving)).toBe(true)
    expect(isSwapInFlight(SWAP_PHASE.approveConfirming)).toBe(true)
  })

  it('still refuses to let a finished approval pull a running swap backwards', () => {
    // The precedence exists for a reason and must survive the fix.
    expect(
      derivePhase({ ...base, swap: { pending: true }, approve: { outcome: 'success' } }).phase
    ).toBe(SWAP_PHASE.swapping)
    expect(
      derivePhase({ ...base, swap: { hash: '0xs' }, approve: { outcome: 'success' } }).phase
    ).toBe(SWAP_PHASE.swapConfirming)
  })
})
