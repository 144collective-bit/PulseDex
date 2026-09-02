import { describe, it, expect } from 'vitest'
import { parseUnits } from 'viem'
import {
  SWAP_KIND,
  swapKind,
  needsApproval,
  minimumReceivedRaw,
  deadlineFrom,
  hasSufficientAllowance,
  buildApproveCall,
  buildAllowanceRead,
  buildSwapCall,
} from './swap'
import { NATIVE_PLS, WPLS, PULSEX_ROUTER_V2, PULSEX_ROUTER_V1 } from '../config/dex'

/*
 * The calls a swap is made of.
 *
 * Nothing here sends anything, which is exactly why it can be tested this
 * hard: every decision about what gets signed is arithmetic over a quote, and
 * arithmetic can be pinned exhaustively without a wallet or a fork.
 *
 * Three things would cost a user real money if they were wrong, and they get
 * the most attention below: the floor handed to the router as amountOutMin,
 * the deadline's units, and which router the approval is granted to.
 */

const TOKEN = { address: '0x1111111111111111111111111111111111111111', decimals: 18, symbol: 'AAA' }
const TOKEN_B = { address: '0x2222222222222222222222222222222222222222', decimals: 18, symbol: 'BBB' }
const USDC = { address: '0x3333333333333333333333333333333333333333', decimals: 6, symbol: 'USDC' }
const PLS = { address: NATIVE_PLS, decimals: 18, symbol: 'PLS' }
const RECIPIENT = '0x9999999999999999999999999999999999999999'

/** A quote as `quoteSwap` returns one. */
const quote = (over = {}) => ({
  amountOut: 100,
  amountOutRaw: parseUnits('100', 18),
  path: [TOKEN.address, TOKEN_B.address],
  router: PULSEX_ROUTER_V2,
  ...over,
})

const baseArgs = {
  quote: quote(),
  from: TOKEN,
  to: TOKEN_B,
  amount: '1',
  slippagePct: 0.5,
  recipient: RECIPIENT,
  deadlineMinutes: 20,
  nowMs: 1_700_000_000_000,
}

describe('swapKind', () => {
  it('picks the method from where native PLS sits', () => {
    expect(swapKind(PLS, TOKEN)).toBe(SWAP_KIND.ethForTokens)
    expect(swapKind(TOKEN, PLS)).toBe(SWAP_KIND.tokensForEth)
    expect(swapKind(TOKEN, TOKEN_B)).toBe(SWAP_KIND.tokensForTokens)
  })

  it('has no method for PLS against itself', () => {
    expect(swapKind(PLS, PLS)).toBeNull()
  })

  it('treats WPLS as an ordinary token, because it is one', () => {
    // Wrapped PLS is an ERC-20 with an allowance; only the native side is special.
    const wpls = { address: WPLS, decimals: 18, symbol: 'WPLS' }
    expect(swapKind(wpls, TOKEN)).toBe(SWAP_KIND.tokensForTokens)
    expect(needsApproval(wpls)).toBe(true)
  })

  it('has no method when a side is missing', () => {
    expect(swapKind(null, TOKEN)).toBeNull()
    expect(swapKind(TOKEN, null)).toBeNull()
  })
})

describe('needsApproval', () => {
  it('is false for native PLS, which has no allowance to grant', () => {
    // A panel showing an Approve step before a PLS sale describes a
    // transaction that cannot exist.
    expect(needsApproval(PLS)).toBe(false)
  })

  it('is true for any contract token', () => {
    expect(needsApproval(TOKEN)).toBe(true)
    expect(needsApproval(USDC)).toBe(true)
  })
})

describe('minimumReceivedRaw', () => {
  /*
   * This becomes amountOutMin. It is the only protection a trade has once it
   * is in the mempool, so it must never come out above the quote and never
   * silently become zero.
   */
  it('takes the tolerance off in exact integer arithmetic', () => {
    const out = parseUnits('100', 18)

    expect(minimumReceivedRaw(out, 0.5)).toBe(parseUnits('99.5', 18))
    expect(minimumReceivedRaw(out, 1)).toBe(parseUnits('99', 18))
    expect(minimumReceivedRaw(out, 0.1)).toBe(parseUnits('99.9', 18))
  })

  it('loses nothing on a figure too large for a float', () => {
    /*
     * The reason the raw output is carried through the quote at all. This
     * amount needs more significant digits than a double has, so computing the
     * floor from the displayed float would round the low end away.
     */
    const out = 123_456_789_012_345_678_901_234_567_890n

    const floor = minimumReceivedRaw(out, 1)

    expect(floor).toBe((out * 9_900n) / 10_000n)
    // And the float route really would have lost it, which is the point.
    expect(BigInt(Math.floor(Number(out) * 0.99))).not.toBe(floor)
  })

  it('never exceeds the quote at any tolerance', () => {
    const out = parseUnits('1234.5678', 18)
    for (const slip of [0, 0.1, 0.5, 1, 5, 50, 99.99]) {
      expect(minimumReceivedRaw(out, slip)).toBeLessThanOrEqual(out)
    }
  })

  it('returns the whole quote at zero tolerance', () => {
    const out = parseUnits('7', 18)
    expect(minimumReceivedRaw(out, 0)).toBe(out)
  })

  it('refuses a tolerance of 100% or more, which is no protection at all', () => {
    const out = parseUnits('100', 18)
    expect(minimumReceivedRaw(out, 100)).toBe(0n)
    expect(minimumReceivedRaw(out, 250)).toBe(0n)
  })

  it('refuses a negative tolerance, which would demand more than the quote', () => {
    expect(minimumReceivedRaw(parseUnits('100', 18), -1)).toBe(0n)
  })

  it('is zero for a missing or non-integer quote rather than NaN', () => {
    // A NaN reaching a router as amountOutMin is a trade with no floor.
    expect(minimumReceivedRaw(0n, 1)).toBe(0n)
    expect(minimumReceivedRaw(undefined, 1)).toBe(0n)
    expect(minimumReceivedRaw(100, 1)).toBe(0n) // a number, not a bigint
  })
})

