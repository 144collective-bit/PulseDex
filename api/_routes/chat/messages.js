import { SESSION_COOKIE, getCookie, readSession } from '../../_lib/session.js'
import { isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { normaliseMessage, REJECTED } from '../../../src/utils/chatMessage.js'
import { parseAdminAddresses, isAdminAddress } from '../../../src/utils/chatAdmin.js'
import { isRoom } from '../../../src/config/rooms.js'
import {
  exceededLimit,
  retryAfterSeconds,
  LONGEST_WINDOW_MS,
} from '../../../src/utils/chatRate.js'

/**
 * Posting and removing chat messages.
 *
 * Every write to the chat goes through here, because this is the only place
 * that holds the service role key. The browser can read the database directly
 * with the anon key - row level security allows that and nothing else - so the
 * question this endpoint exists to answer is the one the database cannot: is
 * the person sending this the owner of the address they are posting as.
 *
 * It is answered by the sign-in cookie, which is a signed statement that a
 * wallet produced a signature for this browser. The address is never read from
 * the request body. A body that could name its own author would let anyone
 * post as anyone, which on a chat about which tokens to buy is the whole game.
 *
 * The decisions this leans on - what a message may contain, how often one
 * wallet may post, who may remove a message - all live in src/utils with
 * tests. What is left here is the order they are applied in.
 */

/** The reason a body was refused, in a sentence rather than a code. */
const REFUSALS = {
  [REJECTED.notText]: 'A message has to be text.',
  [REJECTED.empty]: 'Write something first.',
  [REJECTED.tooLong]: 'That message is too long.',
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  /*
   * Checked before anything else, and before the method is even considered.
   * SameSite=Lax already stops a browser attaching the session cookie to a
   * cross-site POST; this is the second lock, for the same reason guard.js
   * exists at all.
   */
  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  if (req.method === 'POST') return post(req, res)
  if (req.method === 'PUT') return edit(req, res)
  if (req.method === 'DELETE') return remove(req, res)

  res.setHeader('Allow', 'POST, PUT, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

/** Who this request is, by the cookie alone. */
async function signedInAddress(req) {
  try {
    const session = await readSession(getCookie(req, SESSION_COOKIE))
    return session?.sub || null
  } catch {
    // A missing or short SESSION_SECRET. Reads as signed out, which is the
    // same answer sign-in itself gives, rather than a different error the UI
    // would have to learn about.
    return null
  }
}

async function post(req, res) {
  /*
   * The per-IP limiter first, ahead of the database.
   *
   * It is in-memory and therefore per instance, so it is not the real control
   * - the per-address check below is. Its job is to keep an unauthenticated
   * flood from costing a database round trip each, which is the difference
   * between a nuisance and a bill.
   */
  const limited = rateLimit(req, { key: 'chat-post', limit: 30, windowMs: 60_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }

  const address = await signedInAddress(req)
  if (!address) {
    return res.status(401).json({ error: 'Connect a wallet and sign in to post.' })
  }

  const db = serviceClient()
  if (!db) {
    // Unavailable rather than broken, matching how sign-in answers a missing
    // SESSION_SECRET. This code reaches a deployment before its variables do.
    return res.status(503).json({ error: 'Chat is not configured on this deployment.' })
  }

  /*
   * Blocked before anything else that costs something.
   *
   * Answered as 403 with a plain sentence, and deliberately without a reason.
   * The reason column exists for whoever reads the table in six months, not
   * for the account it describes - telling somebody precisely which rule they
   * broke is telling them precisely what to avoid next time.
   */
  const { data: blocked, error: blockedError } = await db
    .from('blocked')
    .select('address')
    .eq('address', address)
    .maybeSingle()

  if (blockedError) {
    console.error('chat: reading the blocklist failed:', blockedError.message)
    return res.status(503).json({ error: 'Chat is unavailable right now.' })
  }

  if (blocked) {
    return res.status(403).json({ error: 'You cannot post here.' })
  }

  const message = normaliseMessage(req.body?.body)
  if (!message.ok) {
    return res.status(400).json({ error: REFUSALS[message.reason] || 'That message cannot be posted.' })
  }

  /*
   * The room is checked against the list, not merely against the slug shape.
   *
   * It arrives in a request body, and a body is whatever the sender decided to
   * send. A slug that only satisfies the database's shape constraint would
   * create a room that exists in the data and nowhere in the app: absent from
   * the sidebar, unreachable by navigation, and so unmoderatable through the
   * interface built to moderate it.
   *
   * Refused rather than redirected into the default. A post is a write, and
   * quietly filing somebody's message somewhere other than where they aimed it
   * is worse than telling them it did not go.
   */
  const room = req.body?.room
  if (!isRoom(room)) {
    return res.status(400).json({ error: 'That room does not exist.' })
  }

  /*
   * Counted across every room, not per room.
   *
   * The limit exists to stop one wallet making the chat unreadable, and five
   * rooms would otherwise multiply the allowance by five - the same flood,
   * spread out, which is no better for anyone trying to read.
   */
  const since = new Date(Date.now() - LONGEST_WINDOW_MS).toISOString()
  const recent = await db
    .from('messages')
    .select('created_at')
    .eq('address', address)
    .gte('created_at', since)

  if (recent.error) {
    console.error('chat: reading recent posts failed:', recent.error.message)
    return res.status(503).json({ error: 'Chat is unavailable right now.' })
  }

  const over = exceededLimit(
    recent.data.map((row) => Date.parse(row.created_at)),
    Date.now(),
  )
  if (over) {
    res.setHeader('Retry-After', String(retryAfterSeconds(over.retryAfterMs)))
    return res.status(429).json({
      error:
        over.windowMs <= 60_000
          ? 'Slow down a moment.'
          : 'You have posted a lot recently. Try again shortly.',
    })
  }

  /*
   * A profile row has to exist, because a message points at one - but posting
   * no longer writes a name into it.
   *
   * It used to. The handle rode along with each message and overwrote the row
   * every time, which made the browser's localStorage the authority on who
   * somebody was: a second device, with its own default name, would rename
   * them on their next message. /api/profile owns the name now, and this only
   * guarantees the row is there.
   *
   * `ignoreDuplicates` is what makes that true - it inserts when absent and
   * does nothing when present, so an account that has chosen a handle cannot
   * lose it by posting.
   */
  const profile = await db
    .from('profiles')
    .upsert({ address }, { onConflict: 'address', ignoreDuplicates: true })

  if (profile.error) {
    console.error('chat: ensuring the profile row failed:', profile.error.message)
    return res.status(503).json({ error: 'Chat is unavailable right now.' })
  }

  const inserted = await db
    .from('messages')
    .insert({ address, room, body: message.body })
    /*
     * The author's profile comes back with the row, so the message the poster
     * sees immediately carries their own name and picture. Without the join
     * the reply is a bare row, which renders as an address and a generated
     * mark until the realtime feed brings the same message round again with
     * the profile attached - a visible flicker, on your own message, every
     * time you post.
     */
    .select('id, address, room, body, created_at, profiles ( handle, avatar_id, avatar_url )')
    .single()

  if (inserted.error) {
    console.error('chat: the insert failed:', inserted.error.message)
    return res.status(503).json({ error: 'Chat is unavailable right now.' })
  }

  return res.status(201).json({ message: inserted.data })
}

/**
 * Change what you said.
 *
 * Yours only, and there is no moderator version - a moderator can remove a
 * message, which is visible, but putting words in somebody's mouth is a
 * different power and nothing here needs it.
 *
 * Always stamps `edited_at`, which the interface renders as an "edited"
 * marker. That marker is the reason this is allowed at all: a silent edit is
 * a way to change what you said after somebody replied to it, and in a room
 * about what to buy, "I said sell" after the fact is worth money.
 */
async function edit(req, res) {
  const address = await signedInAddress(req)
  if (!address) return res.status(401).json({ error: 'Sign in first.' })

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Chat is not configured on this deployment.' })

  const id = Number(req.body?.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Which message?' })

  // The same normalising the original went through, from the same function,
  // so an edit cannot smuggle in what a post could not.
  const message = normaliseMessage(req.body?.body)
  if (!message.ok) {
    return res.status(400).json({ error: REFUSALS[message.reason] || 'That message cannot be posted.' })
  }

  /*
   * The author check is the `eq` on address, not a read followed by a
   * comparison. One statement, so there is no window between checking who owns
   * the row and writing to it - and no branch that could be got wrong.
   */
  const updated = await db
    .from('messages')
    .update({ body: message.body, edited_at: new Date().toISOString() })
    .eq('id', id)
    .eq('address', address)
    .is('deleted_at', null)
    .select('id, address, room, body, created_at, edited_at, profiles ( handle, avatar_id, avatar_url )')

  if (updated.error) {
    console.error('chat: the edit failed:', updated.error.message)
    return res.status(503).json({ error: 'Chat is unavailable right now.' })
  }

  /*
   * Nothing updated means the message is not yours, is already removed, or
   * never existed. All three answer the same way, so this cannot be used to
   * ask who wrote a given id.
   */
  if (!updated.data.length) return res.status(404).json({ error: 'Not found.' })

  return res.status(200).json({ message: updated.data[0] })
}

async function remove(req, res) {
  const address = await signedInAddress(req)
  if (!address) return res.status(401).json({ error: 'Sign in first.' })

  const db = serviceClient()
  if (!db) return res.status(503).json({ error: 'Chat is not configured on this deployment.' })

  /*
   * Read from the query string rather than the body. A DELETE with a body is
   * legal but awkward - the dev server's shim only parses one for POST and
   * PUT, so a body here would work on Vercel and fail locally, which is the
   * worst place for a difference to live.
   */
  const id = Number(new URL(req.url, 'http://localhost').searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Which message?' })
  }

  /*
   * Two ways to be allowed: it is yours, or you are a moderator.
   *
   * Until now only a moderator could remove anything, which meant somebody who
   * posted a wallet address by mistake had to ask one. Expressed as a filter
   * rather than a branch - a moderator's update is unrestricted, everybody
   * else's carries `eq('address', ...)` - so the author check happens inside
   * the statement that writes, with no window in between.
   */
  const admins = parseAdminAddresses(process.env.ADMIN_ADDRESSES)
  const moderator = isAdminAddress(address, admins)

  let update = db
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (!moderator) update = update.eq('address', address)

  const removed = await update.select('id')

  if (removed.error) {
    console.error('chat: the removal failed:', removed.error.message)
    return res.status(503).json({ error: 'Chat is unavailable right now.' })
  }

  /*
   * Nothing updated means it was already gone, or was never theirs to remove.
   *
   * A moderator gets success either way - they wanted it gone and it is. For
   * anybody else the two cases answer 404 together, so this does not become a
   * way of asking whether a given id exists and who wrote it.
   */
  if (!removed.data.length && !moderator) return res.status(404).json({ error: 'Not found.' })

  return res.status(200).json({ id, removed: removed.data.length > 0 })
}
