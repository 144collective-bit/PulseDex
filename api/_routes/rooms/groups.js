import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { readTokenMetadata } from '../../_lib/tokenBalance.js'
import { isAdminAddress, parseAdminAddresses } from '../../../src/utils/chatAdmin.js'
import { groupSlug } from '../../../src/config/rooms.js'
import { asAddress } from '../../../src/utils/deployer.js'
import { toBaseUnits } from '../../../src/utils/gate.js'

/**
 * Making a group, changing what it requires, and taking it down.
 *
 * Moderators only, at first, and "at first" is doing real work in that
 * sentence. Letting anybody create a group means squatted names, spam, and
 * the tooling to deal with both - built before anyone has established that
 * people want groups at all. Starting closed is reversible in an afternoon;
 * starting open is not reversible at all, because the names are gone.
 *
 * Three methods on one route rather than three routes, because this
 * deployment has twelve serverless functions to spend and api/router.js
 * dispatches to all of them. They share the origin check, the session read,
 * the moderator check and the rate limit, which is most of what each of them
 * is.
 *
 * PATCH and DELETE are new, and the note they replace is worth keeping:
 *
 *   "A group may be gated on a token, which is set here rather than edited
 *    later ... changing a gate is a change to who may speak in a room people
 *    are already in, and it wants an audit row and a notice to the room -
 *    neither of which exists yet. A group with the wrong gate can be left
 *    alone and another made."
 *
 * That last sentence stopped being an answer the moment somebody made a group
 * with a typo in the amount: the wrong room stays in everybody's sidebar
 * forever. 0018_room_admin.sql adds the audit row, and the notice the room
 * draws comes from it.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'POST, PATCH, DELETE')
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

  const limited = rateLimit(req, { key: 'group-admin', limit: 40, windowMs: 3_600_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Groups are not configured on this deployment.' })

  if (req.method === 'PATCH') return editGroup(req, res, db, address)
  if (req.method === 'DELETE') return archiveGroup(req, res, db, address)

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

  const asked = await readGate(req.body)
  if (asked.error) return res.status(asked.status).json({ error: asked.error })
  const gate = asked.gate

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
    .select(GROUP_FIELDS)
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

/** What a group row looks like coming back out, in one place so create and
 *  edit cannot disagree about it. */
const GROUP_FIELDS = 'slug, name, blurb, gate_token, min_balance, gate_decimals, gate_symbol'

/**
 * The gate somebody asked for, read off the request.
 *
 * Shared by create and edit, which is the point: this reads an amount a
 * person typed and converts it using the token's own decimals from the chain.
 * Two copies of that would be two chances to store a gate in a scale nobody
 * checked.
 *
 * Returns `{ gate }` where gate is the columns to write, or null for "no
 * gate" - which on an edit means removing one. An error comes back as
 * `{ error, status }` rather than being thrown, so the caller answers in its
 * own words.
 */
async function readGate(body) {
  const wanted = body?.gateToken

  // Absent, null or empty all mean no gate. On create that is an open group;
  // on edit it is a request to open one that was gated.
  if (wanted === undefined || wanted === null || wanted === '') return { gate: null }

  const token = asAddress(wanted)
  if (!token) return { error: 'That is not a token address.', status: 400 }

  const metadata = await readTokenMetadata(token)
  if (!metadata) {
    /*
     * Refused rather than guessing eighteen decimals. Eighteen is the common
     * case and the uncommon one is a six-decimal stablecoin, where the guess
     * makes the gate a trillion times too high - a room nobody can post in,
     * for a reason nobody can see.
     */
    return {
      error: 'That token could not be read from the chain. Check the address, or try again later.',
      status: 503,
    }
  }

  const min = toBaseUnits(body?.minBalance, metadata.decimals)
  if (min === null || min <= 0n) {
    return {
      error: `Give a minimum holding above zero, with at most ${metadata.decimals} decimal places.`,
      status: 400,
    }
  }

  return {
    gate: {
      gate_token: token,
      // Sent as a string: a numeric(78,0) does not fit in a JSON number, and
      // JSON.stringify turns a BigInt into an exception rather than a value.
      min_balance: min.toString(),
      gate_decimals: metadata.decimals,
      gate_symbol: metadata.symbol,
    },
  }
}

/** The group this request is about, or null. Groups only: the fixed five are
 *  in the config file and a token room belongs to whoever is talking about
 *  that token, so neither is a moderator's to edit or take down here. */
