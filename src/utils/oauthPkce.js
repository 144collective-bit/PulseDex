/**
 * The random values an OAuth authorization-code flow turns on.
 *
 * Small enough to read in one sitting, and worth reading, because every
 * property this flow has rests on two numbers being unguessable and one hash
 * being computed correctly. Kept here, with tests, rather than inline in the
 * endpoint - "not guessed" is a claim that should be checkable.
 *
 * Web Crypto rather than node:crypto, so the same file runs in the serverless
 * handler and under vitest without a shim. `crypto.getRandomValues` is a
 * CSPRNG in both; `Math.random` is not one anywhere, and is the single most
 * common way a flow like this is quietly broken.
 */

/**
 * base64url, as every OAuth spec means it: no padding, and the two characters
 * that need escaping in a URL swapped out.
 *
 * Done by hand rather than with a library because getting `+/=` into a query
 * string is how a challenge arrives at the server re-encoded and no longer
 * matching the verifier - a failure that looks like the provider rejecting
 * you rather than like an encoding bug.
 */
export function base64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * An unguessable value, for `state` and for the PKCE verifier.
 *
 * 32 bytes is 256 bits, which is not a number anyone is going to search. The
 * default matters more than it looks: every caller that does not think about
 * the length gets one that is long enough.
 *
 * @param {number} [bytes]
 */
export function randomToken(bytes = 32) {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return base64Url(buffer)
}

/**
 * The S256 code challenge for a verifier.
 *
 * This is the whole of PKCE. The challenge travels in the URL where anything
 * on the path can read it; the verifier stays on our server and is sent only
 * when redeeming the code. An attacker who captures the authorization code -
 * from a browser history, a referer header, a log - cannot exchange it,
 * because they cannot reverse the hash to produce the verifier.
 *
 * S256 and never `plain`. The spec still allows `plain`, where the challenge
 * IS the verifier, which provides precisely nothing: anyone who sees the
 * challenge can redeem the code.
 *
 * @param {string} verifier
 * @returns {Promise<string>}
 */
export async function codeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

/**
 * Compare two secrets without leaking where they differ.
 *
 * `a === b` on strings stops at the first differing character, so how long it
 * takes says how much of the value was right. That is a real attack on a
 * value an attacker can submit repeatedly, and `state` is exactly such a
 * value.
 *
 * Constant in the length of `a`: every character is compared and the results
 * are combined, with no early return. Lengths are compared first, which does
 * leak the length - that is fine, the length is not the secret.
 */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false

  let differences = 0
  for (let i = 0; i < a.length; i += 1) {
    differences |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return differences === 0
}
