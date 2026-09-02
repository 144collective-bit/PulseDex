import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTopPulsePairs, searchPulsePairs } from '../services/dexscreener'
import { tokensFromPairs, mergeWithCurated, rankTokens } from '../services/tokenList'

/**
 * Everything the picker can offer, and a way to find what it cannot.
 *
 * Two sources, because one is not enough. The top pairs the app already fetches
 * cover the tokens with real markets - a few hundred - and that is what the
 * list is built from. Anything outside it is still reachable by typing, which
 * asks DexScreener directly rather than telling the user to go and find a
 * contract address.
 *
 * The query key matches the one the dashboard's market data uses, so opening
 * the picker reuses a fetch the app has usually already made rather than
 * repeating twenty-odd requests to say the same thing.
 */
export function useTradableTokens() {
  const { data: pairs, isLoading } = useQuery({
    queryKey: ['topPulsePairs'],
    queryFn: getTopPulsePairs,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  })

  const tokens = useMemo(() => mergeWithCurated(tokensFromPairs(pairs || [])), [pairs])

  return { tokens, isLoading }
}

/**
 * A live lookup, for a token with no market deep enough to be in the list.
 *
 * Only runs once a query is long enough to mean something - a single character
 * matches most of the chain and none of it usefully - and only when the local
 * list has already come up short, which the caller decides.
 */
export function useTokenSearch(query, { enabled = true } = {}) {
  const trimmed = (query || '').trim()

  const { data: pairs, isFetching } = useQuery({
    queryKey: ['tokenSearch', trimmed.toLowerCase()],
    queryFn: () => searchPulsePairs(trimmed),
    enabled: Boolean(enabled && trimmed.length >= 2),
    staleTime: 60_000,
    retry: 0,
  })

  const tokens = useMemo(() => {
    if (!pairs?.length) return []
    // Ranked against the same query, so a search result that is a poor answer
    // does not outrank a good one just for having arrived from the network.
    return rankTokens(tokensFromPairs(pairs), { query: trimmed, limit: 20 })
  }, [pairs, trimmed])

  return { tokens, isFetching }
}

export default useTradableTokens
