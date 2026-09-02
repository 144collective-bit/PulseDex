import { useQuery } from '@tanstack/react-query'
import { readBalance, readGasPrice } from '../services/balance'

/**
 * A wallet's raw balance of one token.
 *
 * No `placeholderData`, for the same reason the allowance query has none:
 * carrying the previous token's balance across a key change would, for a
 * frame, tell someone they can afford an amount of something they do not hold.
 * The brief unknown is the honest state, and an unknown balance does not block
 * the button.
 *
 * Refreshed on an interval because a balance moves for reasons this panel
 * knows nothing about - another tab, another wallet, an incoming transfer.
 */
export function useTokenBalance({ token, owner, enabled = true }) {
  return useQuery({
    queryKey: ['tokenBalance', token?.address?.toLowerCase() ?? null, owner?.toLowerCase() ?? null],
    queryFn: () => readBalance({ token, owner }),
    enabled: Boolean(enabled && token && owner),
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: 1,
  })
}

/**
 * The current gas price, for the native reserve.
 *
 * Shared across every panel by its query key, and refreshed slowly - the
 * reserve is a safety margin with a multiplier on it, so it does not need to
 * track the price closely to do its job.
 */
export function useGasPrice({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['gasPrice'],
    queryFn: readGasPrice,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  })
}

export default useTokenBalance
