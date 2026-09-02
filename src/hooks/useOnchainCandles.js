import { useQuery } from '@tanstack/react-query'
import { getOnchainCandles } from '../services/onchainCandles'
import { FEATURES } from '../config/features'

/**
 * Candles read from the pool's own Swap events.
 *
 * Off unless `FEATURES.onchainCandles` says otherwise. It is an experiment, and
 * the series it returns is quoted in the pool's quote token rather than USD, so
 * it stands in for the aggregator's series rather than joining it.
 *
 * Refreshed on a short interval because the point of reading the chain is that
 * the last candle is the one forming now. Even so this polls rather than
 * subscribing: a websocket would update on the block, but it is a second
 * connection to keep alive and correct, and worth adding only once the polling
 * version has proved the rest of the idea.
 */
export function useOnchainCandles({ pair, intervalSeconds = 60, seconds = 3600, invert = false, enabled = true }) {
  const on = FEATURES.onchainCandles && enabled && Boolean(pair)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['onchainCandles', pair?.toLowerCase() ?? null, intervalSeconds, seconds, invert],
    queryFn: () => getOnchainCandles({ pair, intervalSeconds, seconds, invert }),
    enabled: on,
    // Long enough not to hammer the RPC, short enough that the forming candle
    // is worth looking at. Block times here are about ten seconds.
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  })

  return {
    candles: data?.candles ?? [],
    swaps: data?.swaps ?? 0,
    range: data ? { from: data.fromBlock, to: data.toBlock } : null,
    isLoading: on && isLoading,
    isError,
    error,
    enabled: on,
  }
}

export default useOnchainCandles
