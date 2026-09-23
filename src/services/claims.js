import { supabase, hasSupabase } from '../config/supabase'
import { CLAIM_FIELDS } from '../config/queries'
import { dbError } from '../utils/dbError'
import { asAddress } from '../utils/deployer'

/**
 * Dev claims: who has proved control of a token's deploying wallet.
 *
 * Reads come straight from Supabase over the anon key, which the select
 * policy restricts to live claims - a revoked one looks from here exactly
 * like a token nobody ever claimed, which is the right shape: the badge goes
 * away and nothing accuses anybody.
 *
 * Writes go to /api/token/claim, which is the only thing that checks a
 * signature against what the chain says. Nothing in this file can grant a
 * badge, and that is deliberate.
 */

/**
 * The live claim on a token, or null.
 *
 * @param {string} tokenAddress
 * @returns {Promise<{address: string, claimedAt: string}|null>}
 */
export async function fetchTokenClaim(tokenAddress) {
  const token = asAddress(tokenAddress)
  if (!hasSupabase || !token) return null

  const { data, error } = await supabase
    .from('token_claims')
    .select(CLAIM_FIELDS)
    .eq('token_address', token)
    // Belt and braces: the policy already hides revoked rows, and stating it
    // here means a policy loosened later does not quietly start drawing
    // badges for revoked claims.
    .is('revoked_at', null)
    .maybeSingle()

  if (error) throw dbError(error, 'load this token’s claim')
  return data ? { address: data.address, claimedAt: data.claimed_at } : null
}

/**
 * Every token this account has claimed.
 *
 * For the profile, where the honest phrasing is a list of addresses rather
 * than a count: "claimed 4 tokens" reads as a credential, and four claims on
 * four launches nobody has heard of is not one.
 *
 * @param {string} address
 * @returns {Promise<{token: string, claimedAt: string}[]>}
 */
export async function fetchClaimsBy(address) {
  const who = asAddress(address)
  if (!hasSupabase || !who) return []

  const { data, error } = await supabase
    .from('token_claims')
    .select(CLAIM_FIELDS)
    .eq('address', who)
    .is('revoked_at', null)
    .order('claimed_at', { ascending: false })
    .limit(20)

  if (error) throw dbError(error, 'load this account’s claims')
  return (data || []).map((row) => ({ token: row.token_address, claimedAt: row.claimed_at }))
}

/**
 * Ask the server for the message to sign.
 *
 * The message is built server-side so that the site's name in it is the one
 * the server will rebuild when it checks the signature. Two implementations
 * of one string, in two languages, is a claim that fails on a preview URL
 * with a mismatch nobody can debug.
 */
export async function prepareClaim(token) {
  const res = await fetch(`/api/token/claim?token=${encodeURIComponent(token)}`, {
    credentials: 'same-origin',
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'That could not be started.')
  return payload.message
}

/**
 * Submit the signature.
 *
 * The message is not sent back. The server rebuilds it from the session, the
 * token and the nonce cookie - a signature checked against a message the
 * caller supplied would prove only that the caller can sign something.
 */
export async function submitClaim({ token, signature }) {
  const res = await fetch('/api/token/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ token, signature }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'That claim could not be recorded.')
  return payload.claim
}

/** Take a claim away. Moderators only; the endpoint answers 404 to anybody
 *  else, so this offers no way to discover that the route exists. */
export async function revokeClaim({ token, reason }) {
  const res = await fetch('/api/token/claim', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ token, reason }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'That could not be revoked.')
  return payload.revoked
}
