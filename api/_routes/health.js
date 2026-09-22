import { serviceClient, anonClient } from '../_lib/supabase.js'
import { MESSAGE_FIELDS, NOTIFICATION_FIELDS, POST_FIELDS, PUBLIC_PROFILE_FIELDS, ROOM_FIELDS } from '../../src/config/queries.js'

/**
 * Does this deployment actually work?
 *
 * Every other check in this project stops at the seam between our code and a
 * service. Lint reads syntax, the suite runs pure functions, check:api imports
 * modules without calling them, and the build compiles the client. A select
 * string is text, so it is valid JavaScript whatever it says - the first thing
 * to disagree is Postgres, in production, in front of people. That has now
 * happened twice: an ambiguous embed took the chat down, and had been quietly
 * breaking the feed for a day before anybody looked.
 *
 * This runs the real query strings - imported from src/config/queries.js, not
 * copied - against the real database, and says which ones worked. A smoke test
 * then needs one request to know whether a deployment is sound.
 *
 * Deliberately readable by anyone. It reports whether our own queries parse,
 * which is a fact about our schema rather than about anybody's data, and no
 * row is ever returned: every query asks for a `head` count. The alternative,
 * putting it behind the moderator list, would mean the check that tells us the
 * site is broken is one CI cannot reach.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const checks = []

  /*
   * Which commit this is.
   *
   * Here because of a specific failure. A rollback pins production, so every
   * deploy afterwards builds, goes green, reports itself ready - and never
   * takes the domain. The fix sat serving nobody for ten minutes while its own
   * deployment URL answered perfectly, which is what was checked.
   *
   * Reporting the commit turns "did this build work" into "is this what the
   * domain is serving", and those are not the same question. A smoke test can
   * compare it against the commit it expected and fail loudly when they
   * differ.
   */
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || null

  /*
   * Configuration first, and reported rather than thrown.
   *
   * A deployment with no Supabase keys is misconfigured, not broken - the app
   * says "chat is not configured here" and works otherwise. Saying which it is
   * turns "the smoke test failed" into something actionable.
   */
  /*
   * Two clients, because two different questions are being asked.
   *
   * `reader` is whichever connection exists. The selects below are the part
   * that has actually broken in production - a column a migration never added,
   * an embed PostgREST cannot disambiguate - and none of that depends on which
   * key asks: a `profiles` embed with two paths to it fails identically for
   * the anon key and the service role.
   *
   * So a deployment holding only the anon key can still prove its schema. That
   * is what lets a Preview build verify a pull request against the real
   * database without being handed the production service role key, which would
   * give every branch full write access to live data before anybody reviewed
   * it.
   */
  const db = serviceClient()
  const reader = db || anonClient()

  checks.push({ name: 'supabase-configured', ok: Boolean(reader) })
  checks.push({ name: 'session-secret', ok: (process.env.SESSION_SECRET || '').length >= 32 })

  if (reader) {
    /*
     * The queries themselves. `head: true` asks for a count and no rows, so
     * this exercises exactly the parsing and relationship resolution that
     * breaks, and returns nobody's messages while doing it.
     */
    checks.push(await query(reader, 'messages-select', 'messages', MESSAGE_FIELDS))
    checks.push(await query(reader, 'posts-select', 'posts', POST_FIELDS))
    checks.push(await query(reader, 'profiles-select', 'profiles', PUBLIC_PROFILE_FIELDS))
    checks.push(await query(reader, 'reactions-table', 'message_reactions', 'emoji'))
    checks.push(await query(reader, 'follows-table', 'follows', 'follower'))
    // Added by 0010. A deployment whose migration has not been run reports
    // this as failing instead of presenting as a feed that will not load.
    checks.push(await query(reader, 'mentions-table', 'post_mentions', 'address'))
    /*
     * Added by 0011. Both halves: the table, and the function that counts
     * against it. A function is the one thing here that can be absent while
     * every table it touches is present - `create or replace` on a deployment
     * whose migration has not been run leaves the app asking PostgREST for an
     * RPC that does not exist, which presents as a sidebar with no badges and
     * no reason why.
     */
    checks.push(await query(reader, 'room-reads-table', 'room_reads', 'room'))
    /*
     * The room list, which as of 0014 lives in the database rather than only
     * in src/config/rooms.js. Anon-readable, because both the sidebar's token
     * rooms and the token page read it straight from the browser.
     */
    checks.push(await query(reader, 'rooms-select', 'rooms', ROOM_FIELDS))
  }

  /*
   * The tables with no read policy at all, which only the service role can
   * reach. A failure here means moderation or the inbox is broken even though
   * everything a visitor can see still works.
   *
   * Absent rather than failed when there is no service role key. A Preview
   * deployment is not misconfigured for lacking one - it is deliberately
   * without it - and reporting that as a failure would make every preview red
   * and teach everybody to ignore the colour.
   */
  if (reader) {
    // The unread-count function, called the way the endpoint calls it. An
    // address nobody holds returns no rows, which is a pass: the question is
    // whether the function exists and its body still parses.
    const probe = await reader.rpc('unread_counts', { reader: '0x' + '0'.repeat(40) })
    checks.push(
      probe.error
        ? { name: 'unread-counts-fn', ok: false, error: probe.error.message }
        : { name: 'unread-counts-fn', ok: true }
    )
  }

  if (db) {
    /*
     * `note_room_message` is deliberately not probed here, unlike
     * `unread_counts` above.
     *
     * That one is a read and calling it costs nothing. This one writes - it
     * creates a room and bumps its count - and this endpoint is polled. A
     * probe would add a message to the Lounge's tally every time anybody
     * checked whether the site was up, which is a health check quietly
     * corrupting the thing it is reporting on. The `rooms` select above
     * proves the table and its shape; the function is exercised by posting.
     */

    checks.push(await query(db, 'blocked-table', 'blocked', 'address'))
    checks.push(await query(db, 'reports-table', 'post_reports', 'id'))
    /*
     * The whole select the inbox uses, not just a column from the table.
     * Checking `kind` alone proved the table existed and said nothing about
     * the embed beside it - which is the half that actually breaks.
     */
    checks.push(await query(db, 'notifications-select', 'notifications', NOTIFICATION_FIELDS))
  } else if (reader) {
    checks.push({ name: 'service-role', ok: true, note: 'absent: private tables not checked' })
  }

  const ok = checks.every((check) => check.ok)

  /*
   * 503 when something is wrong, so a smoke test can judge on the status code
   * alone and anything watching a URL notices without parsing a body.
   */
  return res.status(ok ? 200 : 503).json({ ok, commit, checks })
}

/**
 * Run one select and report whether the database accepted it.
 *
 * The error message is included, and that is a considered choice. These
 * failures name our own tables and columns - "more than one relationship was
 * found for 'messages' and 'profiles'" - which anyone holding the anon key can
 * discover anyway, and without it a red smoke test says only that something is
 * wrong. The message is what makes it a diagnosis.
 */
async function query(db, name, table, select) {
  const { error } = await db.from(table).select(select, { head: true, count: 'exact' }).limit(1)
  return error ? { name, ok: false, error: error.message } : { name, ok: true }
}
