import { publicClient as client } from './rpc'
import { withFloor } from './swap'
import { PROBE, probeStep, probeTolerance, effectiveFeePct } from './swapFlow'

/**
 * What a swap would actually deliver, measured rather than modelled.
 *
 * `getAmountsOut` knows the pool maths and nothing else. A token that takes a
 * fee on transfer breaks that model in a way the quote cannot see: the pair
 * receives less than was sent, or the recipient receives less than the pair
 * sent, and the router checks the recipient's balance change against the floor.
 * So the floor comes out above what can physically arrive and the swap reverts
 * with the gas already spent.
 *
 * The fix is to ask. `eth_call` runs the real function against real state
 * without sending anything, so the largest floor the trade still clears can be
 * found by trying floors - and that number is the deliverable amount, fee and
 * all, at this block, for this exact input.
 *
 * Priced accordingly: the first probe is the floor we were going to use anyway,
 * so a token that takes no fee - almost all of them - costs one call and stops.
 * Only a trade that would have reverted pays for the search.
 *
 * It catches more than fees, because it is the whole call: a missing allowance,
 * a balance that is short, an expired deadline and a token that cannot be sold
 * at any price all surface here, before the wallet is ever opened.
 */

/** Round trips the search may spend. Fourteen resolves a basis point. */
const MAX_PROBES = 16

/**
 * @returns {Promise<{status: string, deliverableRaw: bigint|null, feePct: number|null, error: unknown}>}
 */
export async function probeDeliverable({ call, account, quotedRaw, floorRaw }) {
  if (!call || !account || typeof quotedRaw !== 'bigint' || typeof floorRaw !== 'bigint') {
    return { status: PROBE.unavailable, deliverableRaw: null, feePct: null, error: null }
  }

  let unsupported = null

  /** @returns {Promise<true|Error>} */
  const attempt = async (floor) => {
    const probe = withFloor(call, floor)
    if (!probe) return new Error('Could not build the probe call')
    try {
      await client.simulateContract({ ...probe, account })
      return true
    } catch (err) {
      /*
       * A node that will not simulate at all is not the same as a trade that
       * will not go through, and must not be reported as one. Held aside so
       * the caller can fall back to the unprobed floor rather than refuse a
       * swap that is perfectly good.
       */
      if (isUnsupported(err)) unsupported = err
      return err
    }
  }

  const atFloor = await attempt(floorRaw)
  if (atFloor === true) {
    return { status: PROBE.ok, deliverableRaw: null, feePct: null, error: null }
  }
  if (unsupported) {
    return { status: PROBE.unavailable, deliverableRaw: null, feePct: null, error: unsupported }
  }

  // Nothing above zero is achievable either, so the floor was never the
  // problem. The error from this attempt is the one worth reporting: it is the
  // trade's own reason for failing, with slippage taken out of the picture.
  const atZero = await attempt(0n)
  if (atZero !== true) {
    return { status: PROBE.unsellable, deliverableRaw: null, feePct: null, error: atZero }
  }
  if (unsupported) {
    return { status: PROBE.unavailable, deliverableRaw: null, feePct: null, error: unsupported }
  }

  /*
   * Somewhere between nothing and the floor we wanted. `lo` is always a floor
   * that passed and `hi` one that failed, so stopping early still leaves a
   * usable answer - it is only a less precise one.
   */
  let lo = 0n
  let hi = floorRaw
  const tolerance = probeTolerance(quotedRaw)

  for (let probesLeft = MAX_PROBES; ; probesLeft -= 1) {
    const { done, mid } = probeStep({ lo, hi, tolerance, probesLeft })
    if (done) break
    if ((await attempt(mid)) === true) lo = mid
    else hi = mid
    if (unsupported) {
      return { status: PROBE.unavailable, deliverableRaw: null, feePct: null, error: unsupported }
    }
  }

  return {
    status: PROBE.fee,
    deliverableRaw: lo,
    feePct: effectiveFeePct({ quotedRaw, deliverableRaw: lo }),
    error: null,
  }
}

/**
 * Whether the node declined to answer, rather than answering "it would fail".
 *
 * A revert arrives as a decoded reason; a transport that is down, timing out or
 * rate limiting arrives as something else entirely. Only the first is evidence
 * about the trade.
 */
function isUnsupported(err) {
  const name = err?.name ?? ''
  if (name === 'ContractFunctionRevertedError') return false
  if (err?.cause?.name === 'ContractFunctionRevertedError') return false

  const text = `${err?.shortMessage ?? ''} ${err?.message ?? ''}`.toLowerCase()
  if (text.includes('reverted') || text.includes('execution reverted')) return false

  return true
}
