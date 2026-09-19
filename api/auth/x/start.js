import {
  SESSION_COOKIE,
  X_OAUTH_COOKIE,
  getCookie,
  readSession,
  signXOAuth,
  cookie,
  isSecureRequest,
} from '../../_lib/session.js'
import { isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { randomToken, codeChallenge } from '../../../src/utils/oauthPkce.js'
import { AUTHORIZE_URL, SCOPES, xConfig } from '../../_lib/x.js'

/**
 * Begin linking an X account.
 *
 * Answers with the URL to send the browser to, rather than a 302. The page
 * needs to know whether this deployment has X configured at all before it
 * draws a button, and a fetch that returns a URL lets it find out and fail in
 * the interface instead of navigating somebody to an error page.
 *
 * What makes this safe is entirely in what is generated here and what is kept
 * where:
 *
 * - `state` is 256 bits from a CSPRNG. It is what stops an attacker handing
 *   somebody a crafted callback URL: without the matching cookie in that
 *   browser, the callback refuses.
 * - The PKCE verifier is another 256 bits, and only its SHA-256 goes in the
 *   URL. An authorization code captured from a log, a referer or a browser
 *   history cannot be exchanged without the verifier, which never leaves us.
 * - Both, plus the wallet address that started this, go into one signed
 *   httpOnly cookie. The callback checks all three together.
 *
 * Signing in with a wallet is required first. The link is from an X account to
 * a PulseDex account, so there has to be a PulseDex account to link it to - and
 * binding the attempt to that address here is what stops a callback completing
 * against whatever session happens to be in the browser later.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const limited = rateLimit(req, { key: 'x-oauth-start', limit: 10, windowMs: 600_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many attempts. Try again shortly.' })
  }

  let address = null
  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    address = session?.sub || null
  } catch {
    address = null
  }

  if (!address) return res.status(401).json({ error: 'Sign in with your wallet first.' })

  const config = xConfig()
  if (!config) {
    return res.status(503).json({ error: 'X linking is not configured on this deployment.' })
  }

  const state = randomToken(32)
  const verifier = randomToken(64)

  /*
   * The cookie is set before the URL is returned, and carries the verifier
   * that the challenge in that URL was derived from. If these two ever came
   * from different calls the exchange would fail with a PKCE mismatch, which
   * is why they are produced together here and nowhere else.
   */
  res.setHeader(
    'Set-Cookie',
    cookie(X_OAUTH_COOKIE, await signXOAuth({ state, verifier, sub: address }), {
      maxAge: 600,
      secure: isSecureRequest(req),
    }),
  )

  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.callbackUrl)
  url.searchParams.set('scope', SCOPES.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', await codeChallenge(verifier))
  // S256, never `plain` - with `plain` the challenge is the verifier, and
  // anybody who sees the URL can redeem the code.
  url.searchParams.set('code_challenge_method', 'S256')

  return res.status(200).json({ url: url.toString() })
}
