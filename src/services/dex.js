import { createPublicClient, http, parseUnits, formatUnits } from 'viem'
import { pulsechain } from '../config/pulsechain'
import {
  PULSEX_ROUTER_V2,
  PULSEX_ROUTER_V1,
  ROUTER_ABI,
  WPLS,
  NATIVE_PLS,
} from '../config/dex'

/**
 * Swap quoting against PulseX.
 *
 * Read-only. Nothing here signs or sends a transaction - getAmountsOut is a
 * view call, so a quote can never move funds.
 */

const client = createPublicClient({
  chain: pulsechain,
  transport: http('https://rpc.pulsechain.com'),
})

/** Native PLS has no contract, so it is routed through WPLS. */
function toPathAddress(token) {
  return token.address === NATIVE_PLS ? WPLS : token.address
}

/**
 * Build the swap path. Direct if a pair plausibly exists, otherwise hop through
 * WPLS, which is the quote asset for nearly every PulseChain market.
 */
export function buildPath(from, to) {
  const a = toPathAddress(from)
  const b = toPathAddress(to)
  if (a.toLowerCase() === b.toLowerCase()) return null

  const viaWpls = [a, WPLS, b]
  const direct = [a, b]

  // A pair involving WPLS is always direct; anything else may need the hop.
  const touchesWpls =
    a.toLowerCase() === WPLS.toLowerCase() || b.toLowerCase() === WPLS.toLowerCase()

  return touchesWpls ? [direct] : [direct, viaWpls]
}

async function amountsOut(router, amountIn, path) {
  return client.readContract({
    address: router,
    abi: ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [amountIn, path],
  })
}

/**
 * Quote a swap.
 *
 * Tries each candidate path and keeps the best output, so a token with no
 * direct pair still quotes through WPLS. Falls back from the V2 router to V1
 * if a call fails outright.
 */
export async function quoteSwap({ from, to, amount }) {
  if (!from || !to || !amount) return null

  const parsed = Number(amount)
  if (!isFinite(parsed) || parsed <= 0) return null

  const paths = buildPath(from, to)
  if (!paths) return null

  const amountIn = parseUnits(String(amount), from.decimals)

  let best = null
  for (const router of [PULSEX_ROUTER_V2, PULSEX_ROUTER_V1]) {
    for (const path of paths) {
      try {
        const amounts = await amountsOut(router, amountIn, path)
        const out = amounts[amounts.length - 1]
        if (!best || out > best.raw) {
          best = { raw: out, path, router, amounts }
        }
      } catch {
        // A path with no pool reverts. That is expected, not an error - try the
        // next candidate rather than failing the whole quote.
      }
    }
    if (best) break
  }

  if (!best) return null

  const outAmount = parseFloat(formatUnits(best.raw, to.decimals))
  const rate = outAmount / parsed

  /*
   * Price impact is measured against the rate for a very small trade, which
   * approximates the spot price. Comparing execution to spot is what tells a
   * user their own trade is moving the pool.
   */
  let impact = null
  try {
    const probeIn = parseUnits('0.0001', from.decimals)
    const probe = await amountsOut(best.router, probeIn, best.path)
    const probeOut = parseFloat(formatUnits(probe[probe.length - 1], to.decimals))
    const spotRate = probeOut / 0.0001
    if (spotRate > 0) impact = Math.max(0, ((spotRate - rate) / spotRate) * 100)
  } catch {
    // Impact is advisory; a failed probe should not void a usable quote.
  }

  return {
    amountIn: parsed,
    amountOut: outAmount,
    rate,
    impact,
    path: best.path,
    hops: best.path.length - 1,
    router: best.router,
    routerLabel: best.router === PULSEX_ROUTER_V2 ? 'PulseX V2' : 'PulseX V1',
  }
}

/** Minimum received once slippage tolerance is applied. */
export function minimumReceived(amountOut, slippagePct) {
  if (!amountOut) return 0
  return amountOut * (1 - slippagePct / 100)
}
