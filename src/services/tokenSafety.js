import { useQuery } from '@tanstack/react-query'
import { fetchWithRetry } from './pulsescan'

/**
 * What PulseDEX can actually establish about a token contract.
 *
 * This exists to replace a panel that asserted things it had never checked. The
 * screener's audit tab used to state, for every token without exception, that
 * the honeypot risk had passed, that buy and sell tax were zero, and that the
 * contract was verified - all four hardcoded. On a genuine honeypot it would
 * have told the reader it was safe, which is the one failure mode a screener
 * must not have.
 *
 * So this reads the explorer and reports only what comes back. Where there is
 * no source - and for tax and honeypot behaviour there is none in the browser,
 * because establishing either means simulating a buy and a sell against a
 * forked node - the answer is that it is unknown, not that it is fine.
 */

const BASE = 'https://api.scan.pulsechain.com/api/v2'

/**
 * @typedef {Object} TokenSafety
 * @property {boolean|null} verified       Source code published and matching the deployed bytecode.
 * @property {boolean|null} fullyVerified  Verified without a partial-match caveat.
 * @property {boolean|null} selfDestructed
 * @property {string|null} compiler
 * @property {string|null} standard        PRC-20 / ERC-20, as the explorer classifies it.
 * @property {number|null} holders
 * @property {boolean} isContract
 */

/**
 * @param {string} address
 * @returns {Promise<TokenSafety>}
 */
export async function fetchTokenSafety(address) {
  if (!address) throw new Error('No token address')

  /*
   * Two independent reads, and one failing must not blank the other. A token
   * with unverified source returns 404 from the contract endpoint while its
   * token record answers perfectly well - reporting "unknown" for the holder
   * count in that case would be wrong, and it is the commonest case there is.
   */
  const [contract, token] = await Promise.allSettled([
    fetchWithRetry(`${BASE}/smart-contracts/${address}`),
    fetchWithRetry(`${BASE}/tokens/${address}`),
  ])

  const c = contract.status === 'fulfilled' ? contract.value : null
  const t = token.status === 'fulfilled' ? token.value : null

  // A 404 from the contract endpoint is an answer, not an outage: it means the
  // source was never published. Only a rejected read leaves it unknown.
  const contractKnown = contract.status === 'fulfilled' || contract.reason?.status === 404

  const holders = Number(t?.holders)

  return {
    verified: contractKnown ? Boolean(c?.is_verified) : null,
    fullyVerified: contractKnown ? Boolean(c?.is_fully_verified) : null,
    selfDestructed: contractKnown ? Boolean(c?.is_self_destructed) : null,
    compiler: c?.compiler_version ?? null,
    standard: t?.type ?? null,
    holders: Number.isFinite(holders) ? holders : null,
    isContract: Boolean(c || t),
  }
}

export function useTokenSafety(address) {
  return useQuery({
    queryKey: ['tokenSafety', address?.toLowerCase() ?? null],
    queryFn: () => fetchTokenSafety(address),
    enabled: Boolean(address),
    // Contract verification changes approximately never, and the holder count
    // moves slowly enough that a stale figure is not misleading.
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  })
}
