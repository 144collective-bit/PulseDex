import { serviceClient } from '../_lib/supabase.js'
import { MESSAGE_FIELDS, POST_FIELDS } from '../../src/config/queries.js'

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
  const db = serviceClient()
  checks.push({ name: 'supabase-configured', ok: Boolean(db) })
  checks.push({ name: 'session-secret', ok: (process.env.SESSION_SECRET || '').length >= 32 })

  if (db) {
    /*
     * The queries themselves. `head: true` asks for a count and no rows, so
     * this exercises exactly the parsing and relationship resolution that
     * breaks, and returns nobody's messages while doing it.
     */
    checks.push(await query(db, 'messages-select', 'messages', MESSAGE_FIELDS))
    checks.push(await query(db, 'posts-select', 'posts', POST_FIELDS))

    // The tables with no read policy, which the endpoints reach with the
    // service role. A failure here means moderation is broken even though
    // everything a visitor can see still works.
    checks.push(await query(db, 'blocked-table', 'blocked', 'address'))
    checks.push(await query(db, 'reports-table', 'post_reports', 'id'))
    checks.push(await query(db, 'reactions-table', 'message_reactions', 'emoji'))
    checks.push(await query(db, 'follows-table', 'follows', 'follower'))
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
