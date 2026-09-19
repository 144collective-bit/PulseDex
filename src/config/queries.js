/**
 * The select strings the database is actually asked for.
 *
 * Here, in one file with no imports, for two reasons.
 *
 * The first is that both runtimes need them. The browser reads messages and
 * posts over the anon key; the endpoints read them back after a write with the
 * service role key. Those are different processes that must ask for the same
 * shape, and when they drifted the symptom was a row rendering without its
 * author in one path and with it in another.
 *
 * The second is the one that earned this file. A select string is text: it is
 * valid JavaScript whatever it says, so lint passes, the suite passes, the
 * build passes, and the first thing that disagrees is Postgres, in production,
 * in front of users. That happened twice. Gathering them here means
 * api/_routes/health.js can run every one of them against the real database
 * and a smoke test can ask whether they work - which is the only check that
 * was ever going to catch it.
 *
 * No imports, deliberately. This file is loaded by the browser client and by a
 * serverless handler, and anything it pulled in would have to be safe in both.
 */

/**
 * How to reach a message's author.
 *
 * The foreign key is named, and it has to be. `message_reactions` references
 * both `messages` and `profiles`, so PostgREST can get from one to the other
 * two ways - directly, or treating reactions as a junction table - and refuses
 * to guess. Without the hint every read of the chat fails with "more than one
 * relationship was found", which is how the chat went down.
 */
export const MESSAGE_AUTHOR = 'profiles!messages_address_fkey ( handle, avatar_id, avatar_url )'

/** The same problem, from posts, via `post_reports`. Broken from the day 0005
 *  ran until somebody thought to look at the feed. */
export const POST_AUTHOR = 'profiles!posts_address_fkey ( handle, avatar_id, avatar_url )'

/**
 * A message as the chat reads it.
 *
 * Reactions come with the page rather than in a request per message: fifty
 * messages would otherwise be fifty round trips before anything is drawn.
 */
export const MESSAGE_FIELDS =
  `id, address, room, body, created_at, edited_at, ${MESSAGE_AUTHOR}, message_reactions ( emoji, address )`

/**
 * A message as an endpoint returns it after writing one.
 *
 * Without the reactions, because a message that was just posted or edited has
 * none that the writer does not already know about - and with them the insert
 * would join a table it has no reason to touch.
 */
export const MESSAGE_WRITE_FIELDS = `id, address, room, body, created_at, edited_at, ${MESSAGE_AUTHOR}`

/**
 * A post, the same shape on both sides.
 *
 * `parent_id` rides along because a reply is a post with a parent, and the
 * feed has to tell them apart to know whether it is looking at something that
 * belongs at the top level or under something else.
 */
export const POST_FIELDS = `id, address, body, created_at, parent_id, ${POST_AUTHOR}`
