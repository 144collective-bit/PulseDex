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
 * The post this one is quoting, drawn inside it.
 *
 * Two foreign key hints in one embed, both load-bearing, and the same shape as
 * MESSAGE_REPLY above - which is not a coincidence but the same problem. The
 * outer hint picks `posts.quote_id` out of the two ways `posts` now reaches
 * itself (`parent_id` is the other); the inner one is the
 * `posts_address_fkey` ambiguity one level down, because a quoted post reaches
 * `profiles` exactly as its quoter does.
 *
 * `deleted_at` rides along so the card can say a post was removed rather than
 * showing its text to somebody it was taken away from. The quote's foreign key
 * is `on delete set null`, which only fires on a hard delete - the ordinary
 * removal is a `deleted_at` stamp, so this column is the one that does the
 * work.
 *
 * Deliberately not recursive. A quote of a quote renders the inner post's text
 * and not its own quote, because nesting cards inside cards is unreadable at
 * two levels and a denial of service at twenty.
 */
export const POST_QUOTE =
  'quote:posts!posts_quote_fkey ( id, address, body, created_at, deleted_at, ' +
  /*
   * `hidden_at` rides along for the reason `deleted_at` does, and it was a
   * leak until it did: a quote card draws the quoted post's body directly
   * rather than through PostCard, so without this column a post taken out of
   * the feed stayed perfectly readable through anybody who had quoted it.
   * Found by re-reading the diff, not by a test - the body was there, in a
   * card, on a surface nobody thought of as a way of reading a post.
   */
  'hidden_at, ' +
  'image_url, profiles!posts_address_fkey ( handle ) )'

/**
 * A post, as the feed and the profile read one.
 *
 * `parent_id` rides along because a reply is a post with a parent, and the
 * feed has to tell them apart to know whether it is looking at something that
 * belongs at the top level or under something else.
 *
 * Reactions come with the page rather than in a request per post, for the
 * reason MESSAGE_FIELDS gives: fifty posts would otherwise be fifty round
 * trips before a single number could be drawn.
 *
 * The three image columns and `edited_at` and `quote_id` are added by 0020,
 * which is what makes that migration required rather than optional - the same
 * trade as `archived_at` and 0018, and `pinned_post_id` and 0019. A select
 * naming a column that does not exist fails outright, and every read of a post
 * in this app goes through this string, so a deployment whose migration has
 * not been run presents as a feed that will not load, at a named place, with
 * api/_routes/health.js able to say which column is missing.
 */
export const POST_FIELDS =
  'id, address, body, created_at, edited_at, parent_id, quote_id, ' +
  'image_url, image_w, image_h, ' +
  /*
   * Added by 0021, and read by the browser although nothing in the browser is
   * what enforces a hide.
   *
   * 0021 says this at length and it is the thing most likely to be misread
   * from the column name: the anon read policy on `posts` is
   * `using (deleted_at is null)` and is deliberately NOT narrowed to
   * `hidden_at is null`. It cannot be - row level security has no identity
   * here, so a policy hiding these rows would hide them from their own author,
   * and an author not told their post is pending review has simply had it
   * vanish. So a hidden post still comes back, and these two columns are what
   * let the query filter and the interface do the hiding.
   *
   * Both, not just the first. `hidden_by` null with `hidden_at` set is the
   * system's doing and an address is a moderator's, and the author is told
   * different things in the two cases - see hiddenNotice in
   * src/utils/autoHide.js.
   */
  'hidden_at, hidden_by, ' +
  `${POST_AUTHOR}, ${POST_MENTIONS}, ${POST_QUOTE}, post_reactions ( emoji, address )`

/**
 * A post as an endpoint returns it after writing one.
 *
 * Without the reactions, because a post that was just published or edited has
 * none the writer does not already know about - and with them the insert would
 * join a table it has no reason to touch. The same split as
 * MESSAGE_WRITE_FIELDS, for the same reason.
 *
 * The quote stays, because a quote post's whole content is the post it quotes:
 * returned without it, the card the composer draws from the response would
 * appear with the quote missing until something refetched it.
 */
export const POST_WRITE_FIELDS =
  'id, address, body, created_at, edited_at, parent_id, quote_id, ' +
  'image_url, image_w, image_h, ' +
  /*
   * The hidden columns ride along here too, which looks unnecessary - a post
   * that was just published is never hidden - and is not. The edit path
   * returns this shape, the edit window is five minutes, and a post can be
   * auto-hidden inside five minutes. Without these the card rebuilt from an
   * edit's response would lose its pending-review notice, and the author
   * would conclude the hide had been lifted.
   */
  'hidden_at, hidden_by, ' +
  `${POST_AUTHOR}, ${POST_MENTIONS}, ${POST_QUOTE}`

/**
 * What a linked page says about itself.
 *
 * Read from the browser over the anon key, like the posts it sits under: the
 * row holds what a public page published about itself, fetched from a public
 * URL, so there is nothing in it belonging to anybody. Reading it directly
 * means drawing a feed is one more query rather than one request per link.
 *
 * `ok` is selected although a false row has nothing in it to draw. A cached
 * failure is as valuable as a cached success - it is what stops a URL that
 * times out being re-fetched by our server for every reader who scrolls past
 * the post - and the browser needs to tell "we looked and there was nothing"
 * from "we have not looked yet".
 *
 * There is deliberately no image column to select. 0020 says why at length:
 * rendering somebody else's og:image hands the linked site the IP address of
 * every reader who scrolled past, which is the exact thing fetching the
 * preview on the server avoids.
 */
