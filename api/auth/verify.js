import { createPublicClient, http, verifyMessage } from 'viem'

/** The only chain we issue sign-in messages for. */
const EXPECTED_CHAIN_ID = '369'
import {
  SESSION_COOKIE,
  NONCE_COOKIE,
  getCookie,
  readNonce,
  signSession,
  cookie,
  isSecureRequest,
} from '../_lib/session.js'
import { parseSiweMessage } from '../../src/utils/siwe.js'
import { allowedHosts, isSameOrigin, rateLimit } from '../_lib/guard.js'

/**
 * PulseChain, for signature verification only. Smart-contract wallets sign via
 * EIP-1271, which is a contract call rather than an elliptic-curve check, so
 * verification needs a node. Read-only: nothing here can send a transaction.
 */
const client = createPublicClient({
  chain: {
    id: 369,
    name: 'PulseChain',
    nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.pulsechain.com'] } },
  },
  transport: http('https://rpc.pulsechain.com'),
})

/**
 * Verify a signed sign-in message and open a session.
 *
 * The checks matter more than the signature itself. A valid signature over an
 * attacker's message is still an attack, so the message has to be pinned to
 * this site (domain), to this attempt (nonce), and to now (expiry) before the
 * signature is worth checking at all.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Cross-site sign-in requests are not accepted.' })
  }

  const limited = rateLimit(req, { key: 'verify', limit: 10, windowMs: 60_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many sign-in attempts. Try again shortly.' })
  }

  try {
    const { message, signature } = req.body || {}
    if (typeof message !== 'string' || typeof signature !== 'string') {
      return res.status(400).json({ error: 'Missing message or signature.' })
    }

    const parsed = parseSiweMessage(message)
    if (!parsed) {
      return res.status(400).json({ error: 'Malformed sign-in message.' })
    }

    // Pinned to this site: a signature farmed by another domain is useless.
    if (!allowedHosts(req).has(parsed.domain)) {
      return res.status(400).json({ error: 'This message was not issued for this site.' })
    }

    // Pinned to this attempt: the nonce must match the one we just issued.
    const issued = await readNonce(getCookie(req, NONCE_COOKIE))
    if (!issued?.nonce || issued.nonce !== parsed.nonce) {
      return res.status(400).json({ error: 'Sign-in expired. Please try again.' })
    }

    // Pinned to this chain: a message naming another one was not built by us.
    if (parsed.chainId !== EXPECTED_CHAIN_ID) {
      return res.status(400).json({ error: 'This message was not issued for PulseChain.' })
    }

    // Pinned to now.
    if (parsed.expirationTime && Date.parse(parsed.expirationTime) < Date.now()) {
      return res.status(400).json({ error: 'Sign-in request has expired.' })
    }

    const valid = await verifyMessage({
      address: parsed.address,
      message,
      signature,
      // Lets a smart-contract wallet authenticate through EIP-1271 rather than
      // being rejected for not producing an EOA signature.
      client,
    }).catch(() => false)

    if (!valid) {
      return res.status(401).json({ error: 'Signature did not match that address.' })
    }

    const token = await signSession(parsed.address)
    const secure = isSecureRequest(req)

    res.setHeader('Set-Cookie', [
      cookie(SESSION_COOKIE, token, { maxAge: 60 * 60 * 24 * 7, secure }),
      // Clears the nonce so a browser cannot reuse it. Note this is not a true
      // single-use guarantee: with no server-side record of spent nonces, a
      // caller replaying the original cookie is still accepted inside the
      // 10-minute window. See api/_lib/session.js.
      cookie(NONCE_COOKIE, '', { maxAge: 0, secure }),
    ])
    res.setHeader('Cache-Control', 'no-store')

    return res.status(200).json({ address: parsed.address.toLowerCase() })
  } catch (err) {
    console.error('verify error:', err.message)
    return res.status(500).json({ error: 'Sign-in is not configured on this deployment.' })
  }
}
