import { createPublicClient, http, verifyMessage } from 'viem'
import {
  SESSION_COOKIE,
  NONCE_COOKIE,
  cookie,
  getCookie,
  isSecureRequest,
  readNonce,
  readSession,
  signNonce,
} from '../../_lib/session.js'
import { randomBytes } from 'node:crypto'
import { allowedHosts, isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { findDeployer } from '../../_lib/deployer.js'
import { isAdminAddress, parseAdminAddresses } from '../../../src/utils/chatAdmin.js'
import { asAddress, claimMessage } from '../../../src/utils/deployer.js'

/**
 * PulseChain, read-only, for checking signatures.
 *
 * The same shape as the one in auth/verify.js and for the same reason: a
 * smart-contract wallet signs through EIP-1271, which is a contract call
 * rather than an elliptic-curve check, so verification needs a node. A dev
 * who launched from a multisig is precisely the case where this matters.
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
 * Claiming a token, and taking a claim away.
 *
 * POST claims: the signed-in account signs a message naming the token, and
 * the endpoint grants the claim only if the address that signed is the one
 * the chain says sent the token's creation transaction.
 *
 * DELETE revokes, for a moderator, with a reason that is written down.
 *
 * Three things this deliberately does not do.
 *
 * It does not trust the request for anything that decides the outcome. The
 * token comes from the body and is validated; everything else - who is
 * asking, who deployed it, what message was signed - is rebuilt here. A
 * signature over text the caller supplied proves only that they can sign
 * something.
 *
 * It does not let a claim be transferred or re-pointed. A token has at most
 * one live claim, enforced by a partial unique index rather than by this
 * code, so two simultaneous requests cannot both win.
 *
 * It does not let the claimant revoke their own claim quietly. Revocation is
 * a moderator action with a reason attached, because the row is an audit
 * trail and a dev who has just rugged should not be able to erase the record
 * that this site showed a badge for them.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  let address = null
  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    address = session?.sub || null
  } catch {
    address = null
  }

  if (!address) return res.status(401).json({ error: 'Sign in first.' })

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Claims are not configured on this deployment.' })

  if (req.method === 'GET') return prepare(req, res, address)
  if (req.method === 'POST') return claim(req, res, db, address)
  if (req.method === 'DELETE') return revoke(req, res, db, address)

  res.setHeader('Allow', 'GET, POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

/**
 * Issue the exact message to be signed.
 *
 * The browser does not build this, and that is deliberate. The message names
 * the site, and the site's name as the browser knows it (`location.host`) and
 * as the server knows it (the forwarded host header) are two different
 * strings that agree almost always - behind a proxy, on a preview URL, on a
 * custom domain, "almost" is where a claim fails with a signature mismatch
 * nobody can debug.
 *
 * So the server builds it, hands it over with the nonce it just set as a
 * cookie, and rebuilds the same string to check the signature against. The
 * wallet still shows the text to the person, which is the part that has to be
 * readable; what it does not do is leave two implementations of one string in
 * two languages.
 */
async function prepare(req, res, address) {
  const limited = rateLimit(req, { key: 'token-claim-nonce', limit: 30, windowMs: 3_600_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }

  const token = asAddress(req.query?.token)
  if (!token) return res.status(400).json({ error: 'That is not a token address.' })

  const domain = [...allowedHosts(req)][0]
  if (!domain) return res.status(400).json({ error: 'This request did not name a known host.' })

  const nonce = randomBytes(16).toString('hex')
  const message = claimMessage({ domain, token, address, nonce })

  res.setHeader(
    'Set-Cookie',
    cookie(NONCE_COOKIE, await signNonce(nonce), { maxAge: 600, secure: isSecureRequest(req) })
  )

  return res.status(200).json({ message })
}

async function claim(req, res, db, address) {
  /*
   * Tight, because every attempt costs two calls to a node and the honest
   * use of this endpoint is once per token a person has ever launched.
   * Anything beyond a handful an hour is somebody walking addresses to find
   * out which ones they can claim, which the signature check refuses anyway -
   * this stops them making us pay for the asking.
   */
  const limited = rateLimit(req, { key: 'token-claim', limit: 10, windowMs: 3_600_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many claim attempts. Try again later.' })
  }

  const token = asAddress(req.body?.token)
  if (!token) return res.status(400).json({ error: 'That is not a token address.' })

  const signature = req.body?.signature
  if (typeof signature !== 'string') {
    return res.status(400).json({ error: 'Missing signature.' })
  }

  /*
   * The nonce, from the cookie rather than from the body.
   *
   * Same machinery as signing in, and the same reason: it pins the signature
   * to this attempt in this browser, so one captured elsewhere cannot be
   * replayed here.
   */
  const issued = await readNonce(getCookie(req, NONCE_COOKIE))
  if (!issued?.nonce) {
    return res.status(400).json({ error: 'This claim expired. Please try again.' })
  }

  /*
   * The message is rebuilt, never read from the request.
   *
   * This is the line the whole flow rests on. If the endpoint checked the
   * signature against a message the caller sent, a caller could send a
   * message saying anything - including one they had legitimately signed for
   * some other purpose - and the check would pass. Rebuilding it from the
   * session, the validated token and the cookie's nonce means the only thing
   * a valid signature can prove is the thing this endpoint is asking.
   */
  const domain = [...allowedHosts(req)][0]
  if (!domain) {
    return res.status(400).json({ error: 'This request did not name a known host.' })
  }

  const message = claimMessage({ domain, token, address, nonce: issued.nonce })

  const signed = await verifyMessage({ address, message, signature, client }).catch(() => false)
  if (!signed) {
    return res.status(401).json({ error: 'That signature did not match your wallet.' })
  }

  /*
   * And now what the chain says, which is the half that cannot be faked by
   * anybody holding a wallet.
   *
   * After the signature rather than before, so an unsigned request never
   * reaches a node. Null for a node that is down as well as for a token
   * whose deployer cannot be established, and both refuse the claim - see
   * api/_lib/deployer.js for why that is the only safe direction.
   */
  const chain = await findDeployer(token)
  if (!chain) {
    return res.status(503).json({
      error: 'The deploying wallet for this token could not be read from the chain. Try again later.',
    })
  }

  if (chain.deployer !== address) {
    /*
     * Deliberately says what it wanted, not who it found.
     *
     * Naming the deployer here would turn this endpoint into a free lookup
     * of "which wallet launched this token" for anybody signed in - which is
     * public information on the chain, but there is no reason to serve it
     * from a refusal, and a refusal that tells you what would have worked is
     * a refusal that invites the next attempt.
     */
    return res.status(403).json({
      error: 'This wallet did not send that token’s creation transaction.',
    })
  }

  // The profile row a claim points at, on the same terms as posting: created
  // when absent, never overwritten when present.
  const profile = await db
    .from('profiles')
    .upsert({ address }, { onConflict: 'address', ignoreDuplicates: true })

  if (profile.error) {
    console.error('claim: ensuring the profile row failed:', profile.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  const inserted = await db
    .from('token_claims')
    .insert({
      token_address: token,
      address,
      deployer: chain.deployer,
      creation_tx: chain.tx,
    })
    .select('token_address, address, claimed_at')
    .single()

  if (inserted.error) {
    /*
     * A unique violation here is the partial index doing its job: somebody
     * else's live claim already names this token. Answered as a conflict
     * rather than a server error, because it is an ordinary outcome and the
     * caller can act on it.
     */
    if (inserted.error.code === '23505') {
      return res.status(409).json({ error: 'This token has already been claimed.' })
    }
    console.error('claim: the insert failed:', inserted.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  return res.status(201).json({ claim: inserted.data })
}

async function revoke(req, res, db, address) {
  const admins = parseAdminAddresses(process.env.ADMIN_ADDRESSES)
  if (!isAdminAddress(address, admins)) {
    /*
     * 404 rather than 403, matching how the rest of this codebase answers a
     * moderator-only route: telling somebody the door exists and is locked
     * tells them there is a door.
     */
    return res.status(404).json({ error: 'Not found.' })
  }

  const token = asAddress(req.body?.token)
  if (!token) return res.status(400).json({ error: 'That is not a token address.' })

  /*
   * A reason is required, and that is not bureaucracy.
   *
   * This row is what answers "who vouched for this token and why did it
   * stop" on the afternoon somebody rugs. A revocation with no reason is a
   * row that says a moderator did something, which is the half of the story
   * nobody needs.
   */
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  if (reason.length < 3) {
    return res.status(400).json({ error: 'Give a reason for the revocation.' })
  }

  const { data, error } = await db
    .from('token_claims')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: address,
      revoked_reason: reason.slice(0, 500),
    })
    .eq('token_address', token)
    .is('revoked_at', null)
    .select('token_address, address')
    .maybeSingle()

  if (error) {
    console.error('claim: the revocation failed:', error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  // Nothing matched: there was no live claim to revoke. Not an error - a
  // moderator acting on a claim somebody already withdrew should be told it
  // is gone, not shown a failure.
  if (!data) return res.status(404).json({ error: 'No live claim on that token.' })

  return res.status(200).json({ revoked: data.token_address })
}
