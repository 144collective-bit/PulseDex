import { useQuery } from '@tanstack/react-query'
import { getPairsByTokens } from '../services/dexscreener'
import { WPLS } from '../config/dex'

/**
 * USD price for one token, read from its deepest pool.
 *
 * One request per token rather than a batched call: DexScreener caps a
 * multi-token response at 30 pairs in total, so batching silently starves
 * whichever token is asked for last and it comes back priced at zero.
 *
 * A pair's `priceUsd` belongs to its base token, so pools where our token sits
 * on the quote side are skipped rather than misread as its price. Native PLS
 * is priced through WPLS, which is the same asset with a contract.
 */
export function useTokenUsdPrice(token) {
  const address = token?.isNative ? WPLS : token?.address

  return useQuery({
    queryKey: ['tokenUsdPrice', address?.toLowerCase()],
    enabled: Boolean(address),
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const pairs = await getPairsByTokens([address])
      const target = address.toLowerCase()

      const priced = pairs
        .filter((p) => p.baseToken?.address?.toLowerCase() === target)
        .filter((p) => parseFloat(p.priceUsd || 0) > 0)
        .sort(
          (a, b) =>
            parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0)
        )

      return priced.length ? parseFloat(priced[0].priceUsd) : null
    },
  })
}
