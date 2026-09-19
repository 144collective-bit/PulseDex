/**
 * The reactions people may leave, and the fact that there is a fixed list.
 *
 * A closed set rather than an emoji picker, and that is a security decision
 * before it is a design one. The value is stored in a column and rendered
 * beside somebody's message; free text there is a way to post arbitrary
 * content without it being a message - past the length limit, past the
 * invisible-character stripping, past the rate limit that governs posting, and
 * onto everyone's screen attached to somebody else's words.
 *
 * Six, chosen to cover what a room like this actually does: agree, disagree,
 * find something funny, find it bullish, find it valuable, be watching it.
 * Enough to be useful and few enough to fit on one row of a phone.
 *
 * Changing the list: add an entry and deploy. Removing one leaves existing
 * rows in the database pointing at an emoji the app no longer offers - they
 * still render, because the stored value is what is drawn, and they simply
 * cannot be added again.
 */

/** @type {{ emoji: string, label: string }[]} */
export const REACTIONS = [
  { emoji: '👍', label: 'Agree' },
  { emoji: '🔥', label: 'Bullish' },
  { emoji: '😂', label: 'Funny' },
  { emoji: '🚀', label: 'Sending it' },
  { emoji: '💎', label: 'Holding' },
  { emoji: '👀', label: 'Watching' },
]

const ALLOWED = new Set(REACTIONS.map((r) => r.emoji))

/**
 * Is this one of ours?
 *
 * Used by the endpoint on every write. The browser only ever offers the six,
 * but the endpoint is reachable with curl and a client check is a hint to the
 * person clicking rather than a control.
 */
export const isReaction = (value) => typeof value === 'string' && ALLOWED.has(value)
