/**
 * Reading "who deployed this token" out of what a node or an explorer answers.
 *
 * Split from the requests that fetch it because this is the part that decides
 * whether somebody gets a badge, and the part that must be wrong in only one
 * direction. Every function here returns null rather than a guess: a null
 * refuses a claim, and a wrong address grants one to a stranger.
 *
 * None of it trusts shapes. These payloads come from a node over the network,
 * and a node that has been swapped for something hostile is exactly the case
 * where "it is always an object with a creator field" stops being true.
 */

/** A wallet or contract address as this codebase stores one. */
const ADDRESS = /^0x[0-9a-f]{40}$/
/** A transaction hash: 0x and thirty-two bytes. */
const TX_HASH = /^0x[0-9a-f]{64}$/

/**
 * An address in the one casing everything here compares in, or null.
 *
 * Nodes answer in mixed case and explorers answer in checksummed case, and a
 * comparison between the two matches nothing - which for a claim check fails
 * safe, but fails silently and looks like the chain disagreeing with the
 * signer.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function asAddress(value) {
  if (typeof value !== 'string') return null
  const lower = value.trim().toLowerCase()
  return ADDRESS.test(lower) ? lower : null
}

/**
 * A transaction hash, or null.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function asTxHash(value) {
  if (typeof value !== 'string') return null
  const lower = value.trim().toLowerCase()
  return TX_HASH.test(lower) ? lower : null
}

/**
 * What `ots_getContractCreator` said.
 *
 * Otterscan answers `{ creator, hash }` - the address that created the
 * contract, and the transaction it happened in. Both are wanted and for
 * different reasons: the hash is what the next call needs, and the creator is
 * recorded so that a claim can be re-checked later without trusting that this
 * function ran correctly at the time.
 *
 * Null for a contract it has never seen, which is also what it answers for an
 * address that is not a contract at all.
 *
 * @param {unknown} payload the `result` field of the JSON-RPC response
 * @returns {{creator: string, hash: string}|null}
 */
export function readContractCreator(payload) {
  if (!payload || typeof payload !== 'object') return null

  const creator = asAddress(payload.creator)
  const hash = asTxHash(payload.hash)
  // Both or neither. A creator with no transaction cannot be checked by
  // anybody afterwards, and a transaction with no creator is not an answer.
  return creator && hash ? { creator, hash } : null
}

/**
 * Who sent a transaction.
 *
 * This is the address a claim is checked against, and the reason the flow
 * takes two calls instead of one.
 *
 * A token launched through a bonding curve was created by the launchpad's
 * factory contract, so `ots_getContractCreator` names the factory - an
 * address nobody can sign from, which would make the claim impossible for
 * exactly the tokens this site is mostly about. The `from` of the creation
 * transaction is the wallet that asked for the launch, which is the person.
 * For a token deployed directly the two are the same address.
 *
 * "Whoever sent the creation transaction" is therefore both what works and
 * what the badge can honestly say.
 *
 * @param {unknown} payload the `result` of `eth_getTransactionByHash`
 * @returns {string|null}
 */
export function readTransactionSender(payload) {
  if (!payload || typeof payload !== 'object') return null
  return asAddress(payload.from)
}

/**
 * The same answer from a Blockscout explorer, which shapes it differently.
 *
 * A second source because the first is an Otterscan extension that not every
 * node exposes, and a claim flow that depends on one endpoint being enabled
 * is a claim flow that quietly stops working.
 *
 * Blockscout answers `{ status, result: [ { contractAddress, contractCreator,
 * contractCreationHash } ] }`, and answers it with `status: "0"` and a string
 * in `result` when it has nothing - which is why `result` is checked for being
 * an array before anything is read out of it.
 *
 * The token address is passed in and matched, because this endpoint takes a
 * list and there is no guarantee the row that comes back is the one asked
 * for.
 *
 * @param {unknown} payload the parsed response body
 * @param {string} tokenAddress the contract that was asked about
 * @returns {{creator: string, hash: string}|null}
 */
export function readBlockscoutCreation(payload, tokenAddress) {
  const wanted = asAddress(tokenAddress)
  if (!wanted) return null
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.result)) return null

  for (const row of payload.result) {
    if (!row || typeof row !== 'object') continue
    if (asAddress(row.contractAddress) !== wanted) continue

    const creator = asAddress(row.contractCreator)
    const hash = asTxHash(row.contractCreationHash)
    if (creator && hash) return { creator, hash }
  }

  return null
}

/**
 * The message somebody signs to claim a token.
 *
 * Built in one place and used by both sides: the browser asks the wallet to
 * sign exactly this, and the endpoint rebuilds it from what it knows and
 * checks the signature against that rather than against the string the
 * request supplied. That is the whole security of the flow - a signature over
 * text the caller chose proves only that they can sign something.
 *
 * It names the site, the token and the nonce, and it says in words what
 * signing it does. A wallet shows this text to the person; one that reads
 * "0x8a3f..." teaches people to sign anything.
 *
 * @param {{domain: string, token: string, address: string, nonce: string}} params
 * @returns {string}
 */
export function claimMessage({ domain, token, address, nonce }) {
  return [
    `${domain} wants you to claim a token.`,
    '',
    `Token: ${token}`,
    `Wallet: ${address}`,
    '',
    'Signing this says you control the wallet that sent this token’s creation',
    'transaction. It does not transfer anything and costs no gas.',
    '',
    `Nonce: ${nonce}`,
  ].join('\n')
}
