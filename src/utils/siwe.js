/**
 * EIP-4361 ("Sign In With Ethereum") message handling.
 *
 * One copy, imported by both the client that builds the message and the
 * function that verifies it - if the two ever disagreed about the format,
 * every signature would fail verification for reasons nobody could see.
 *
 * Written out rather than pulled from a library because the format is a fixed
 * plain-text template and the security lives in the checks around it, not in
 * the parsing. The message a user signs must be legible to them - that is the
 * whole point of the standard - so it is built and read in one place where it
 * can be seen to say what it does.
 */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

/**
 * Build the message shown in the wallet.
 *
 * The wording is deliberately plain about cost and scope, because a signature
 * prompt looks alarmingly like a transaction prompt to most people.
 */
export function buildSiweMessage({ domain, address, uri, nonce, issuedAt, expirationTime, chainId = 369 }) {
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to PulseDex. This proves you own this wallet. It is not a transaction, it costs no gas, and it gives PulseDex no permission to move your funds.',
    '',
    `URI: ${uri}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
  ].join('\n')
}

/**
 * Read a signed message back into its fields.
 *
 * Returns null on anything unexpected rather than a partial object - a caller
 * that gets an object back should be able to trust every field on it.
 */
export function parseSiweMessage(message) {
  const lines = String(message).split('\n')
  if (lines.length < 6) return null

  const domainMatch = lines[0].match(/^(.+) wants you to sign in with your Ethereum account:$/)
  if (!domainMatch) return null

  const address = (lines[1] || '').trim()
  if (!ADDRESS_RE.test(address)) return null

  const field = (label) => {
    const line = lines.find((l) => l.startsWith(`${label}: `))
    return line ? line.slice(label.length + 2).trim() : null
  }

  const nonce = field('Nonce')
  if (!nonce) return null

  return {
    domain: domainMatch[1].trim(),
    address,
    uri: field('URI'),
    chainId: field('Chain ID'),
    nonce,
    issuedAt: field('Issued At'),
    expirationTime: field('Expiration Time'),
  }
}
