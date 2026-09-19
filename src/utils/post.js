/**
 * What counts as a post.
 *
 * Nearly the same job as `normaliseMessage` in chatMessage.js, and
 * deliberately not the same function. A chat line and a post differ in the two
 * things that matter to a check like this - how long they may be, and whether
 * a blank line between paragraphs is something a person meant - and a single
 * function taking both as arguments would be one function pretending to be a
 * rule while actually being a switch.
 *
 * They are also read differently. A message is glanced at in a stream of other
 * messages; a post sits on a profile where somebody arrived on purpose, and is
 * the thing that stays after the room has scrolled past. It can afford to be
 * longer and to have shape.
 *
 * Like the chat's, the browser's copy of this is a convenience rather than a
 * control. Everything here runs again server-side on every write, because the
 * endpoint is reachable without ever loading the page.
 */

import {
  stripInvisible,
  normaliseNewlines,
  capNewlines,
  trimLineEnds,
} from './textClean.js'

/**
 * The longest a post may be.
 *
 * Matches the `check (char_length(body) between 1 and 2000)` on the table, and
 * has to: a body that passes here and fails there becomes a 500 from the
 * database rather than a sentence explaining what went wrong.
 *
 * Four times a chat message and nowhere near a blog. Long enough to make an
 * argument, short enough that a feed stays readable without every post
 * needing to be collapsed behind a "more" link.
 */
export const MAX_POST_LENGTH = 2000

/**
 * How many blank lines in a row survive.
 *
 * Two, where a chat message allows one. A post is the one place here somebody
 * writes more than a sentence, and paragraphs are how that is read - but a
 * screenful of blank lines is still a way of taking over the feed.
 */
const MAX_CONSECUTIVE_NEWLINES = 2

/** Why a post was refused. Exported so the composer can say something
 *  specific rather than "invalid". */
export const REJECTED_POST = {
  notText: 'notText',
  empty: 'empty',
  tooLong: 'tooLong',
}

/**
 * Clean a post up and decide whether it can be published.
 *
 * Returns the normalised body on success rather than the original, and the
 * caller must store what comes back - normalising on the way in and then
 * saving the raw text would put exactly the characters this strips into the
 * database.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, body: string } | { ok: false, reason: string }}
 */
export function normalisePost(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: REJECTED_POST.notText }

  const cleaned = clean(raw)

  if (cleaned.length === 0) return { ok: false, reason: REJECTED_POST.empty }

  /*
   * Counted in code points, not UTF-16 units. `''.length` counts an emoji as
   * two, so a limit measured that way lets half as many emoji through as
   * characters - and can cut a pair in half, storing a lone surrogate that
   * Postgres refuses.
   */
  if ([...cleaned].length > MAX_POST_LENGTH) {
    return { ok: false, reason: REJECTED_POST.tooLong }
  }

  return { ok: true, body: cleaned }
}

/**
 * How long a post is by the rule the limit is enforced with.
 *
 * The composer's counter uses this, so the number under the box and the number
 * the server checks are the same one. Counting `value.length` there instead is
 * how a counter reads 1,980 while the endpoint sees 2,001.
 */
export function postLength(value) {
  if (typeof value !== 'string') return 0
  return [...clean(value)].length
}

/** The normalising half, shared so the counter and the check cannot drift. */
function clean(raw) {
  return trimLineEnds(
    capNewlines(stripInvisible(normaliseNewlines(raw)), MAX_CONSECUTIVE_NEWLINES),
  ).trim()
}
