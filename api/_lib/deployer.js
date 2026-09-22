import {
  asAddress,
  readBlockscoutCreation,
  readContractCreator,
  readTransactionSender,
} from '../../src/utils/deployer.js'

/**
 * Who sent a token's creation transaction, according to the chain.
 *
 * Server-side and nowhere else. The whole value of a dev claim is that it is
 * checked against what the chain says rather than against anything the
 * browser sent, so this must never be a value the client can supply or
 * influence - not the address, not the transaction, not the node it was asked
 * of.
 *
 * Two sources, tried in order, because the first is an Otterscan extension
 * that not every node exposes and a claim flow resting on one optional RPC
 * method is a claim flow that silently stops working. Both are overridable by
 * environment variable so a deployment can point at its own node without a
 * code change.
 *
 * Everything here fails closed. A node that is down, slow, hostile or simply
 * does not know the contract produces null, and null refuses the claim. The
 * cost of that is a dev who cannot claim today; the cost of the other
 * direction is a badge on a stranger's token.
 */

/** Where to ask. PulseChain's public node, unless told otherwise. */
const RPC_URL = process.env.PULSECHAIN_RPC_URL || 'https://rpc-pulsechain.g4mm4.io'

/** The explorer's API, for the fallback. */
const EXPLORER_API = process.env.PULSECHAIN_EXPLORER_API || 'https://api.scan.pulsechain.com/api'

/**
 * How long to wait before giving up on a node.
 *
 * Short, because this runs inside a request somebody is waiting on, and a
 * claim that takes twenty seconds to fail is worse than one that fails in
 * six and can be tried again.
 */
const TIMEOUT_MS = 6000

/** One JSON-RPC call, or null. */
async function rpc(method, params) {
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) return null
    const payload = await res.json()
    // A JSON-RPC error is a 200 with an `error` field, which is exactly the
    // shape that gets mistaken for an answer.
    if (!payload || payload.error) return null
    return payload.result ?? null
  } catch (err) {
    console.error(`deployer: ${method} failed:`, err.message)
    return null
  }
}

/**
 * The creation transaction for a contract, from whichever source answers.
 *
 * @param {string} token
 * @returns {Promise<{creator: string, hash: string}|null>}
 */
async function findCreation(token) {
  const fromNode = readContractCreator(await rpc('ots_getContractCreator', [token]))
  if (fromNode) return fromNode

  try {
    const url = `${EXPLORER_API}?module=contract&action=getcontractcreation&contractaddresses=${token}`
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    return readBlockscoutCreation(await res.json(), token)
  } catch (err) {
    console.error('deployer: the explorer lookup failed:', err.message)
    return null
  }
}

/**
 * The wallet that deployed this token, or null.
 *
 * Returns the `from` of the creation transaction rather than the contract's
 * immediate creator, and the difference is what makes this usable. A token
 * launched on a bonding curve was created by the launchpad's factory - an
 * address nobody holds the key to - while the transaction that asked for the
 * launch was sent by the person. For a token deployed directly the two are
 * the same.
 *
 * `creator` comes back alongside so the row can record both: what created the
 * contract, and who asked for it.
 *
 * @param {unknown} address
 * @returns {Promise<{deployer: string, creator: string, tx: string}|null>}
 */
export async function findDeployer(address) {
  const token = asAddress(address)
  if (!token) return null

  const creation = await findCreation(token)
  if (!creation) return null

  const sender = readTransactionSender(await rpc('eth_getTransactionByHash', [creation.hash]))
  if (!sender) return null

  return { deployer: sender, creator: creation.creator, tx: creation.hash }
}
