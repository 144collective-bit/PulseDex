import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { quoteSwap } from '../services/dex'

/**
 * Debounced swap quote.
 *
 * Typing an amount would otherwise fire a chain call per keystroke, so the
 * input settles first. Quotes refresh on an interval because a pool's price
 * moves underneath a user who is still deciding.
 */
export function useSwapQuote({ from, to, amount, enabled = true }) {
  const [debounced, setDebounced] = useState(amount)

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(amount), 350)
    return () => window.clearTimeout(id)
  }, [amount])

  const numeric = Number(debounced)
  const valid = enabled && from && to && isFinite(numeric) && numeric > 0

  return useQuery({
    queryKey: ['swapQuote', from?.address, to?.address, debounced],
    queryFn: () => quoteSwap({ from, to, amount: debounced }),
    enabled: Boolean(valid),
    refetchInterval: 12000,
    staleTime: 6000,
    // Keep the last quote on screen while the next one loads, so the panel
    // does not flash empty between refreshes.
    placeholderData: (prev) => prev,
    retry: 1,
  })
}
