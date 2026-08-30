import { useQuery } from '@tanstack/react-query'
import { findDirectPools } from '../services/dex'
import { getPulsePair, getPairsByTokens } from '../services/dexscreener'
import { CURATED_TOKENS, WPLS, NATIVE_PLS } from '../config/dex'

const liquidityOf = (pair) => parseFloat(pair?.liquidity?.usd || 0)

const wplsToken = () =>
  CURATED_TOKENS.find((t) => t.address === NATIVE_PLS) || {
    symbol: 'PLS',
    address: NATIVE_PLS,
  }

const isWpls = (token) =>
  token?.isNative ||
  token?.address === NATIVE_PLS ||
  token?.address?.toLowerCase() === WPLS.toLowerCase()

/** The address a token trades under. Native PLS trades as WPLS. */
const tradeAddress = (token) =>
  isWpls(token) ? WPLS.toLowerCase() : token?.address?.toLowerCase() || null

/** True when a DexScreener pair holds both of these addresses. */
function holdsBoth(pair, a, b) {
  const base = pair?.baseToken?.address?.toLowerCase()
  const quote = pair?.quoteToken?.address?.toLowerCase()
  return (base === a && quote === b) || (base === b && quote === a)
}

/**
 * Every pool holding both tokens, deepest first.
 *
 * Two sources, because neither is complete on its own:
 *
 *   The PulseX factories are authoritative but only know PulseX. They are
 *   asked because DexScreener's token endpoint caps at 30 pairs and therefore
 *   reports pools that plainly exist as missing - a $972K WPLS/DAI pool
 *   returns zero results from the DAI side and seven from the WPLS side.
 *
 *   DexScreener queried from both token sides catches the other venues, 9mm
 *   and LibertySwap among them, which no PulseX factory can see. Querying both
 *   sides rather than one halves the chance the cap hides the answer.
 */
async function collectPools(a, b) {
  const addrA = tradeAddress(a)
  const addrB = tradeAddress(b)
  if (!addrA || !addrB || addrA === addrB) return []

  const [factoryAddresses, sideA, sideB] = await Promise.all([
    findDirectPools(a, b).catch(() => []),
    getPairsByTokens([addrA]).catch(() => []),
    getPairsByTokens([addrB]).catch(() => []),
  ])

  const byAddress = new Map()
  for (const pair of [...sideA, ...sideB]) {
    if (holdsBoth(pair, addrA, addrB) && pair.pairAddress) {
      byAddress.set(pair.pairAddress.toLowerCase(), pair)
    }
  }

  // Only fetch factory pools the listing didn't already carry.
  const missing = factoryAddresses.filter((addr) => !byAddress.has(addr.toLowerCase()))
  const fetched = await Promise.all(missing.map((addr) => getPulsePair(addr).catch(() => null)))
  for (const pair of fetched) {
    if (pair?.pairAddress) byAddress.set(pair.pairAddress.toLowerCase(), pair)
  }

  return [...byAddress.values()].sort((x, y) => liquidityOf(y) - liquidityOf(x))
}

/**
 * Every pool the two selected tokens can be traded through.
 *
 * `direct` holds both tokens. `route` holds the legs a trade takes when there
 * is no usable direct pool - those are real pools the user may want to look at
 * too, so they are offered rather than hidden.
 *
 * `kind` describes what the terminal should lead with:
 *
 *   direct - the two tokens share a pool with real depth
 *   route  - no usable direct pool, so the legs are the story
 *   none   - nothing found either way
 *
 * A direct pool always leads, whatever its depth. Thin ones are charted with a
 * warning rather than swapped out: eHEX/DAI holds $115, and a couple of trades
 * in it draw what looks like a 90% move - which is worth seeing before you
 * trade against it, not worth hiding.
 */
export function usePairRoute(fromToken, toToken) {
  const enabled = Boolean(fromToken && toToken)

  const { data, isLoading } = useQuery({
    queryKey: [
      'pairRoute',
      fromToken?.address?.toLowerCase(),
      toToken?.address?.toLowerCase(),
    ],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const direct = await collectPools(fromToken, toToken)
      const best = direct[0] || null

      // One side is already PLS, so there is no hop - whatever direct pools
      // exist are the whole story.
      if (isWpls(fromToken) || isWpls(toToken)) {
        return {
          kind: best ? 'direct' : 'none',
          direct,
          route: [],
          defaultPair: best,
        }
      }

      const hop = wplsToken()
      const [firstLeg, secondLeg] = await Promise.all([
        collectPools(fromToken, hop),
        collectPools(hop, toToken),
      ])

      // One pool per leg on the menu - the deepest. Listing every PLS pool for
      // both tokens would bury the direct pools the user actually asked about.
      const route = [firstLeg[0], secondLeg[0]].filter(Boolean)

      return {
        // The pair the user selected always leads, however thin its pool. A
        // thin market is a fact about that pair worth seeing, not a reason to
        // silently chart a different one - the warning above the chart carries
        // the caution, and the route legs stay one click away in the menu.
        kind: best ? 'direct' : route.length ? 'route' : 'none',
        direct,
        route,
        defaultPair: best || route[0] || null,
      }
    },
  })

  return { route: data || null, isLoading: enabled && isLoading }
}
