/**
 * Which tokens people are actually talking about.
 *
 * `rooms` has carried `message_count` and `last_message_at` since token rooms
 * existed, and 0014 said why in as many words: "'Which token is being talked
 * about' is a question the screener wants to ask about a hundred tokens at
 * once while it draws a list. As a count over `messages` that is a hundred
 * aggregates; as a column it is one read of a small table."
 *
 * This is that read, turned into something a list can look a row up in. The
 * screener draws a hundred rows and cannot afford a search per row, so the
 * rooms are indexed once by the address they are about.
 *
 * The signal is the last thing that closes the loop between the two halves of
 * this app. A screener that cannot say which of these hundred tokens anybody
 * is discussing is a screener with a chat bolted to it, which is what this
 * was before.
 */

/**
 * Index rooms by the token they are about.
 *
 * Lowercased keys, because an address arrives checksummed from one API and
 * lowercased from another, and a lookup that depends on which is a lookup
 * that works on half the rows.
 *
 * @param {Array<{address: string|null, messageCount?: number,
 *   lastMessageAt?: string|null}>} rooms
 * @returns {Map<string, {count: number, at: string|null}>}
 */
export function byToken(rooms) {
  const found = new Map()
  if (!Array.isArray(rooms)) return found

  for (const room of rooms) {
    const address = typeof room?.address === 'string' ? room.address.toLowerCase() : null
    if (!address) continue

    const count = Number(room.messageCount) || 0
    // Nothing said is not a signal. A room can exist with no messages left in
    // it - `note_room_message` creates one with a count of one, and a
    // moderator removing that message leaves the room behind.
    if (count <= 0) continue

    /*
     * The busiest wins a duplicate. Two rooms cannot be about one token - the
     * slug is the primary key and carries the address - but this takes
     * whatever the database returned rather than trusting that, and picking
     * arbitrarily would make the badge flicker between two numbers.
     */
    const seen = found.get(address)
    if (seen && seen.count >= count) continue

    found.set(address, { count, at: room.lastMessageAt || null })
  }

  return found
}

/**
 * What a row says, given how much has been said about it.
 *
 * Null for nothing, so the caller draws no badge rather than a zero - a badge
 * showing 0 is a badge that has stopped meaning anything, which is the same
 * rule the unread counts follow.
 *
 * Capped at "99+" for the same reason the room list caps: a four-digit number
 * in a column this narrow pushes the price off the row.
 *
 * @param {{count: number} | undefined} talk
 * @returns {string|null}
 */
export function talkLabel(talk) {
  const count = Number(talk?.count) || 0
  if (count <= 0) return null
  return count > 99 ? '99+' : String(count)
}
