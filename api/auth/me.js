import { SESSION_COOKIE, getCookie, readSession } from '../_lib/session.js'

/** Who the session cookie says this is, or null. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    if (!session?.sub) return res.status(200).json({ address: null })
    return res.status(200).json({ address: session.sub })
  } catch {
    // A missing SESSION_SECRET should read as "signed out", not as an error
    // the UI has to handle separately.
    return res.status(200).json({ address: null })
  }
}
