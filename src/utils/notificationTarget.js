import { isRoom } from '../config/rooms'

/**
 * What a notification opens.
 *
 * An inbox that names an event and cannot show it is half an inbox: "somebody
 * mentioned you" could only ever open that person's profile, which answers
 * who and not what. Every row now knows its own destination, and the rows
 * that genuinely have nowhere to go say so rather than being drawn as
 * buttons that do nothing.
 *
 * Kept out of the component because this is the part with rules in it. The
 * four kinds point at three different sorts of thing, each of which can be
 * missing for an ordinary reason, and "which of these is clickable" is worth
 * checking directly rather than through a render.
 *
 * @param {object} item a notification as src/services/notifications.js
 *   flattens one
 * @returns {{ kind: 'post'|'room'|'profile', where: object } | null} `where`
 *   is ready for `openSocial`, except for a profile, which is the other
 *   router's business and carries an address instead
 */
export function notificationTarget(item) {
  if (!item || typeof item !== 'object') return null

  /*
   * A follow is about a person and points at nothing else - there is no post
   * and no message, by the schema. Their profile is the subject.
   */
  if (item.kind === 'follow') {
    const address = typeof item.actor?.address === 'string' ? item.actor.address : null
    return address ? { kind: 'profile', where: { address } } : null
  }

  /*
   * A reaction is on a chat message, which is addressed by room and id
   * together. The id alone is not a location, so a row missing its room is
   * not clickable - that happens on a deployment whose notification query
   * predates the room embed, and drawing a dead link would be worse than
   * drawing none.
   */
  if (item.kind === 'reaction') {
    const message = toId(item.messageId)
    const room = typeof item.messageRoom === 'string' ? item.messageRoom : null
    if (!message || !room || !isRoom(room)) return null
    return { kind: 'room', where: { tab: 'rooms', room, message } }
  }

  /*
   * A mention or a reply is on a post. Checked by `postId` rather than by
   * kind, so a mention that somehow carries a message - which the schema
   * allows, because both columns are nullable - is not drawn as a link to a
   * post that is not there.
   */
  const post = toId(item.postId)
  if (post) return { kind: 'post', where: { tab: 'post', post } }

  return null
}

/** A positive, exact integer, or null. Ids arrive from JSON, where a bigint
 *  too large for a Number comes back as one that is not exact. */
function toId(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null
}
