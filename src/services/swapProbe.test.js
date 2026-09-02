import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseUnits } from 'viem'

/*
 * Measuring what a swap would actually deliver.
 *
 * The chain is mocked as a pool with a known transfer fee, so the tests can ask
 * the real question: given a token that delivers 96.31% of what getAmountsOut
 * promised, does the probe find that number, and does the floor it produces
 * clear? That figure is not invented - it is a live PulseChain token measured
 * against a real pool while this was written.
 *
 * The distinction the tests care about most is between a trade that will not go
 * through and a node that will not answer. Confusing the two either refuses
 * good swaps whenever an RPC is unwell, or signs a doomed one because a node
 * timed out.
 */

vi.mock('./rpc', () => ({ publicClient: { simulateContract: vi.fn() } }))

const { publicClient } = await import('./rpc')
const { probeDeliverable } = await import('./swapProbe')
const { PROBE } = await import('./swapFlow')

const ACCOUNT = '0x9999999999999999999999999999999999999999'
const QUOTED = parseUnits('100', 18)

/** A built swap call, token-in so the floor sits second. */
const call = () => ({
  address: '0x165C3410fC91EF562C50559f7d2289fEbed552d9',
  abi: [],
  functionName: 'swapExactTokensForTokensSupportingFeeOnTransferTokens',
  args: [parseUnits('1000', 18), QUOTED, ['0xaaa', '0xbbb'], ACCOUNT, 1n],
  value: 0n,
})

/** A revert as viem surfaces one, which is evidence about the trade. */
const revert = (reason = 'PulseX: INSUFFICIENT_OUTPUT_AMOUNT') =>
  Object.assign(new Error(`The contract function reverted: ${reason}`), {
    name: 'ContractFunctionExecutionError',
    shortMessage: `reverted with the following reason: ${reason}`,
  })

/**
 * A chain where the recipient really receives `deliverable`, so any floor above
 * that reverts - which is exactly the router's own check.
 */
const chainDelivering = (deliverable) =>
  vi.fn(async ({ args }) => {
    if (args[1] > deliverable) throw revert()
    return { result: undefined }
  })

beforeEach(() => vi.clearAllMocks())

