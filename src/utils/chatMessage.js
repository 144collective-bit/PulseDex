/**
 * What counts as a message anyone may post.
 *
 * Kept away from both the composer and the endpoint that stores messages,
 * because both need the identical answer and they cannot share a runtime. The
 * composer runs in the browser and the endpoint runs on Vercel; if they
 * disagree, the disagreement shows up as a message that looks accepted and is
 * then refused, or - worse - one the browser refused to send but the server
 * would happily have stored.
 *
 * The browser's copy is a convenience, not a control. Anything here is
 * re-applied server-side on every write, because a client check is a hint to
 * the person typing and nothing more: the endpoint is reachable without ever
 * loading the page.
 */

import {
  stripInvisible,
  normaliseNewlines,
  capNewlines,
  trimLineEnds,
} from './textClean.js'

/**
 * The longest a message may be, counted after normalising.
 *
 * Matches the `check (char_length(body) between 1 and 500)` on the table, and
 * has to: a body that passes here and fails there becomes a 500 from the
 * database rather than a sentence explaining what went wrong.
 */
export const MAX_MESSAGE_LENGTH = 500

/** How many blank lines in a row survive. Two is a paragraph break; twenty is
 *  a way of taking over the page. */
const MAX_CONSECUTIVE_NEWLINES = 2

/** Why a message was refused. Exported so the UI can say something specific
 *  rather than "invalid". */
export const REJECTED = {
  notText: 'notText',
  empty: 'empty',
  tooLong: 'tooLong',
}

/**
 * Clean a message up and decide whether it can be posted.
 *
 * Returns the normalised body on success rather than the original, and the
 * caller must store what comes back - normalising on the way in and then
 * saving the raw text would put exactly the characters this strips into the
 * database.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, body: string } | { ok: false, reason: string }}
 */
export function normaliseMessage(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: REJECTED.notText }

  const cleaned = clean(raw)

  if (cleaned.length === 0) return { ok: false, reason: REJECTED.empty }

  /*
   * Counted in code points, not UTF-16 units. `''.length` counts an emoji as
   * two, so a limit measured that way lets half as many emoji through as
   * characters - and can cut a pair in half, storing a lone surrogate that
   * Postgres refuses.
   */
  if ([...cleaned].length > MAX_MESSAGE_LENGTH) {
    return { ok: false, reason: REJECTED.tooLong }
  }

  return { ok: true, body: cleaned }
}

/**
 * How long a message is by the rule the limit is enforced with.
 *
 * The composer's counter uses this so the number under the box and the number
 * the server checks are the same one. Counting `value.length` there instead
 * is how a counter reads 480 while the endpoint sees 501 - and why this runs
 * the same `clean` the check does rather than approximating it.
 */
export function messageLength(value) {
  if (typeof value !== 'string') return 0
  return [...clean(value)].length
}

/** The normalising half, shared so the counter and the check cannot drift. */
function clean(raw) {
  return trimLineEnds(
    capNewlines(stripInvisible(normaliseNewlines(raw)), MAX_CONSECUTIVE_NEWLINES),
  ).trim()
}

/**
 * The longest a display name may be. Matches the `check (char_length(handle)
 * between 1 and 32)` on the profiles table.
 */
export const MAX_HANDLE_LENGTH = 32

/**
 * Tidy a display name, or decide there isn't one.
 *
 * Returns null rather than an error, and that is the important part: a handle
 * is decoration on a message, so a bad one should cost the name and show the
 * shortened address instead. Refusing the whole post because someone's saved
 * display name has an emoji in the wrong place would be losing what they
 * actually wrote to protect what they didn't.
 *
 * The invisible characters matter more here than in a message body. A handle
 * is how one person is told apart from another, so zero-width padding is a way
 * to register a name that renders identically to somebody else's - which is
 * the setup for being believed.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normaliseHandle(raw) {
  if (typeof raw !== 'string') return null

  // Every run of whitespace, newlines included, becomes one space: a display
  // name is a single line wherever it is shown, and a newline in one would
  // break the row it sits in rather than wrapping.
  const cleaned = clean(raw).replace(/\s+/g, ' ').trim()

  if (cleaned.length === 0) return null
  if ([...cleaned].length > MAX_HANDLE_LENGTH) return null

  return cleaned
}

/**
 * Tidy an avatar id, or decide there isn't one.
 *
 * Not the same rule as a handle, though the two arrive together and it is
 * tempting to reuse it. A handle is text a person chose and may contain
 * anything they can type; an avatar id is a key into the fixed list in
 * UserProfileContext, so it is a slug or it is nothing. Validating it as a
 * handle would let a sentence be stored where the app expects a lookup key.
 *
 * Only the preset avatars can be represented. An uploaded picture lives in the
 * browser's own storage as a compressed image, which is not a value that
 * belongs in this column - so someone using a custom avatar shows as their
 * default alongside their messages.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normaliseAvatarId(raw) {
  if (typeof raw !== 'string') return null

  const trimmed = raw.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(trimmed)) return null

  return trimmed
}
