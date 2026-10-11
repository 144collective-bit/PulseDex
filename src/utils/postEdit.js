/**
 * Who may change a post they already published, and for how long.
 *
 * An edit window is two decisions, and the second is the one that matters.
 *
 * How long: short. The window exists so somebody can fix the typo they see
 * the moment they press Post, and nothing else. Every minute it is widened is
 * a minute in which a post can be rewritten after people have read it - and on
 * a site where posts are about what to buy, "I said sell" after the fact is
 * worth money. Five minutes is long enough to re-read what you wrote and
 * short enough that almost nobody has acted on it.
 *
 * And whether the change is visible: always. `posts.edited_at` is stamped on
 * every edit and the interface draws an "edited" marker from it, with the
 * original timestamp still beside it. A silent edit is the thing this feature
 * must never be, which is why the column exists at all - see
 * 0020_posts_worth_making.sql.
 *
 * Pure, so every branch can be checked without a database. The endpoint
 * decides for real; this is what the interface uses to know whether to offer
 * the control, and the two call the same function so they cannot disagree
 * about what the rule is.
 */

/** How long after posting an edit is allowed. */
export const EDIT_WINDOW_MS = 5 * 60 * 1000

/** Why an edit was refused. Codes, so the endpoint and the interface can word
 *  them differently for the person they are talking to. */
export const EDIT_REFUSED = {
  notYours: 'notYours',
  windowClosed: 'windowClosed',
  answered: 'answered',
  gone: 'gone',
}

/**
 * May this account edit this post right now?
 *
 * `replyCount` is passed in rather than looked up, because this is pure - the
 * endpoint counts, the interface already knows from the number on the reply
 * button, and both hand it here.
 *
 * @param {object} params
 * @param {{ id?: number, address?: string, createdAt?: string, deletedAt?: string|null }|null} params.post
 * @param {string|null} params.account the signed-in address, lowercased or not
 * @param {number} [params.replyCount]
 * @param {number} [params.now]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function canEditPost({ post, account, replyCount = 0, now = Date.now() }) {
  if (!post || !post.address || !post.createdAt) return { ok: false, reason: EDIT_REFUSED.gone }
  if (post.deletedAt) return { ok: false, reason: EDIT_REFUSED.gone }

  const mine = typeof account === 'string' && account.toLowerCase() === post.address.toLowerCase()
  if (!mine) return { ok: false, reason: EDIT_REFUSED.notYours }

  /*
   * A post somebody has already answered is closed to editing, whatever the
   * clock says.
   *
   * This is the rule that actually stops the abuse the window is a compromise
   * about. Five minutes is short, but a reply can arrive in thirty seconds -
   * and rewriting a post that has an answer under it makes the answer look
   * like a response to something nobody said. The time limit protects readers
   * in general; this protects the specific person who replied.
   */
  if (Number(replyCount) > 0) return { ok: false, reason: EDIT_REFUSED.answered }

  const at = Date.parse(post.createdAt)
  // An unreadable timestamp is treated as out of time rather than in it: the
  // failure that refuses an edit is better than the one that allows a silent
  // rewrite of a post of unknown age.
  if (!Number.isFinite(at)) return { ok: false, reason: EDIT_REFUSED.windowClosed }

  if (now - at > EDIT_WINDOW_MS) return { ok: false, reason: EDIT_REFUSED.windowClosed }

  return { ok: true }
}

/**
 * How long is left, in milliseconds, or 0.
 *
 * Used to draw a countdown on the control, so the window is visible rather
 * than something that silently stops working mid-sentence.
 *
 * @param {{ createdAt?: string }|null} post
 * @param {number} [now]
 */
export function editWindowLeft(post, now = Date.now()) {
  const at = Date.parse(post?.createdAt || '')
  if (!Number.isFinite(at)) return 0
  return Math.max(0, EDIT_WINDOW_MS - (now - at))
}

/**
 * The countdown, as the control shows it: "4m" then "50s" then nothing.
 *
 * Minutes while there are minutes, because a second-by-second countdown on a
 * five-minute window is a timer somebody watches instead of a limit they
 * forget about. Seconds only in the last minute, where the number is actually
 * about to matter.
 *
 * @param {{ createdAt?: string }|null} post
 * @param {number} [now]
 * @returns {string|null}
 */
export function editWindowLabel(post, now = Date.now()) {
  const left = editWindowLeft(post, now)
  if (left <= 0) return null

  const seconds = Math.ceil(left / 1000)
  return seconds > 60 ? `${Math.ceil(seconds / 60)}m` : `${seconds}s`
}

/**
 * Was this post changed after it was published?
 *
 * A stamp within a second or so of `created_at` is the write itself, not an
 * edit - nothing in this app sets `edited_at` on insert, but a future
 * migration backfilling the column, or a clock skewing between two statements,
 * would put an "edited" marker on posts nobody touched. The marker's whole
 * value is that it means something, so it is not drawn on a one-second
 * difference.
 *
 * @param {{ createdAt?: string, editedAt?: string|null }|null} post
 */
export function wasEdited(post) {
  const edited = Date.parse(post?.editedAt || '')
  if (!Number.isFinite(edited)) return false

  const created = Date.parse(post?.createdAt || '')
  if (!Number.isFinite(created)) return true

  return edited - created > 1000
}