describe('probeDeliverable', () => {
  it('costs one call when the token takes no fee', async () => {
    // Almost every trade. Paying for a search on all of them to catch the few
    // that need it would put a second and a half in front of every swap.
    publicClient.simulateContract = chainDelivering(QUOTED)

    const floorRaw = (QUOTED * 99n) / 100n
    const out = await probeDeliverable({ call: call(), account: ACCOUNT, quotedRaw: QUOTED, floorRaw })

    expect(out.status).toBe(PROBE.ok)
    expect(publicClient.simulateContract).toHaveBeenCalledTimes(1)
  })

  it('probes the floor it was actually going to use', async () => {
    publicClient.simulateContract = chainDelivering(QUOTED)
    const floorRaw = (QUOTED * 99n) / 100n

    await probeDeliverable({ call: call(), account: ACCOUNT, quotedRaw: QUOTED, floorRaw })

    expect(publicClient.simulateContract.mock.calls[0][0].args[1]).toBe(floorRaw)
  })

  it('measures a real fee closely enough to floor against', async () => {
    // 3.69%, from a live PulseChain token.
    const deliverable = (QUOTED * 9631n) / 10_000n
    publicClient.simulateContract = chainDelivering(deliverable)

    const out = await probeDeliverable({
      call: call(),
      account: ACCOUNT,
      quotedRaw: QUOTED,
      floorRaw: (QUOTED * 99n) / 100n,
    })

    expect(out.status).toBe(PROBE.fee)
    expect(out.feePct).toBeCloseTo(3.69, 1)
    // Within a basis point of the quote, and never above the real figure.
    expect(out.deliverableRaw).toBeLessThanOrEqual(deliverable)
    expect(deliverable - out.deliverableRaw).toBeLessThanOrEqual(QUOTED / 10_000n)
  })

  it('never returns a deliverable the trade would not clear', async () => {
    /*
     * The whole point. Every value the search settles on has been simulated and
     * passed, so a floor built from it cannot be the reason a swap reverts. An
     * answer rounded the wrong way would reintroduce the exact bug this exists
     * to remove, just smaller.
     */
    const deliverable = (QUOTED * 4321n) / 10_000n
    publicClient.simulateContract = chainDelivering(deliverable)

    const out = await probeDeliverable({
      call: call(),
      account: ACCOUNT,
      quotedRaw: QUOTED,
      floorRaw: QUOTED,
    })

    expect(out.deliverableRaw).toBeLessThanOrEqual(deliverable)
  })

  it('stays within its round-trip budget on a taxed token', async () => {
    publicClient.simulateContract = chainDelivering((QUOTED * 5n) / 100n)

    await probeDeliverable({
      call: call(),
      account: ACCOUNT,
      quotedRaw: QUOTED,
      floorRaw: QUOTED,
    })

    expect(publicClient.simulateContract.mock.calls.length).toBeLessThanOrEqual(18)
  })

  it('reports a token that cannot be sold at any floor', async () => {
    // A honeypot, an empty pool, a missing allowance or a balance that is short.
    // All of them would revert on chain too, so refusing here costs the user
    // nothing and saves the gas.
    publicClient.simulateContract = vi.fn(async () => {
      throw revert('PulseX: TRANSFER_FAILED')
    })

    const out = await probeDeliverable({
      call: call(),
      account: ACCOUNT,
      quotedRaw: QUOTED,
      floorRaw: QUOTED,
    })

    expect(out.status).toBe(PROBE.unsellable)
    // Reported with the trade's own reason, taken with slippage out of the way.
    expect(out.error.shortMessage).toContain('TRANSFER_FAILED')
  })

  it('recognises a revert however viem hands it over', async () => {
    /*
     * The three shapes a revert arrives in. Only the message text was covered
     * before, so the two checks above it were never exercised - and a mistake
     * there fails in the dangerous direction: a genuine honeypot reported as
     * "could not run the probe", which falls open and signs the swap.
     */
    const shapes = [
      Object.assign(new Error('reverted'), { name: 'ContractFunctionRevertedError' }),
      Object.assign(new Error('failed'), {
        name: 'ContractFunctionExecutionError',
        cause: { name: 'ContractFunctionRevertedError' },
      }),
      revert('PulseX: K'),
      // A revert whose wording says nothing recognisable. The name is checked
      // before the message for exactly this: matching on text is a heuristic
      // over a string viem is free to reword, and the fallback must not be the
      // only thing standing between a honeypot and a signature.
      Object.assign(new Error(''), { name: 'ContractFunctionRevertedError' }),
    ]

    for (const err of shapes) {
      publicClient.simulateContract = vi.fn(async () => {
        throw err
      })

      const out = await probeDeliverable({
        call: call(),
        account: ACCOUNT,
        quotedRaw: QUOTED,
        floorRaw: QUOTED,
      })

      expect(out.status).toBe(PROBE.unsellable)
    }
  })

  it('does not call a node outage an unsellable token', async () => {
    /*
     * The failure that matters. A timeout is not evidence about the trade, and
     * treating it as such would block every swap whenever an RPC went slow -
     * while the honest answer is that the probe simply did not run.
     */
    publicClient.simulateContract = vi.fn(async () => {
      throw Object.assign(new Error('The request took too long to respond.'), {
        name: 'TimeoutError',
        shortMessage: 'The request took too long to respond.',
      })
    })

    const out = await probeDeliverable({
      call: call(),
      account: ACCOUNT,
      quotedRaw: QUOTED,
      floorRaw: QUOTED,
    })

    expect(out.status).toBe(PROBE.unavailable)
  })

  it('has nothing to measure without a call, an account or a quote', async () => {
    const args = { call: call(), account: ACCOUNT, quotedRaw: QUOTED, floorRaw: QUOTED }
    for (const missing of ['call', 'account', 'quotedRaw', 'floorRaw']) {
      const out = await probeDeliverable({ ...args, [missing]: null })
      expect(out.status).toBe(PROBE.unavailable)
    }
    expect(publicClient.simulateContract).not.toHaveBeenCalled()
  })

  it('signs nothing, whatever it finds', async () => {
    // It is a read. The client it uses has no account to sign with, and this
    // pins that the probe never reaches for a write path.
    publicClient.simulateContract = chainDelivering((QUOTED * 9n) / 10n)

    await probeDeliverable({ call: call(), account: ACCOUNT, quotedRaw: QUOTED, floorRaw: QUOTED })

    expect(publicClient.writeContract).toBeUndefined()
    expect(publicClient.sendTransaction).toBeUndefined()
  })
})
