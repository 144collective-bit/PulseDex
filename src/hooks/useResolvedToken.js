import { useQuery } from '@tanstack/react-query'
import { fetchTokenMeta } from '../services/dex'
import {
  CURATED_TOKENS,
  WPLS,
  NATIVE_PLS,
  NATIVE_PLS_PLACEHOLDER,
} from '../config/dex'

/** Curated match for an address, treating WPLS as native PLS. */
export function curatedToken(address) {
  if (!address) return null
  const lower = String(address).toLowerCase()
  if (
    lower === WPLS.toLowerCase() ||
    lower === NATIVE_PLS.toLowerCase() ||
    lower === NATIVE_PLS_PLACEHOLDER
  ) {
    return CURATED_TOKENS.find((t) => t.address === NATIVE_PLS) || null
  }
  return CURATED_TOKENS.find((t) => t.address.toLowerCase() === lower) || null
}

/**
 * Resolve an address the host handed us into a token the panel can quote.
 *
 * The curated list covers the majors, but the screener can put any pair on
 * screen. Falling back to a default token when the address isn't curated is
 * what the panel used to do, and it was quietly wrong: selecting STM left the
 * panel offering a PLSX trade under a heading that said so, which is a trade
 * nobody asked for. Anything uncurated is read from the chain instead.
 */
export function useResolvedToken(address) {
  const curated = curatedToken(address)

  const { data, isLoading } = useQuery({
    queryKey: ['tokenMeta', address?.toLowerCase()],
    // Only reached when the address is real and not already known.
    enabled: Boolean(address) && !curated && /^0x[a-fA-F0-9]{40}$/.test(address),
    staleTime: Infinity,
    retry: 1,
    queryFn: () => fetchTokenMeta(address),
  })

  return {
    token: curated || data || null,
    isLoading: !curated && isLoading,
  }
}