function askedGroup(body) {
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  return /^group-[a-z0-9][a-z0-9-]{0,22}[a-z0-9]$/.test(slug) ? slug : null
}

/**
 * Change what a group requires, or what it says about itself.
 *
 * The gate is replaced wholesale rather than patched field by field: a gate
 * is a token and an amount together, and an endpoint that let one change
 * without the other would be a way to leave a room gated on an amount in the
 * wrong scale. Sending no `gateToken` removes the gate and opens the room,
 * which is a change worth recording like any other.
 *
 * Every change writes a row to `room_gate_changes` before the room is
 * updated. That order matters: an audit that is written afterwards is an
 * audit missing exactly the changes that failed halfway.
 */
async function editGroup(req, res, db, address) {
  const slug = askedGroup(req.body)
  if (!slug) return res.status(400).json({ error: 'That is not a group.' })

  const existing = await db
    .from('rooms')
    .select('slug, kind, archived_at')
    .eq('slug', slug)
    .maybeSingle()

  if (existing.error) {
    console.error('groups: reading the room failed:', existing.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }
  // 404 for a room that is not there and for one already taken down. Editing
  // an archived room would put a rule on something nobody can reach.
  if (!existing.data || existing.data.kind !== 'group' || existing.data.archived_at) {
    return res.status(404).json({ error: 'Not found.' })
  }

  const asked = await readGate(req.body)
  if (asked.error) return res.status(asked.status).json({ error: asked.error })

  /* All-null when the gate is being removed, which is the same spelling
     `rooms` uses for a room with no gate - so the history and the room agree
     about what open means. */
  const gate = asked.gate || {
    gate_token: null,
    min_balance: null,
    gate_decimals: null,
    gate_symbol: null,
  }

  const noted = await db.from('room_gate_changes').insert({
    room: slug,
    changed_by: address,
    ...gate,
  })

  if (noted.error) {
    /*
     * Refused rather than changed silently. Everywhere else in this codebase
     * a failed audit row is swallowed so it cannot cost somebody their post -
     * the opposite call, and right there, because the post is the valuable
     * thing. Here the audit IS the valuable thing: it is what answers "why
     * can I no longer post in a room I was posting in yesterday", and a gate
     * change nobody can account for is worse than one that did not happen.
     */
    console.error('groups: recording the gate change failed:', noted.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  const blurb =
    typeof req.body?.blurb === 'string' ? req.body.blurb.trim().slice(0, 140) || null : undefined

  const updated = await db
    .from('rooms')
    .update({ ...gate, ...(blurb === undefined ? {} : { blurb }) })
    .eq('slug', slug)
    .select(GROUP_FIELDS)
    .single()

  if (updated.error) {
    console.error('groups: the update failed:', updated.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  return res.status(200).json({ group: updated.data })
}

/**
 * Take a group down.
 *
 * Archived, never deleted. `messages.room` is a foreign key to `rooms`, so a
 * real delete either cascades - taking every message in the room with it - or
 * is refused. A room is taken down because of what is in it or because it was
 * a mistake, and in the first case the conversation is the evidence: deleting
 * it destroys the record of the thing that justified the deletion.
 *
 * The room leaves the sidebar because 0018 narrowed the anon read policy to
 * live rooms. The messages stay readable, so a link somebody was sent still
 * works - a conversation that silently evaporates is a worse answer to "what
 * was said here" than one that is plainly closed.
 */
async function archiveGroup(req, res, db, address) {
  const slug = askedGroup(req.body)
  if (!slug) return res.status(400).json({ error: 'That is not a group.' })

  /*
   * Only a room that is not already archived, in the filter rather than in a
   * read beforehand. Two moderators pressing this at once would otherwise
   * both pass the check and the second would overwrite who did it and when.
   */
  const updated = await db
    .from('rooms')
    .update({ archived_at: new Date().toISOString(), archived_by: address })
    .eq('slug', slug)
    .eq('kind', 'group')
    .is('archived_at', null)
    .select('slug')

  if (updated.error) {
    console.error('groups: archiving failed:', updated.error.message)
    return res.status(503).json({ error: 'That could not be saved.' })
  }

  // Nothing matched: no such group, or somebody got there first. The same
  // answer either way, for the same reason the moderator check gives 404.
  if (!updated.data || updated.data.length === 0) {
    return res.status(404).json({ error: 'Not found.' })
  }

  return res.status(200).json({ ok: true, slug })
}
