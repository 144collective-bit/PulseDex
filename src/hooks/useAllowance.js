import { useQuery } from '@tanstack/react-query'
import { readAllowance } from '../services/allowance'
import { needsApproval } from '../services/swap'

/**
 * What the router is currently allowed to move on this wallet's behalf.
 *
 * Two departures from the convention the other queries here follow, both
 * because an allowance is acted on rather than merely displayed:
 *
 * No `placeholderData`. Carrying the last value across a key change is a
 * kindness for a price - it stops a flash - but for an allowance it means
 * switching from a token you approved to one you did not shows the old answer
 * for a frame, and the button offers Swap for a trade that will revert. The
 * brief "checking" state is the honest one.
 *
 * No `refetchInterval`. An allowance only moves when we move it, so polling it
 * on every mounted panel buys nothing. Freshness after our own approval is
 * handled explicitly by the execution hook, which knows when to look again.
 *
 * The spender belongs in the key: PulseX has two routers and the quote picks
 * whichever priced the trade, so a V2 to V1 flip has to re-read rather than
 * reuse an answer about the other one.
 */
export function useAllowance({ token, owner, spender, enabled = true }) {
  return useQuery({
    queryKey: [
      'allowance',
      token?.address?.toLowerCase() ?? null,
      owner?.toLowerCase() ?? null,
      spender?.toLowerCase() ?? null,
    ],
    queryFn: () => readAllowance({ token, owner, spender }),
    enabled: Boolean(enabled && needsApproval(token) && owner && spender),
    staleTime: 8_000,
    retry: 1,
  })
}

export default useAllowance
