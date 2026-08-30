import { SESSION_COOKIE, cookie, isSecureRequest } from '../_lib/session.js'
import { isSameOrigin } from '../_lib/guard.js'

/** Clear the session cookie. */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Being signed out by another site is only a nuisance rather than a breach,
  // but it is still not something a third party gets to decide.
  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Cross-site requests are not accepted.' })
  }

  res.setHeader(
    'Set-Cookie',
    cookie(SESSION_COOKIE, '', { maxAge: 0, secure: isSecureRequest(req) })
  )
  return res.status(200).json({ address: null })
}
