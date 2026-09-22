/**
 * The two small decisions the room makes about live state.
 *
 * Here rather than inside RoomPanel because both are pure, both have edges
 * worth pinning, and neither can be reached by the browser harness: it aborts
 * every realtime connection, so presence never joins and typing never
 * arrives. A component this project cannot render in a test is a component
 * whose logic belongs beside it rather than inside it.
 */

/**
 * Who is typing, in as few words as it can be said.
 *
 * Names up to two, then a count. "Degen, ape, trader and 4 others are typing"
 * is longer than the message any of them is about to send, and this line sits
 * one row above the composer, where length costs layout.
 *
 * @param {string[]} names
 * @returns {string} empty when nobody is
 */
export function typingLine(names) {
  const people = (Array.isArray(names) ? names : []).filter(
    (name) => typeof name === 'string' && name.trim().length > 0
  )

  if (people.length === 0) return ''
  if (people.length === 1) return `${people[0]} is typing`
  if (people.length === 2) return `${people[0]} and ${people[1]} are typing`
  return `${people.length} people are typing`
}

/**
 * How many messages arrived after the one the reader had got to.
 *
 * Counted forward from an id rather than by comparing list lengths. The list
 * also grows upward when older messages load in, so a length comparison
 * reports a backfill of fifty as fifty new arrivals and puts "50 new
 * messages" on a button that would scroll somebody four lines.
 *
 * @param {Array<{id: number}>} messages
 * @param {number|null} afterId  null when the reader is at the live end
 */
export function countAfter(messages, afterId) {
  if (afterId === null || afterId === undefined) return 0
  if (!Array.isArray(messages)) return 0

  return messages.reduce((n, message) => (message?.id > afterId ? n + 1 : n), 0)
}
