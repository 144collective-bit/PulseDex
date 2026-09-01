import { createPublicClient, fallback, http } from 'viem'
import { pulsechain } from '../config/pulsechain'

/**
 * The one PulseChain read client.
 *
 * There used to be three, in three services, each holding its own connection to
 * `rpc.pulsechain.com` and nothing else. That is a single point of failure worn
 * three times: when that endpoint is slow or down, the portfolio, the swap
 * quotes and the core asset supplies all fail together, and none of them has
 * anywhere else to ask.
 *
 * Read-only. Nothing here signs or sends - transactions go through the wallet's
 * own connector, and this client has no account attached to sign with even if
 * something tried.
 */

/**
 * Endpoints in preference order, all verified to answer `eth_chainId` with 369.
 *
 * The official node leads because it is the reference; the other two are
 * independent operators rather than mirrors of it, which is the point - a
 * fallback list that shares an operator with the primary fails at the same
 * moment as the primary.
 */
const ENDPOINTS = [
  'https://rpc.pulsechain.com',
  'https://pulsechain.publicnode.com',
  'https://rpc-pulsechain.g4mm4.io',
]

/**
 * A request that has not answered in fifteen seconds is not going to.
 *
 * Without this a stalled connection holds its caller open indefinitely: viem
 * has no default timeout, so a portfolio read against a hung node left the
 * panel on its loading state for the rest of the session with nothing to retry.
 * The fallback transport can only move to the next endpoint once the current
 * one has actually failed, so the timeout is what makes failover possible at
 * all rather than merely configured.
 */
const TIMEOUT_MS = 15_000

export const publicClient = createPublicClient({
  chain: pulsechain,
  transport: fallback(
    ENDPOINTS.map((url) => http(url, { timeout: TIMEOUT_MS, retryCount: 1 })),
    {
      // Endpoints are ranked by measured latency and success rate rather than
      // held in a fixed order, so a node that is up but crawling stops being
      // asked first. Sampled infrequently: ranking is a background concern and
      // should not become traffic of its own.
      rank: { interval: 60_000, sampleCount: 3 },
      retryCount: 0,
    },
  ),
  /*
   * Batched through Multicall3, which PulseChain has at the standard address.
   *
   * The portfolio reads a name, a symbol and a decimals for every token a
   * wallet holds; unbatched that is three round trips per token and the
   * commonest way to be rate limited by a public node. A short window is enough
   * to collect the reads issued in the same tick without adding latency anyone
   * can feel.
   */
  batch: { multicall: { wait: 16 } },
})

/** The endpoints in use, for anything that needs to report where data came from. */
export const RPC_ENDPOINTS = ENDPOINTS
