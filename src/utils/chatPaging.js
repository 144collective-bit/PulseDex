/**
 * Reaching back past the first page of a conversation.
 *
 * The chat used to load the fifty newest messages and stop. Everything older
 * was still in the database and simply unreachable from the page - not hidden
 * behind a control, not summarised, gone. This is the arithmetic that fixes
 * that, kept here rather than in the service so the edge cases can be checked
 * without a database.
 */

/** How many messages arrive at once, on first load and on each page after. */
export const PAGE_SIZE = 50

/**
 * Is there likely to be another page behind this one?
 *
 * Inferred from the size of what came back rather than asked of the database.
 * A count query on every page would double the requests to answer a question
 * whose only consequence is whether a button is drawn.
 *
 * A short page means the end. A full page means "probably more", and being
 * wrong costs one empty fetch the next time the button is pressed - at which
 * point the answer corrects itself, because that fetch comes back short.
 *
 * @param {unknown[]} rows what the last request returned
 * @param {number} [limit] what it asked for
 */
export function hasMoreBefore(rows, limit = PAGE_SIZE) {
  if (!Array.isArray(rows)) return false
  return rows.length >= limit
}

/**
 * Where the next page should start from.
 *
 * The timestamp of the oldest message held, used as an exclusive upper bound.
 * Exclusive matters: `lte` would return that same message again every time,
 * and the merge would quietly absorb the duplicate, leaving a button that
 * appears to work while fetching the same page forever.
 *
 * Timestamps rather than ids, because the index this rides on leads with
 * `created_at`. Two messages in one room sharing a microsecond would be needed
 * to lose one, which insert latency makes impractical.
 *
 * @param {{createdAt: string}[]} messages the conversation, oldest first
 * @returns {string | null} null when there is nothing loaded to page back from
 */
export function oldestCursor(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null

  /*
   * Scanned rather than taking messages[0]. The list is sorted for display,
   * and a caller holding it in a different order - or mid-merge, as a realtime
   * message lands - would otherwise page from the wrong end and fetch nothing.
   */
  let oldest = null
  for (const message of messages) {
    const at = message?.createdAt
    if (typeof at !== 'string') continue
    if (oldest === null || at < oldest) oldest = at
  }
  return oldest
}
