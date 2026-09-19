import { SESSION_COOKIE, getCookie, readSession } from '../_lib/session.js'
import { isSameOrigin, rateLimit } from '../_lib/guard.js'
import { serviceClient } from '../_lib/supabase.js'
import {
  normaliseMessage,
  normaliseHandle,
  normaliseAvatarId,
  REJECTED,
} from '../../src/utils/chatMessage.js'
import { parseAdminAddresses, isAdminAddress } from '../../src/utils/chatAdmin.js'
import {
  exceededLimit,
  retryAfterSeconds,
  LONGEST_WINDOW_MS,
} from '../../src/utils/chatRate.js'

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
  if (req.method === 'DELETE') return remove(req, res)

  res.setHeader('Allow', 'POST, DELETE')
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

  const message = normaliseMessage(req.body?.body)
  if (!message.ok) {
    return res.status(400).json({ error: REFUSALS[message.reason] || 'That message cannot be posted.' })
  }

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
   * The profile is written on every post, not only the first.
   *
   * Messages point at a profile row rather than carrying a name, so one has to
   * exist before the insert - and upserting here means a display name changed
   * in settings shows up on the next message without a separate save step. It
   * also means renaming yourself renames you on every message you have ever
   * posted, which is the trade for not copying the name onto each row.
   */
  const profile = await db.from('profiles').upsert(
    {
      address,
      handle: normaliseHandle(req.body?.handle),
      avatar_id: normaliseAvatarId(req.body?.avatarId),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'address' },
  )

  if (profile.error) {
    console.error('chat: writing the profile failed:', profile.error.message)
    return res.status(503).json({ error: 'Chat is unavailable right now.' })
  }

  const inserted = await db
    .from('messages')
    .insert({ address, body: message.body })
    .select('id, address, body, created_at')
    .single()

  if (inserted.error) {
    console.error('chat: the insert failed:', inserted.error.message)
    return res.status(503).json({ error: 'Chat is unavailable right now.' })
  }

  return res.status(201).json({ message: inserted.data })
}

async function remove(req, res) {
  const address = await signedInAddress(req)
  if (!address) return res.status(401).json({ error: 'Sign in first.' })

  const admins = parseAdminAddresses(process.env.ADMIN_ADDRESSES)
  if (!isAdminAddress(address, admins)) {
    /*
     * 404 rather than 403, deliberately. A 403 confirms the endpoint exists
     * and does something worth protecting, which is a hint worth not giving
     * for a route whose whole security is a list of addresses in an
     * environment variable.
     */
    return res.status(404).json({ error: 'Not found.' })
  }

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

  const removed = await db
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')

  if (removed.error) {
    console.error('chat: the removal failed:', removed.error.message)
    return res.status(503).json({ error: 'Chat is unavailable right now.' })
  }

  // An empty result means it was already gone. Answered as success: the caller
  // wanted the message removed, and it is.
  return res.status(200).json({ id, removed: removed.data.length > 0 })
}
