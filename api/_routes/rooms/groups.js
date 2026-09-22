import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { readTokenMetadata } from '../../_lib/tokenBalance.js'
import { isAdminAddress, parseAdminAddresses } from '../../../src/utils/chatAdmin.js'
import { groupSlug } from '../../../src/config/rooms.js'
import { asAddress } from '../../../src/utils/deployer.js'
import { toBaseUnits } from '../../../src/utils/gate.js'

/**
 * Making a group.
 *
 * Moderators only, at first, and "at first" is doing real work in that
 * sentence. Letting anybody create a group means squatted names, spam, and
 * the tooling to deal with both - built before anyone has established that
 * people want groups at all. Starting closed is reversible in an afternoon;
 * starting open is not reversible at all, because the names are gone.
 *
 * A group may be gated on a token, which is set here rather than edited
 * later. That is a limitation and a deliberate one for now: changing a gate
 * is a change to who may speak in a room people are already in, and it wants
 * an audit row and a notice to the room - neither of which exists yet. A
 * group with the wrong gate can be left alone and another made.
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

  let address = null
  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    address = session?.sub || null
  } catch {
    address = null
  }

  if (!address) return res.status(401).json({ error: 'Sign in first.' })

  /*
   * 404 rather than 403, matching every other moderator-only route here.
   * Telling somebody the door exists and is locked tells them there is a
   * door.
   */
  const admins = parseAdminAddresses(process.env.ADMIN_ADDRESSES)
  if (!isAdminAddress(address, admins)) {
    return res.status(404).json({ error: 'Not found.' })
  }

  const limited = rateLimit(req, { key: 'group-create', limit: 20, windowMs: 3_600_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Groups are not configured on this deployment.' })

  /*
   * The slug and the display name are two different things from one field,
   * and both are kept. `groupSlug` lowercases and validates; the name is
   * stored as typed, so a group can be called "The Trenches" while living at
   * `group-the-trenches`.
   */
  const wanted = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const slug = groupSlug(wanted)
  if (!slug) {
    return res.status(400).json({
      error:
        'A group name is 2 to 24 characters: letters, numbers and single hyphens. Some names are reserved.',
    })
  }

  const blurb = typeof req.body?.blurb === 'string' ? req.body.blurb.trim().slice(0, 140) : null

  /*
   * The gate, if there is one.
   *
   * The amount arrives as something a person typed - "1000", "0.5" - and is
   * converted here using the token's own decimals, read from the chain. Doing
   * it at creation rather than at post time means the comparison later is two
   * integers, and means a gate cannot be stored in a scale nobody checked.
   */
  let gate = null
  if (req.body?.gateToken !== undefined && req.body?.gateToken !== null && req.body?.gateToken !== '') {
    const token = asAddress(req.body.gateToken)
    if (!token) return res.status(400).json({ error: 'That is not a token address.' })

    const metadata = await readTokenMetadata(token)
    if (!metadata) {
      /*
       * Refused rather than guessing eighteen decimals. Eighteen is the
       * common case and the uncommon one is a six-decimal stablecoin, where
       * the guess makes the gate a trillion times too high - a room nobody
       * can post in, for a reason nobody can see.
       */
      return res.status(503).json({
        error: 'That token could not be read from the chain. Check the address, or try again later.',
      })
    }

    const min = toBaseUnits(req.body?.minBalance, metadata.decimals)
    if (min === null || min <= 0n) {
      return res.status(400).json({
        error: `Give a minimum holding above zero, with at most ${metadata.decimals} decimal places.`,
      })
    }

    gate = {
      gate_token: token,
      // Sent as a string: a numeric(78,0) does not fit in a JSON number, and
      // JSON.stringify turns a BigInt into an exception rather than a value.
      min_balance: min.toString(),
      gate_decimals: metadata.decimals,
      gate_symbol: metadata.symbol,
    }
  }

  const inserted = await db
    .from('rooms')
    .insert({
      slug,
      kind: 'group',
      name: wanted.slice(0, 40),
      blurb: blurb || null,
      created_by: address,
      ...gate,
    })
    .select('slug, name, blurb, gate_token, min_balance, gate_decimals, gate_symbol')
    .single()

  if (inserted.error) {
    // The primary key doing its job: that name is taken.
    if (inserted.error.code === '23505') {
      return res.status(409).json({ error: 'A group already goes by that name.' })
    }
    console.error('groups: the insert failed:', inserted.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  return res.status(201).json({ group: inserted.data })
}
