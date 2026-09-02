import { publicClient as client } from './rpc'
import { buildAllowanceRead } from './swap'

/**
 * Reading what a router is currently allowed to move.
 *
 * Deliberately not in `swap.js`. That module promises it neither sends nor
 * reads - which is what lets it be imported into a test with no RPC mock at all
 * - and this is a network call. Keeping them apart preserves the property
 * rather than merely documenting it.
 *
 * Goes through the shared viem client for the same reason everything else does:
 * it fans out over three PulseChain RPCs ranked by latency and batches through
 * Multicall3. A wagmi `useReadContract` here would be a second, unranked read
 * path for no gain.
 *
 * @returns {Promise<bigint|null>} null when there is nothing to read - native
 *   PLS has no contract and therefore no allowance.
 */
export async function readAllowance({ token, owner, spender }) {
  const call = buildAllowanceRead({ token, owner, spender })
  if (!call) return null

  return client.readContract(call)
}
