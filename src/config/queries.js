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
/**
 * The message this one is answering, quoted above it.
 *
 * Two foreign key hints in one embed, and both are load-bearing. The outer
 * one picks `messages.reply_to` out of the several ways `messages` reaches
 * itself and `profiles`; the inner one is the same `messages_address_fkey`
 * problem one level down, because the quoted message reaches `profiles`
 * exactly as its parent does.
 *
 * `deleted_at` rides along so the quote can say a message was removed rather
 * than showing its text to somebody it was taken away from.
 */
export const MESSAGE_REPLY =
  'reply:messages!messages_reply_to_fkey ( id, address, body, deleted_at, profiles!messages_address_fkey ( handle ) )'

export const MESSAGE_FIELDS =
  `id, address, room, body, created_at, edited_at, reply_to, ${MESSAGE_AUTHOR}, ${MESSAGE_REPLY}, message_reactions ( emoji, address )`

/**
 * A message as an endpoint returns it after writing one.
 *
 * Without the reactions, because a message that was just posted or edited has
 * none that the writer does not already know about - and with them the insert
 * would join a table it has no reason to touch.
 */
export const MESSAGE_WRITE_FIELDS =
  `id, address, room, body, created_at, edited_at, reply_to, ${MESSAGE_AUTHOR}, ${MESSAGE_REPLY}`

/**
 * Who a post names.
 *
 * Joined rather than fetched per post, for the reason reactions are: twenty
 * posts would otherwise be twenty round trips before a single link could be
 * drawn. The foreign key is named for the same reason as the others -
 * `post_mentions` reaches `profiles` through `address`, and `posts` reaches it
 * through its own, so an unqualified embed here is the "more than one
 * relationship was found" error that has taken this feed down twice.
 */
export const POST_MENTIONS =
  'post_mentions ( address, profiles!post_mentions_address_fkey ( handle ) )'

/**
 * A post, the same shape on both sides.
 *
 * `parent_id` rides along because a reply is a post with a parent, and the
 * feed has to tell them apart to know whether it is looking at something that
 * belongs at the top level or under something else.
 */
export const POST_FIELDS =
  `id, address, body, created_at, parent_id, ${POST_AUTHOR}, ${POST_MENTIONS}`

/**
 * One notification, as the inbox endpoint reads it.
 *
 * Here with the others rather than beside the handler that uses it, which is
 * where it started and where it was wrong. This file's whole reason is that a
 * select string is text - valid JavaScript whatever it says, so lint, the
 * suite and the build all pass and Postgres is the first thing to disagree.
 * Gathered here, api/_routes/health.js runs it against the real database and
 * a deployment says so before anybody opens their inbox.
 *
 * `profiles!notifications_actor_fkey` is named because `notifications` reaches
 * `profiles` twice - through `recipient` and through `actor` - so an
 * unqualified embed is the "more than one relationship was found" error this
 * project has shipped before. `posts` is reached once and needs no hint.
 */
export const NOTIFICATION_FIELDS = `
  id, kind, created_at, read_at, post_id, message_id,
  profiles!notifications_actor_fkey ( address, handle, avatar_id, avatar_url ),
  posts ( id, body, parent_id )
`

/**
 * A public profile, as anybody reading somebody's page gets it.
 *
 * Here with the others so api/_routes/health.js can run it against the real
 * database. That matters more for this one than for most: it grows a column
 * every time the profile grows a feature, and a deployment whose migration has
 * not been run fails on exactly this select - which without a health check
 * presents as a profile page that will not load and no reason why.
 *
 * `updated_at` is deliberately absent. It would say when somebody last touched
 * their profile, which is harmless-looking and a way of telling who is active
 * right now.
 */
export const PUBLIC_PROFILE_FIELDS =
  'address, handle, avatar_id, avatar_url, banner_url, bio, links, created_at'

/**
 * A room as the app reads one.
 *
 * `name` and `blurb` are null for a token room and written by a person for
 * the five, so anything drawing this has to cope with both - the list falls
 * back to the token's address, and the token page uses the symbol it is
 * already showing.
 *
 * `message_count` and `last_message_at` are maintained by the endpoint that
 * writes messages rather than counted here. They can lag a removal by one,
 * which is fine for what they do: order a list and show that a room is alive.
 */
export const ROOM_FIELDS =
  'slug, kind, token_address, name, blurb, message_count, last_message_at'
