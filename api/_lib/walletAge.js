import { asAddress } from '../../src/utils/deployer.js'
import { readFirstSeen } from '../../src/utils/walletAge.js'

/**
 * When the chain first saw an address, according to the explorer.
 *
 * Server-side for two reasons, and only the second is about security.
 *
 * The first is caching. An address's first transaction is immutable - it
 * happened, it will not happen differently - so this should be looked up once
 * per account in the life of the site and read from our own database from then
 * on. A browser cannot cache on behalf of everybody else; an endpoint writing
 * to `profiles.first_seen_at` can.
 *
 * The second is that this is the only outbound request in the app made about
 * an address somebody else chose. Done from the browser it would mean a reader
 * opening a profile sends that profile's address to a third party from their
 * own IP. Done here, the explorer learns that our server asked, which is what
 * it already knows from everything else we ask it.
 *
 * Shaped after api/_lib/deployer.js, which has the same job against the same
 * API, and fails closed the same way: a node that is down, slow, hostile or
 * simply does not know the address produces null, and null means the page says
 * nothing about how old the wallet is. The cost of that is a missing line. The
 * cost of the other direction is a date that is wrong about whether somebody
 * is new, which is the one thing this value is read for.
 */

/** The explorer's v1-compatible API, the same one the deployer lookup uses.
 *  Overridable so a deployment can point at its own without a code change. */
const EXPLORER_API = process.env.PULSECHAIN_EXPLORER_API || 'https://api.scan.pulsechain.com/api'

/**
 * How long to wait before giving up.
 *
 * Six seconds, like the deployer lookup, and for the same reason: this runs
 * inside a request somebody is waiting on. A profile that takes twenty seconds
 * to not show a date is worse than one that gives up quickly and is asked
 * again tomorrow.
 */
const TIMEOUT_MS = 6000

/**
 * The first transaction this address appears in, as an ISO timestamp.
 *
 * `sort=asc` with `offset=1` asks the explorer for the earliest and nothing
 * else, which is the whole point - the alternative is paging a wallet's entire
 * history to look at the bottom of it.
 *
 * `txlist` covers transactions the address sent and received, so this is
 * genuinely "first seen" rather than "first spent". An address funded in 2021
 * that first sent something yesterday is three years old, and reading it as a
 * day old would be exactly the wrong answer.
 *
 * @param {unknown} value
 * @returns {Promise<string|null>}
 */
export async function findFirstSeen(value) {
  const address = asAddress(value)
  if (!address) return null

  const url =
    `${EXPLORER_API}?module=account&action=txlist&address=${address}` +
    '&sort=asc&page=1&offset=1'

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null

    // The parsing is in src/utils/walletAge.js, where it can be checked
    // against a malformed payload without a network - which is most of what
    // can go wrong here.
    return readFirstSeen(await res.json())
  } catch (err) {
    console.error('walletAge: the explorer lookup failed:', err.message)
    return null
  }
}
