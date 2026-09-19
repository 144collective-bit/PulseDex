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

/**
 * Characters removed outright rather than rejected.
 *
 * Three groups, all invisible, all of which have been used to make text say
 * one thing and mean another:
 *
 * - C0 and C1 controls, minus newline. A carriage return or a vertical tab in
 *   a chat line is never intentional, and some of them terminate lines in
 *   logs, which is how a message becomes a forged second message.
 * - Bidirectional overrides (U+202A-U+202E, U+2066-U+2069). These reverse the
 *   direction text renders in, so a message can display in an order its
 *   characters are not stored in - the trick behind lookalike addresses.
 * - Zero-width space, joiner, non-joiner and the byte-order mark. Invisible
 *   padding, useful only for slipping past a filter or making two different
 *   handles look identical.
 *
 * Stripped rather than refused because the person typing almost never put
 * them there deliberately - they arrive by paste - and "your message contains
 * U+200B" is not a sentence anyone should read.
 */
const INVISIBLE_RANGES = [
  [0x00, 0x09],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0x200b, 0x200d],
  [0xfeff, 0xfeff],
]

/*
 * Built from those numbers rather than written as a literal class.
 *
 * Every character it matches is invisible, so a literal would be a regex with
 * nothing readable between the brackets - and the first tool to reformat this
 * file, or any editor that normalises what it cannot see, could drop one
 * without leaving a mark. That failure is silent: the strip still runs, just
 * not on the character somebody is using. Writing the code points out means a
 * change to this set has to be a change to a number.
 */
const INVISIBLE = new RegExp(
  `[${INVISIBLE_RANGES.map(
    ([lo, hi]) => `\\u${lo.toString(16).padStart(4, '0')}-\\u${hi.toString(16).padStart(4, '0')}`,
  ).join('')}]`,
  'gu',
)

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
  return raw
    /*
     * Line endings first, and that order is the whole point. A carriage
     * return is one of the control characters stripped below, so stripping
     * before converting would turn a pasted Windows `\r\n` into a bare `\n`
     * by luck, and an old Mac `\r` into nothing at all - silently joining two
     * lines the author meant to separate.
     */
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE, '')
    .replace(
      new RegExp(`\n{${MAX_CONSECUTIVE_NEWLINES + 1},}`, 'g'),
      '\n'.repeat(MAX_CONSECUTIVE_NEWLINES),
    )
    // Trailing spaces on each line, which paste brings along and which make
    // two identical-looking messages differ.
    .replace(/[ \t]+$/gm, '')
    .trim()
}