export const LINK_PREVIEW_FIELDS = 'url_hash, url, title, description, site_name, ok'

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
 * project has shipped before. `posts` and `messages` are each reached once
 * and need no hint.
 *
 * `posts.hidden_at` is read so the excerpt can be withheld, and this is the
 * case it exists for rather than a consistency sweep: an inbox row about a
 * mention is somebody else's post shown to the person they named. If that post
 * is abuse and has been hidden, the one reader who would still see the words
 * is the person it was aimed at - which is the opposite of what hiding it was
 * for.
 *
 * `messages ( room )` is what lets a reaction open the message it is about.
 * A message is addressed as `/r/<room>#m<id>`, and the id alone does not say
 * which room - so without this the inbox knows what happened and cannot show
 * it, which is the one thing an inbox is for. The body is deliberately not
 * read: the excerpt on a reaction row would be your own words quoted back at
 * you, and the notification is about somebody else's reaction to them.
 */
export const NOTIFICATION_FIELDS = `
  id, kind, created_at, read_at, post_id, message_id,
  profiles!notifications_actor_fkey ( address, handle, avatar_id, avatar_url ),
  posts ( id, body, parent_id, hidden_at ),
  messages ( id, room )
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
 *
 * `first_seen_checked_at` is absent for a related reason and a smaller one: it
 * is our bookkeeping about when we last asked an explorer, which is nobody
 * else's business and tells a reader nothing.
 */
export const PUBLIC_PROFILE_FIELDS =
  'address, handle, avatar_id, avatar_url, banner_url, bio, links, created_at, ' +
  /*
   * Added by 0019. Three columns, and this is what makes that migration
   * required rather than optional - the same trade as `archived_at` and 0018.
   * A select naming a column that does not exist fails outright, and every
   * profile read goes through this string, so a deployment whose migration has
   * not been run presents as a profile page that will not load.
   *
   * That is the chosen failure: loud, at a named place, with
   * api/_routes/health.js able to say which column is missing. The alternative
   * - reading the columns only where they are used - would mean a profile page
   * that silently never shows a pin, and nobody able to say why.
   *
   * `pinned_post_id` is an id and not an embed, deliberately. `profiles`
   * reaches `posts` twice now - a post's author, and this - so an embed would
   * need a foreign key hint, and PostgREST's filtering of embedded rows is not
   * the place to express "unless it has been deleted". A pinned post is
   * fetched by id instead, through the same path as any other post, which
   * already drops the removed ones.
   */
  'pinned_post_id, first_seen_at, show_holdings'

/**
 * One edge of the follow graph, with the person on the other end of it.
 *
 * Two strings rather than one, because the join goes in two directions and
 * each has to name which. `follows` reaches `profiles` twice - through
 * `follower` and through `followee` - so an unqualified embed is the "more
 * than one relationship was found" error that has taken this app's chat and
 * feed down once each already.
 *
 * The constraint names are the ones Postgres generated for 0008's inline
 * `references`, which were never written down anywhere. They are now:
 * 0019_profile_depth.sql verifies both exist and raises if they do not, so
 * this file's assumption fails at the moment a human is running a migration
 * rather than later, in front of a reader, on a page that will not load.
 *
 * Only what a row in a list of people needs. Not `links`, not `banner_url`,
 * not the new on-chain columns - a followers list is scanned twenty at a time,
 * and every column it does not draw is weight on a query it runs for every
 * page.
 */
const FOLLOW_PERSON = 'address, handle, avatar_id, avatar_url, bio'

export const FOLLOWER_FIELDS =
  `created_at, follower, profiles!follows_follower_fkey ( ${FOLLOW_PERSON} )`

export const FOLLOWEE_FIELDS =
  `created_at, followee, profiles!follows_followee_fkey ( ${FOLLOW_PERSON} )`

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
  'slug, kind, token_address, name, blurb, message_count, last_message_at, ' +
  /*
   * Whether the room has been taken down.
   *
   * Read although 0018's policy already hides archived rooms from the anon
   * key, because the browser filters on it too - see fetchGroups. Two cheap
   * checks beat one that is right only after somebody has run a migration by
   * hand.
   *
   * This is what makes 0018_room_admin.sql required rather than optional: a
   * select naming a column that does not exist fails outright, and every room
   * read goes through this string. api/_routes/health.js runs it against the
   * real database and names it, which is what turns "the rooms will not load"
   * into "this column is missing" - the mechanism that was missing when the
   * reply foreign key went astray.
   */
  'archived_at, ' +
  /*
   * The gate, read by the browser although nothing in the browser enforces
   * it. A client-side balance check is decoration - the endpoint checks on
   * every write - but a room that refuses a message without having said it
   * was going to is worse than one that says so up front.
   */
  'gate_token, min_balance, gate_decimals, gate_symbol'

/**
 * A dev claim as the browser reads one.
 *
 * `revoked_at` is selected although the policy only returns rows where it is
 * null, so the service can state the same condition in its query. Saying it
 * twice costs nothing and means a policy loosened later does not silently
 * start drawing badges for claims a moderator has taken away.
 *
 * `revoked_reason` is deliberately absent. It is a moderator's note about a
 * person, and the anon key is readable by everybody.
 */
export const CLAIM_FIELDS = 'token_address, address, claimed_at, revoked_at'
