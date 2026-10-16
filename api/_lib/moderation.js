import { shouldAutoHide } from '../../src/utils/autoHide.js'

/**
 * Recording what a moderator did, and hiding a post when enough of the right
 * people report it.
 *
 * One module writes `moderation_log`, and that is deliberate rather than
 * incidental: 0021 says the table is append-only by discipline and not by
 * constraint, and the discipline is this file. Nothing else inserts into it,
 * nothing at all updates or deletes from it, so "is the audit trail
 * trustworthy" is a question about one function instead of about every route
 * that moderates something.
 *
 * Both functions are deliberately unable to fail their caller. See logAction
 * for why, at length - it is the decision in here most likely to look like
 * sloppiness.
 */

/**
 * Write one line of the audit trail.
 *
 * **Never throws, and never reports failure to its caller.** That is the whole
 * design of this function and it is worth defending, because the obvious
 * reading is that a logging failure should be loud.
 *
 * The actions being logged are a block, a removal, a hide. Each of them has
 * already happened by the time this is called - the row is written, the post
 * is gone. If this threw, a route would have to choose between answering 503
 * to a moderator whose action succeeded, which invites them to do it again,
 * and swallowing the error itself, which puts this same try/catch in nine
 * places. The failure that matters is logged to the console, where a
 * deployment's own logs keep it.
 *
 * So the honest statement of what this guarantees: every moderator action
 * attempts a log entry, and a database that is up records all of them. It is
 * not a ledger that can prove nothing happened without it.
 *
 * Called after the action rather than before for the same reason: an entry
 * saying a post was hidden, written before the update that then failed, is
 * worse than a missing entry - it is a record of something that did not
 * happen.
 *
 * @param {object} db a service-role client
 * @param {object} entry
 * @param {string|null} entry.actor the moderator, or null when the system acted
 * @param {string} entry.action one of 0021's eleven permitted values
 * @param {string|null} [entry.subjectAddress]
 * @param {number|null} [entry.subjectPostId]
 * @param {string|null} [entry.subjectRoom]
 * @param {string|null} [entry.note]
 * @param {number|null} [entry.evidence]
 */
export async function logAction(db, entry) {
  if (!db || !entry?.action) return

  try {
    const { error } = await db.from('moderation_log').insert({
      actor: entry.actor || null,
      action: entry.action,
      subject_address: entry.subjectAddress || null,
      subject_post_id: Number.isInteger(entry.subjectPostId) ? entry.subjectPostId : null,
      subject_room: entry.subjectRoom || null,
      note: typeof entry.note === 'string' ? entry.note.trim().slice(0, 300) || null : null,
      evidence: Number.isInteger(entry.evidence) && entry.evidence >= 0 ? entry.evidence : null,
    })

    if (error) {
      /*
       * 42P01 is "no such table", which on this project means 0021 has not
       * been run. Named rather than left as a generic failure, because the
       * difference between "the log is broken" and "the log does not exist
       * yet" is the difference between an incident and a migration.
       */
      const missing = error.code === '42P01' ? ' (has 0021 been run?)' : ''
      console.error(`moderation log: ${entry.action} not recorded${missing}:`, error.message)
    }
  } catch (err) {
    console.error(`moderation log: ${entry.action} not recorded:`, err.message)
  }
}

/**
 * Hide a post if enough established accounts have reported it.
 *
 * Reads the reporters with their wallet ages, asks src/utils/autoHide.js, and
 * writes the hide and its log entry. The decision is in that util and not here
 * so it can be tested without a database; this is the part that cannot be.
 *
 * Returns whether it hid anything, which the report endpoint does **not** tell
 * the reporter. That is not an oversight: a response that said "your report
 * hid this" would turn the endpoint into a way of probing how close a post is
 * to the threshold, which is the reconnaissance step of exactly the brigading
 * this gate exists to make expensive.
 *
 * Like logAction, this never throws. A report has already been filed when this
 * runs, and a reporter told their report failed would file it again.
 *
 * @param {object} db a service-role client
 * @param {number} postId
 * @param {Set<string>} admins the configured moderators
 * @returns {Promise<boolean>} whether the post was hidden by this call
 */
export async function maybeAutoHide(db, postId, admins) {
  if (!db || !Number.isInteger(postId)) return false

  try {
    const post = await db
      .from('posts')
      .select('id, address, hidden_at, deleted_at')
      .eq('id', postId)
      .maybeSingle()

    if (post.error || !post.data) return false

    // Already gone, or already hidden. Both short-circuit, and shouldAutoHide
    // explains why `alreadyHidden` must not re-trigger: a second entry would
    // attribute a moderator's hide to reports.
    if (post.data.deleted_at || post.data.hidden_at) return false

    /*
     * The reporters, each with the first-seen date 0019 caches on their
     * profile. One query with an embed rather than a query per reporter: a
     * post with forty reports would otherwise be forty round trips inside a
     * request somebody is waiting on.
     *
     * The foreign key is named for the reason src/config/queries.js gives over
     * and over - `post_reports` reaches `profiles` through `reporter` and
     * `posts` reaches it through `address`, so an unqualified embed is the
     * "more than one relationship was found" error this project has shipped
     * twice.
     */
    const reports = await db
      .from('post_reports')
      .select('reporter, profiles!post_reports_reporter_fkey ( first_seen_at )')
      .eq('post_id', postId)
      .limit(100)

    if (reports.error) {
      console.error('auto-hide: reading the reports failed:', reports.error.message)
      return false
    }

    const reporters = (reports.data || []).map((row) => ({
      address: row.reporter,
      firstSeenAt: row.profiles?.first_seen_at || null,
    }))

    const { hide, qualifying } = shouldAutoHide({
      reporters,
      alreadyHidden: false,
      authorIsModerator: admins instanceof Set && admins.has((post.data.address || '').toLowerCase()),
    })

    if (!hide) return false

    /*
     * `is('hidden_at', null)` in the update, not just in the read above.
     *
     * Two reports arriving at once run two of these concurrently, both read an
     * unhidden post, and both decide to hide it - so the condition is restated
     * where the database can enforce it. Without this the second write
     * overwrites `hidden_at` and a second log entry appears, which is how an
     * audit trail starts recording the same event twice.
     */
    const hidden = await db
      .from('posts')
      .update({ hidden_at: new Date().toISOString(), hidden_by: null })
      .eq('id', postId)
      .is('hidden_at', null)
      .select('id')

    if (hidden.error) {
      console.error('auto-hide: the update failed:', hidden.error.message)
      return false
    }

    // Nothing updated means somebody else got there first. No log entry: theirs
    // is already written.
    if (!hidden.data || hidden.data.length === 0) return false

    await logAction(db, {
      actor: null,
      action: 'auto_hide_post',
      subjectPostId: postId,
      subjectAddress: post.data.address || null,
      evidence: qualifying,
    })

    return true
  } catch (err) {
    console.error('auto-hide: failed:', err.message)
    return false
  }
}
