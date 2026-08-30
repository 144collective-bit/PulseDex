import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPairsByTokens } from '../services/dexscreener'
import { WPLS, NATIVE_PLS } from '../config/dex'

/** The address to look a token up by. Native PLS trades as WPLS. */
function lookupAddress(token) {
  if (!token) return null
  if (token.isNative || token.address === NATIVE_PLS) return WPLS
  return token.address
}

/**
 * A pool needs at least this much 24h activity before its price is treated as
 * the token's reference. Parked liquidity is not a market.
 */
const MIN_REFERENCE_TXNS = 10

const txnCount = (pair) =>
  Number(pair?.txns?.h24?.buys || 0) + Number(pair?.txns?.h24?.sells || 0)

/**
 * The pool that best represents a token.
 *
 * Deepest wins, but only among pools that actually trade. Ranking on liquidity
 * alone picks up dead pools with large parked balances: eHEX's deepest pool is
 * eHEX/NananaX at $995K with one transaction in 24 hours, quoting $0.001378,
 * while the real market is eHEX/WPLS at $394K with 1,729 transactions quoting
 * $0.001407. The same counterparty token distorted the PLS price earlier in
 * this project for exactly this reason.
 */
function deepestFor(pairs, address) {
  if (!address) return null
  const target = address.toLowerCase()

  const byDepth = pairs
    .filter((p) => p.baseToken?.address?.toLowerCase() === target)
    .sort(
      (a, b) =>
        parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0)
    )

  const traded = byDepth.filter((p) => txnCount(p) >= MIN_REFERENCE_TXNS)

  // A token that genuinely has no active market still gets its deepest pool
  // rather than nothing at all.
  return traded[0] || byDepth[0] || null
}

/**
 * The pair whose chart and figures represent a token.
 *
 * Prefers a pool already in the board's list so switching between the majors
 * costs nothing, and only reaches for the network when the token isn't there -
 * the picker accepts any address, so most of them won't be.
 *
 * Deepest pool wins. Picking by volume or by whatever comes back first lands
 * on junk pairs: WPLS is the quote side of nearly every market on this chain,
 * so a shallow pool with a burst of wash trading can outrank the real one.
 */
export function useSubjectPair(token, pairs = []) {
  const address = lookupAddress(token)

  const local = useMemo(() => deepestFor(pairs, address), [pairs, address])

  const { data: fetched, isLoading } = useQuery({
    queryKey: ['subjectPair', address?.toLowerCase()],
    enabled: Boolean(address) && !local,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => deepestFor(await getPairsByTokens([address]), address),
  })

  return {
    pair: local || fetched || null,
    isLoading: !local && isLoading,
  }
}