describe('deadlineFrom', () => {
  it('is unix seconds, not milliseconds', () => {
    // Milliseconds would set a deadline fifty thousand years out, which is the
    // same as having none at all.
    const now = 1_700_000_000_000

    expect(deadlineFrom(now, 20)).toBe(1_700_000_000n + 1200n)
  })

  it('grows with the window', () => {
    const now = 1_700_000_000_000
    expect(deadlineFrom(now, 1)).toBe(1_700_000_060n)
    expect(deadlineFrom(now, 60)).toBe(1_700_000_000n + 3600n)
  })
})

describe('hasSufficientAllowance', () => {
  it('compares against the amount being spent, not against zero', () => {
    // Left over from a smaller trade is not nothing, but it is not enough.
    expect(hasSufficientAllowance(parseUnits('5', 18), parseUnits('10', 18))).toBe(false)
    expect(hasSufficientAllowance(parseUnits('10', 18), parseUnits('10', 18))).toBe(true)
    expect(hasSufficientAllowance(parseUnits('11', 18), parseUnits('10', 18))).toBe(true)
  })

  it('is false for anything that is not a pair of integers', () => {
    expect(hasSufficientAllowance(undefined, 1n)).toBe(false)
    expect(hasSufficientAllowance(1n, undefined)).toBe(false)
    expect(hasSufficientAllowance(10, 1n)).toBe(false)
  })
})

describe('buildApproveCall', () => {
  it('approves exactly what the trade spends, to the quoting router', () => {
    const amountRaw = parseUnits('10', 18)

    const call = buildApproveCall({ token: TOKEN, spender: PULSEX_ROUTER_V2, amountRaw })

    expect(call).toEqual({
      address: TOKEN.address,
      abi: expect.any(Array),
      functionName: 'approve',
      args: [PULSEX_ROUTER_V2, amountRaw],
    })
  })

  it('grants the allowance to whichever router quoted', () => {
    /*
     * V1 and V2 hold different pools, so `quoteSwap` picks per trade. An
     * approval granted to the other one is worthless: the swap reverts after
     * the user has already signed and paid for an approval.
     */
    const amountRaw = parseUnits('10', 18)

    for (const router of [PULSEX_ROUTER_V1, PULSEX_ROUTER_V2]) {
      const call = buildApproveCall({ token: TOKEN, spender: router, amountRaw })
      expect(call.args[0]).toBe(router)
    }
  })

  it('never grants an unlimited allowance', () => {
    const amountRaw = parseUnits('10', 18)
    const call = buildApproveCall({ token: TOKEN, spender: PULSEX_ROUTER_V2, amountRaw })

    expect(call.args[1]).toBe(amountRaw)
    expect(call.args[1]).toBeLessThan(2n ** 256n - 1n)
  })

  it('has nothing to build for native PLS', () => {
    expect(
      buildApproveCall({ token: PLS, spender: PULSEX_ROUTER_V2, amountRaw: 1n })
    ).toBeNull()
  })

  it('refuses a missing spender or a non-positive amount', () => {
    expect(buildApproveCall({ token: TOKEN, spender: null, amountRaw: 1n })).toBeNull()
    expect(buildApproveCall({ token: TOKEN, spender: PULSEX_ROUTER_V2, amountRaw: 0n })).toBeNull()
    expect(buildApproveCall({ token: TOKEN, spender: PULSEX_ROUTER_V2, amountRaw: 5 })).toBeNull()
  })
})

describe('buildAllowanceRead', () => {
  it('asks the token what the router may move on this owner behalf', () => {
    const read = buildAllowanceRead({
      token: TOKEN,
      owner: RECIPIENT,
      spender: PULSEX_ROUTER_V2,
    })

    expect(read.address).toBe(TOKEN.address)
    expect(read.functionName).toBe('allowance')
    expect(read.args).toEqual([RECIPIENT, PULSEX_ROUTER_V2])
  })

  it('has nothing to read for native PLS', () => {
    expect(
      buildAllowanceRead({ token: PLS, owner: RECIPIENT, spender: PULSEX_ROUTER_V2 })
    ).toBeNull()
  })
})

