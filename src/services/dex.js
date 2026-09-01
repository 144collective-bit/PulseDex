import { parseUnits, formatUnits } from 'viem'
import { publicClient as client } from './rpc'
import {
  PULSEX_ROUTER_V2,
  PULSEX_ROUTER_V1,
  PULSEX_FACTORY_V2,
  PULSEX_FACTORY_V1,
  ROUTER_ABI,
  FACTORY_ABI,
  WPLS,
  NATIVE_PLS,
} from '../config/dex'

/**
 * Swap quoting against PulseX.
 *
 * Read-only. Nothing here signs or sends a transaction - getAmountsOut is a
 * view call, so a quote can never move funds.
 */

/** Minimal ERC20 surface: just what's needed to price a token safely. */
const ERC20_ABI = [
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
]

/**
 * Read a token the curated list doesn't carry.
 *
 * Decimals have to come from the chain rather than be assumed. parseUnits
 * scales the input amount by them, so treating a 6-decimal token like USDC as
 * 18 would misprice a quote by a factor of a trillion - and it would render as
 * a perfectly ordinary-looking number.
 */
export async function fetchTokenMeta(address) {
  if (!address) return null

  const [decimals, symbol] = await Promise.all([
    client.readContract({ address, abi: ERC20_ABI, functionName: 'decimals' }),
    client
      .readContract({ address, abi: ERC20_ABI, functionName: 'symbol' })
      .catch(() => null),
  ])

  if (decimals === undefined || decimals === null) return null

  return {
    address,
    symbol: symbol || '???',
    name: symbol || 'Unknown token',
    decimals: Number(decimals),
    // Not on the curated list, so the picker flags it: three separate tokens
    // on this chain answer to "PRVX".
    verified: false,
  }
}

/** Native PLS has no contract, so it is routed through WPLS. */
function toPathAddress(token) {
  return token.address === NATIVE_PLS ? WPLS : token.address
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/**
 * Every PulseX pool holding both tokens, as pair addresses.
 *
 * Asked of the factories rather than derived from DexScreener's token
 * endpoint, which caps its response at 30 pairs and therefore reports pools
 * that plainly exist as missing: a $972K WPLS/DAI pool returns zero results
 * when queried from the DAI side and seven from the WPLS side. A factory is
 * deterministic and cannot truncate.
 *
 * Argument order does not matter - the factory sorts the two tokens itself, so
 * getPair(INC, PRVX) and getPair(PRVX, INC) are the same pool.
 */
export async function findDirectPools(tokenA, tokenB) {
  if (!tokenA || !tokenB) return []
  const a = toPathAddress(tokenA)
  const b = toPathAddress(tokenB)
  if (!a || !b || a.toLowerCase() === b.toLowerCase()) return []

  const results = await Promise.all(
    [PULSEX_FACTORY_V2, PULSEX_FACTORY_V1].map((factory) =>
      client
        .readContract({
          address: factory,
          abi: FACTORY_ABI,
          functionName: 'getPair',
          args: [a, b],
        })
        .catch(() => null)
    )
  )

  return [...new Set(results.filter((addr) => addr && addr !== ZERO_ADDRESS))]
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
