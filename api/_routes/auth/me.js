import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { parseAdminAddresses, isAdminAddress } from '../../../src/utils/chatAdmin.js'

/** Who the session cookie says this is, or null. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    if (!session?.sub) return res.status(200).json({ address: null, isAdmin: false })

    /*
     * Whether this address may remove a chat message, answered here so the
     * list of moderators never reaches the browser. The alternative - shipping
     * the addresses and comparing client-side - would publish who moderates
     * the site to everyone who reads the bundle.
     *
     * This only decides whether a control is drawn. The endpoint that removes
     * a message checks the same thing again, because a hidden button is not a
     * permission.
     */
    const isAdmin = isAdminAddress(session.sub, parseAdminAddresses(process.env.ADMIN_ADDRESSES))

    return res.status(200).json({ address: session.sub, isAdmin })
  } catch {
    // A missing SESSION_SECRET should read as "signed out", not as an error
    // the UI has to handle separately.
    return res.status(200).json({ address: null, isAdmin: false })
  }
}