describe('buildSwapCall', () => {
  it('sends PLS as value, and does not repeat it as an argument', () => {
    const call = buildSwapCall({ ...baseArgs, from: PLS, to: TOKEN })

    expect(call.functionName).toBe('swapExactETHForTokensSupportingFeeOnTransferTokens')
    expect(call.value).toBe(parseUnits('1', 18))
    // amountOutMin, path, to, deadline - four, with no amountIn.
    expect(call.args).toHaveLength(4)
  })

  it('passes the amount as an argument and no value when selling a token', () => {
    const call = buildSwapCall({ ...baseArgs, from: TOKEN, to: PLS })

    expect(call.functionName).toBe('swapExactTokensForETHSupportingFeeOnTransferTokens')
    expect(call.value).toBe(0n)
    expect(call.args).toHaveLength(5)
    expect(call.args[0]).toBe(parseUnits('1', 18))
  })

  it('uses the token-to-token method when neither side is native', () => {
    const call = buildSwapCall(baseArgs)

    expect(call.functionName).toBe('swapExactTokensForTokensSupportingFeeOnTransferTokens')
    expect(call.value).toBe(0n)
  })

  it('always uses the fee-on-transfer variants', () => {
    // Taxed tokens are routine here and the plain methods revert against them.
    for (const [from, to] of [[PLS, TOKEN], [TOKEN, PLS], [TOKEN, TOKEN_B]]) {
      const call = buildSwapCall({ ...baseArgs, from, to })
      expect(call.functionName).toContain('SupportingFeeOnTransferTokens')
    }
  })

  it('scales the input by the sending token decimals', () => {
    const call = buildSwapCall({ ...baseArgs, from: USDC, amount: '1' })

    // 1 USDC is 1e6. Treating it as 1e18 would try to spend a trillion of them.
    expect(call.args[0]).toBe(1_000_000n)
  })

  it('sends to the connected wallet on every route, never to the router', () => {
    /*
     * Checked across all three, and by membership rather than by index: the
     * native path has no amountIn argument, so the recipient sits one place
     * earlier there and an index-based assertion silently skips it.
     */
    for (const [from, to] of [[PLS, TOKEN], [TOKEN, PLS], [TOKEN, TOKEN_B]]) {
      const call = buildSwapCall({ ...baseArgs, from, to })

      expect(call.args).toContain(RECIPIENT)
      // Sending the output to the router itself would burn it.
      expect(call.args).not.toContain(call.address)
    }
  })

  it('signs against the router that produced the quote', () => {
    // V1 and V2 hold different pools. Signing against the other one is a trade
    // priced on liquidity that is not there.
    const v1 = buildSwapCall({ ...baseArgs, quote: quote({ router: PULSEX_ROUTER_V1 }) })

    expect(v1.address).toBe(PULSEX_ROUTER_V1)
    expect(buildSwapCall(baseArgs).address).toBe(PULSEX_ROUTER_V2)
  })

  it('uses the path the quote priced, rather than rebuilding one', () => {
    const hopPath = [TOKEN.address, WPLS, TOKEN_B.address]
    const call = buildSwapCall({ ...baseArgs, quote: quote({ path: hopPath }) })

    expect(call.args[2]).toEqual(hopPath)
  })

  it('carries the floor derived from the raw quote', () => {
    const call = buildSwapCall({ ...baseArgs, slippagePct: 1 })

    expect(call.args[1]).toBe(minimumReceivedRaw(parseUnits('100', 18), 1))
  })

  it('sets the deadline in seconds from the given clock', () => {
    const call = buildSwapCall(baseArgs)

    expect(call.args[4]).toBe(1_700_000_000n + 1200n)
  })

  /* ---------------------------------------------------------------
     Refusals. Each of these would otherwise reach a wallet looking
     like an ordinary swap.
     --------------------------------------------------------------- */

  it('refuses to build a trade with no floor', () => {
    // 100% tolerance floors at zero, which is an unprotected trade.
    expect(buildSwapCall({ ...baseArgs, slippagePct: 100 })).toBeNull()
    // And a quote carrying no raw output cannot produce one either.
    expect(buildSwapCall({ ...baseArgs, quote: quote({ amountOutRaw: undefined }) })).toBeNull()
  })

  it('refuses an amount that is not a positive number', () => {
    for (const amount of ['0', '-1', 'abc', '', null, undefined]) {
      expect(buildSwapCall({ ...baseArgs, amount })).toBeNull()
    }
  })

  it('refuses without a recipient', () => {
    expect(buildSwapCall({ ...baseArgs, recipient: null })).toBeNull()
  })

  it('refuses without a quote', () => {
    expect(buildSwapCall({ ...baseArgs, quote: null })).toBeNull()
  })

  it('refuses a path that is not a real route', () => {
    expect(buildSwapCall({ ...baseArgs, quote: quote({ path: [TOKEN.address] }) })).toBeNull()
    expect(buildSwapCall({ ...baseArgs, quote: quote({ path: null }) })).toBeNull()
  })

  it('refuses PLS against itself', () => {
    expect(buildSwapCall({ ...baseArgs, from: PLS, to: PLS })).toBeNull()
  })
})
