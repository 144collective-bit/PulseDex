import { randomBytes } from 'node:crypto'
import { NONCE_COOKIE, signNonce, cookie, isSecureRequest } from '../_lib/session.js'
import { rateLimit } from '../_lib/guard.js'

/**
 * Issue a nonce for a sign-in attempt.
 *
 * The nonce goes back to the client to be embedded in the message it signs,
 * and simultaneously into a signed cookie. Verification only accepts a message
 * whose nonce matches the cookie, so a signature captured from one browser
 * cannot be replayed from another.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const limited = rateLimit(req, { key: 'nonce', limit: 20, windowMs: 60_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }

  try {
    const nonce = randomBytes(16).toString('hex')
    const token = await signNonce(nonce)

    res.setHeader(
      'Set-Cookie',
      cookie(NONCE_COOKIE, token, { maxAge: 600, secure: isSecureRequest(req) })
    )
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ nonce })
  } catch (err) {
    console.error('nonce error:', err.message)
    return res.status(500).json({ error: 'Sign-in is not configured on this deployment.' })
  }
}
