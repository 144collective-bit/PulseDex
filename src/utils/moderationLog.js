/**
 * Turning one row of `moderation_log` into a sentence.
 *
 * The table is deliberately terse - an action name, two nullable subjects, a
 * count - because a log that stores prose cannot be filtered and goes stale
 * the moment the wording changes. The prose belongs here, where it is one
 * function with a test per action rather than eleven `if` branches inside a
 * component.
 *
 * Who reads this: a moderator, in the review panel, usually asking one of two
 * questions. "What has been done to this account?" and "why is this post
 * hidden?" Both are answered by a list in time order, which means every entry
 * has to read as a complete sentence on its own - a row saying "hide_post"
 * next to a post id is a row somebody has to decode.
 *
 * Pure. No dates formatted here beyond a relative age, because the panel
 * already has the timestamp and `Intl` in it.
 */

/**
 * What each action did, in the past tense, with no subject attached.
 *
 * A table rather than a switch, so an action the database allows and this file
 * has not been told about is visible as a gap at the one place that lists
 * them. The keys are exactly the eleven values 0021's check constraint
 * permits; `describeAction` falls back rather than throwing, because a log
 * entry that cannot be rendered must still be countable - the whole value of
 * an audit trail is that it shows an action nobody anticipated.
 */
export const ACTION_WORDS = {
  block: 'blocked this account',
  unblock: 'unblocked this account',
  hide_post: 'hid this post',
  unhide_post: 'put this post back',
  auto_hide_post: 'hid this post automatically',
  remove_post: 'removed this post',
  remove_message: 'removed a message',
  remove_images: 'removed this account’s pictures',
  revoke_claim: 'revoked a developer claim',
  archive_room: 'archived this room',
  edit_room_gate: 'changed this room’s entry requirement',
}

/**
 * The actions a reader of the log should be able to reverse from the panel.
 *
 * Only the hide, and only in one direction. Unblocking and restoring a post
 * have their own endpoints and their own confirmations, and an audit trail
 * with buttons on every row is an audit trail that is also a control surface -
 * which is how somebody reading history ends up changing it by miskeying.
 */
export const REVERSIBLE = new Set(['hide_post', 'auto_hide_post'])

/**
 * Who acted, in words.
 *
 * Null is the system, and that is the distinction the whole log exists to
 * preserve: "three established accounts reported this" and "a moderator read
 * this and hid it" are different facts, and a reviewer deciding whether to
 * trust a hide needs to know which one they are looking at.
 *
 * A moderator is named by the short form of their address rather than their
 * handle. The handle is in `profiles` and a moderator may have no row there -
 * see 0021, which is why there is no foreign key - and a log that showed a
 * handle where it had one and an address where it did not would read as two
 * different kinds of entry.
 *
 * @param {string|null|undefined} actor
 */
export function actorLabel(actor) {
  if (typeof actor !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(actor)) {
    return 'The system'
  }
  return `${actor.slice(0, 6)}…${actor.slice(-4)}`
}

/**
 * One entry as a sentence: "0x1234…abcd hid this post."
 *
 * The subject is left out of the sentence on purpose. Every view of this log is
 * already filtered to one account or one post - that is how a moderator
 * arrives at it - so repeating "post 412" on all twelve rows is noise, and the
 * panel draws the id once at the top.
 *
 * `evidence` is appended only for an auto-hide, where it is the one number
 * that makes the entry reviewable: "hid this post automatically" invites "on
 * what basis", and the answer has to come from what the system saw at the time
 * rather than from a recount.
 *
 * @param {{ actor?: string|null, action?: string, evidence?: number|null }} entry
 * @returns {string}
 */
export function describeAction(entry) {
  const action = typeof entry?.action === 'string' ? entry.action : ''
  const words = ACTION_WORDS[action] || `did something recorded as “${action || 'nothing'}”`

  const who = actorLabel(entry?.actor)

  /*
   * `Number.isFinite(Number(x))`, which is what this said first, is not a
   * guard: `Number(null)` is 0 and `Number('')` is 0, so a row with no count
   * recorded rendered as "after 0 established accounts reported it" - a
   * sentence that contradicts the clause before it. The type is checked
   * instead, and zero is treated as absent, which it is: nothing writes this
   * column except an auto-hide, and an auto-hide needs three to happen.
   */
  const count = typeof entry?.evidence === 'number' && entry.evidence > 0 ? entry.evidence : null

  const evidence =
    action === 'auto_hide_post' && count !== null ? ` after ${reportCount(count)}` : ''

  return `${who} ${words}${evidence}.`
}

/**
 * "3 established accounts reported it", or the singular.
 *
 * "Established" rather than a bare count, because the count in this column is
 * not the number of reports - it is the number that passed the wallet-age gate
 * in src/utils/autoHide.js, and a reviewer told "3 reports" would go looking
 * for three rows in the queue and find eight.
 */
const reportCount = (n) =>
  n === 1 ? '1 established account reported it' : `${n} established accounts reported it`

/**
 * What this entry was about, for the heading above a filtered list.
 *
 * Returns null when the entry names nothing, which happens: `remove_message`
 * records the room and not the message, because messages are removed by id in
 * a table this log has no foreign key to and an id with no room beside it is
 * not something anybody can go and look at.
 *
 * @param {{ subject_address?: string|null, subject_post_id?: number|null, subject_room?: string|null }} entry
 */
export function subjectLabel(entry) {
  if (entry?.subject_post_id) return `Post ${entry.subject_post_id}`
  if (typeof entry?.subject_room === 'string' && entry.subject_room) {
    return `Room ${entry.subject_room}`
  }
  if (typeof entry?.subject_address === 'string' && entry.subject_address) {
    return actorLabel(entry.subject_address)
  }
  return null
}

/**
 * Is this entry the current state of the thing it describes?
 *
 * A hide followed by an unhide is two entries, and a panel offering "put it
 * back" on the first of them would be offering to undo something already
 * undone. Rather than ask the database twice, the panel is given the whole
 * list for a post and this says which row is still in force: the newest entry,
 * if it is one of the reversible ones.
 *
 * Entries are expected newest-first, which is how the endpoint orders them.
 *
 * @param {Array<{ action?: string }>} entries
 * @returns {boolean}
 */
export function stillHidden(entries) {
  if (!Array.isArray(entries)) return false
  const newest = entries.find((entry) => ACTION_WORDS[entry?.action])
  return Boolean(newest && REVERSIBLE.has(newest.action))
}
