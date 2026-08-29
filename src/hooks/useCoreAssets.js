import { useQuery } from '@tanstack/react-query'
import { getCoreAssets } from '../services/coreAssets'
import { CORE_POLL_INTERVAL } from '../config/coreAssets'

/**
 * Market data plus on-chain supply for the Home board's core assets.
 */
export function useCoreAssets() {
  return useQuery({
    queryKey: ['coreAssets'],
    queryFn: getCoreAssets,
    refetchInterval: CORE_POLL_INTERVAL,
    staleTime: 15000,
    // Hold the previous board while a refresh is in flight, so the cards never
    // blank out mid-poll.
    placeholderData: (prev) => prev,
  })
}
