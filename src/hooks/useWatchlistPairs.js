import { useQuery } from '@tanstack/react-query'
import { getPulsePair } from '../services/dexscreener'

/**
 * Full pair data for every watchlisted address.
 *
 * The watchlist used to be a filter over the board's top pairs, which meant a
 * starred pair vanished from the list the moment it stopped trending - the
 * badge still counted it, so the tab read "(1)" above an empty list and looked
 * broken. Anything the board is not currently carrying is fetched by its own
 * address instead.
 *
 * One request per missing pair rather than a batched call: DexScreener caps a
 * multi-token response at 30 pairs, and a watchlist is exactly the kind of
 * list that grows past that.
 */
export function useWatchlistPairs(watchlist = [], pairs = []) {
  const known = new Map(
    pairs.filter((p) => p.pairAddress).map((p) => [p.pairAddress.toLowerCase(), p])
  )

  const missing = watchlist.filter((address) => !known.has(address?.toLowerCase()))

  const { data: fetched = [], isLoading } = useQuery({
    queryKey: ['watchlistPairs', [...missing].sort().join(',')],
    enabled: missing.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const results = await Promise.all(
        missing.map((address) => getPulsePair(address).catch(() => null))
      )
      return results.filter(Boolean)
    },
  })

  // Ordered by the watchlist itself, so the list does not reshuffle when a
  // pair drops in or out of the board's feed.
  const byAddress = new Map(known)
  for (const pair of fetched) {
    if (pair?.pairAddress) byAddress.set(pair.pairAddress.toLowerCase(), pair)
  }

  return {
    watchlistPairs: watchlist
      .map((address) => byAddress.get(address?.toLowerCase()))
      .filter(Boolean),
    isLoading: missing.length > 0 && isLoading,
  }
}
