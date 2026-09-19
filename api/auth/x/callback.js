import {
  SESSION_COOKIE,
  X_OAUTH_COOKIE,
  getCookie,
  readSession,
  readXOAuth,
  cookie,
  isSecureRequest,
} from '../../_lib/session.js'
import { serviceClient } from '../../_lib/supabase.js'
import { safeEqual } from '../../../src/utils/oauthPkce.js'
import { normaliseXProfile } from '../../../src/utils/xProfile.js'
import { TOKEN_URL, ME_URL, USER_FIELDS, xConfig, basicAuth } from '../../_lib/x.js'

/**
 * Where X sends the browser back, and where the link is actually made.
 *
 * This is the security-critical half. X has authenticated somebody and handed
 * this browser a code; the job here is to establish that the somebody is the
 * person who started the attempt, from this browser, signed in as this wallet
 * - and to refuse otherwise without saying which check failed.
 *
 * The checks, in order, and why each one is load-bearing:
 *
 * 1. The signed attempt cookie must verify. It carries `state`, the PKCE
 *    verifier and the wallet address, signed with SESSION_SECRET. A forged or
 *    edited one fails here.
 * 2. `state` from the query must equal the one in that cookie, compared in
 *    constant time. This is what defeats the attack the whole parameter
 *    exists for: an attacker completes the X side themselves and sends the
 *    victim the resulting callback URL, hoping it links the attacker's X
 *    account to the victim's wallet. Without the attacker's cookie in the
 *    victim's browser - and it cannot be, it is httpOnly and same-site - the
 *    state will not match.
 * 3. The wallet session must still be present AND be the same address the
 *    attempt was started by. Somebody who signs out and into a different
 *    wallet mid-flow does not get the link applied to the new one.
 * 4. The code is exchanged with the verifier, which proves this server began
 *    the flow. Then, and only then, the profile is fetched and stored.
 *
 * A redirect is the answer either way, because this is a top-level navigation
 * the person is looking at - a JSON body would be shown to them as text. The
 * outcome rides in a query parameter the profile page reads.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  /*
   * No isSameOrigin() here, deliberately - do not add one.
   *
   * Every other state-changing endpoint in this app checks it. This one is
   * reached by a top-level redirect from x.com, so the Origin or Referer it
   * arrives with is x.com's, and the check would reject every legitimate
   * callback. The protection is the signed attempt cookie and the state
   * comparison below, which is strictly stronger than an origin header: an
   * attacker can forge a Referer, and cannot forge a cookie they do not hold.
   */

  /*
   * The attempt cookie is cleared on every path out of here, success or
   * failure. A used or failed attempt is spent - leaving it set would let a
   * second callback be replayed against it inside the ten-minute window.
   */
  const clear = cookie(X_OAUTH_COOKIE, '', { maxAge: 0, secure: isSecureRequest(req) })

  const finish = (outcome) => {
    res.setHeader('Set-Cookie', clear)
    res.setHeader('Location', `/?x=${encodeURIComponent(outcome)}`)
    return res.status(302).end()
  }

  const url = new URL(req.url, 'http://localhost')

  /*
   * The person pressed Cancel on X's consent screen. Not an error and not
   * logged as one - it is somebody changing their mind, and the only correct
   * response is to put them back where they were.
   */
  if (url.searchParams.get('error')) return finish('cancelled')

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return finish('failed')

  const attempt = await readXOAuth(getCookie(req, X_OAUTH_COOKIE)).catch(() => null)
  if (!attempt) return finish('expired')

  // Constant time: `state` is a value an attacker submits, and a comparison
  // that stops at the first wrong character says how much of it was right.
  if (!safeEqual(state, attempt.state || '')) return finish('failed')

  let address = null
  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    address = session?.sub || null
  } catch {
    address = null
  }

  // Signed out mid-flow, or signed into a different wallet than the one that
  // started this. Either way the link has no correct home.
  if (!address || address !== attempt.sub) return finish('signed-out')

  const config = xConfig()
  const db = serviceClient()
  if (!config || !db) return finish('unconfigured')

  let profile
  try {
    const token = await exchange(code, attempt.verifier, config)
    profile = normaliseXProfile(await fetchMe(token))
  } catch (err) {
    // The message, never the token. Anything from the exchange path may quote
    // request details back, and a log line is not the place for a credential.
    console.error('x callback: exchange or lookup failed:', err.message)
    return finish('failed')
  }

  if (!profile) return finish('failed')

  const { error } = await db
    .from('profiles')
    .upsert(
      {
        address,
        x_user_id: profile.id,
        x_handle: profile.handle,
        x_name: profile.name,
        x_verified_type: profile.verifiedType,
        x_followers: profile.followers,
        x_account_created_at: profile.createdAt,
        x_linked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'address' },
    )

  if (error) {
    /*
     * 23505 here is profiles_x_user_id_unique: this X account is already
     * linked to a different wallet. Answered as its own outcome because it is
     * the one failure the person can do something about - unlink it there
     * first - and because silently allowing it would let one X account vouch
     * for any number of addresses, which is the impersonation this feature is
     * meant to make harder.
     */
    if (error.code === '23505') return finish('already-linked')
    console.error('x callback: write failed:', error.message)
    return finish('failed')
  }

  return finish('linked')
}

/**
 * Trade the authorization code for an access token.
 *
 * The verifier goes here and only here. The client secret authenticates this
 * application over HTTP Basic; both travel in a server-to-server POST that no
 * browser sees.
 */
async function exchange(code, verifier, config) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(config),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.callbackUrl,
      code_verifier: verifier,
    }),
  })

  if (!response.ok) throw new Error(`token endpoint answered ${response.status}`)

  const payload = await response.json()
  if (!payload?.access_token) throw new Error('token endpoint returned no access token')

  /*
   * Returned, not stored. The token lives as a local for the one request
   * below and is then unreachable. Nothing in this flow writes it anywhere,
   * which is the point: a breach of this database exposes public X handles
   * and no credentials at all.
   */
  return payload.access_token
}

/** Who the token belongs to. */
async function fetchMe(accessToken) {
  const url = new URL(ME_URL)
  url.searchParams.set('user.fields', USER_FIELDS)

  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new Error(`users/me answered ${response.status}`)
  return response.json()
}
