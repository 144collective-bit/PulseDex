/**
 * The characters stripped from anything a person types, and why.
 *
 * Three groups, all invisible, all of which have been used to make text say
 * one thing and mean another:
 *
 * - C0 and C1 controls, minus newline. A carriage return or a vertical tab in
 *   a message is never intentional, and some of them terminate lines in logs,
 *   which is how a message becomes a forged second message.
 * - Bidirectional overrides (U+202A-U+202E, U+2066-U+2069). These reverse the
 *   direction text renders in, so a message can display in an order its
 *   characters are not stored in - the trick behind lookalike addresses.
 * - Zero-width space, joiner, non-joiner and the byte-order mark. Invisible
 *   padding, useful only for slipping past a filter or making two different
 *   handles look identical.
 *
 * Stripped rather than refused because the person typing almost never put them
 * there deliberately - they arrive by paste - and "your message contains
 * U+200B" is not a sentence anyone should read.
 *
 * Shared because there are three kinds of text now: a chat message, a profile
 * bio and a post. Three copies of this list is three chances for one of them
 * to fall behind, and the one that falls behind is the one somebody finds.
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

/**
 * Remove them.
 *
 * Exported as a function rather than as the regex itself, deliberately. The
 * pattern is global, and a global regex carries `lastIndex` between calls -
 * shared across three modules and used with `.test` anywhere, it would match
 * every other time and nobody would work out why. A function that only ever
 * calls `.replace` cannot be used that way.
 */
export function stripInvisible(value) {
  return typeof value === 'string' ? value.replace(INVISIBLE, '') : ''
}

/**
 * Normalise line endings before anything else touches them.
 *
 * Order matters, and it is the reason this is its own step. A carriage return
 * is one of the control characters `stripInvisible` removes, so stripping
 * first would turn a pasted Windows `\r\n` into a bare `\n` by luck, and an
 * old Mac `\r` into nothing at all - silently joining two lines the author
 * meant to separate.
 */
export function normaliseNewlines(value) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : ''
}

/**
 * Cap a run of blank lines.
 *
 * A paragraph break is two newlines; twenty is a way of taking over the page.
 * The limit differs by surface - a chat line is not a post - so it is an
 * argument rather than a constant here.
 */
export function capNewlines(value, max) {
  return value.replace(new RegExp(`\n{${max + 1},}`, 'g'), '\n'.repeat(max))
}

/** Trailing spaces on each line, which paste brings along and which make two
 *  identical-looking messages differ. */
export function trimLineEnds(value) {
  return value.replace(/[ \t]+$/gm, '')
}
