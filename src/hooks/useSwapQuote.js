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
    /*
     * Keep the last quote on screen while the next one loads, so the panel does
     * not blank on every keystroke.
     *
     * Scoped to the same pair, and to an amount worth quoting. It only ever
     * fires on a key change - a refetch of the same key keeps its own data -
     * so an unscoped version carries a figure from one trade onto another. Flip
     * the pair and the panel reads "1000 PLSX -> 1,195.74 PLS" for a tenth of a
     * second, which was the answer for 1000 PLS and is wrong by half for this
     * one. Type a bare "." and the last real quote sits there beside it.
     *
     * The same reasoning as `useAllowance`, which carries nothing across a key
     * change for the same reason: a stale number under a changed label reads as
     * a current one.
     */
    placeholderData: (prev, prevQuery) => {
      if (!valid) return undefined
      const key = prevQuery?.queryKey
      if (!key) return undefined
      return key[1] === from?.address && key[2] === to?.address ? prev : undefined
    },
    retry: 1,
  })
}
