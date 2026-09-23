/**
 * The composer half of mentions: what is being typed, and what to do when
 * somebody picks a name.
 *
 * `src/utils/mentions.js` covers the other two halves - what the server can
 * work out from text alone, and how a stored mention is drawn. This file is
 * about the moment in between, and it exists because of a decision made when
 * `post_mentions` was designed: a handle here may contain spaces, so
 * "@Pulse Trader" cannot be parsed out of a post by any rule. Those accounts
 * are mentionable only by being picked from a list, and this is the list's
 * arithmetic.
 *
 * Which means the query deliberately allows spaces. A picker that stopped at
 * the first one could never offer the accounts it is the only way to reach.
 */

/** How long a handle may be, matching profiles.handle. */
const MAX_HANDLE = 32

/**
 * Is somebody typing a mention right now, and what have they typed?
 *
 * Looks backwards from the caret for an `@` that starts one. Returns where it
 * is and what follows it, or null when there is nothing being typed - which
 * is the ordinary case and is what closes the picker.
 *
 * The character before the `@` must not be a word character or another `@`,
 * the same rule the server uses: without it every `you@example.com` opens a
 * picker for "example", and "@@name" reads as a mention of "@name".
 *
 * A newline ends it. A mention is written on one line even when a post is not,
 * and without this, opening a picker and pressing Enter twice would leave it
 * searching for two paragraphs of text.
 *
 * @param {unknown} text
 * @param {unknown} caret index of the cursor, as `selectionStart` gives it
 * @returns {{ at: number, query: string } | null} `at` is the index of the `@`
 */
export function readMentionQuery(text, caret) {
  if (typeof text !== 'string') return null

  const end = Number.isInteger(caret) ? Math.max(0, Math.min(caret, text.length)) : text.length

  /*
   * Only as far back as a handle could reach, plus the `@` itself. Without a
   * bound this walks the whole post on every keystroke, and a two-thousand
   * character draft is exactly where that is most likely to be noticed.
   */
  const floor = Math.max(0, end - MAX_HANDLE - 1)

  for (let i = end - 1; i >= floor; i--) {
    const char = text[i]

    // A line break ends any mention being typed before it.
    if (char === '\n' || char === '\r') return null

    if (char !== '@') continue

    const before = i > 0 ? text[i - 1] : ''
    if (before && /[A-Za-z0-9_@]/.test(before)) return null

    const query = text.slice(i + 1, end)
    if (query.length > MAX_HANDLE) return null

    return { at: i, query }
  }

  return null
}

/**
 * Put a picked handle into the draft.
 *
 * Replaces the `@` and whatever had been typed after it, and puts a space
 * behind it - somebody who has just picked a name is about to write the rest
 * of the sentence, and making them press space first is the kind of thing
 * that gets a feature called fiddly.
 *
 * Returns the new text and where the caret should go, because the caller has
 * to set both and the second is easy to forget - a textarea whose value
 * changes without its selection puts the cursor at the end, which on a long
 * post means somewhere else entirely.
 *
 * @param {string} text
 * @param {number} caret
 * @param {string} handle
 * @returns {{ text: string, caret: number }} unchanged when there is no
 *   mention being typed at that caret
 */
export function applyMention(text, caret, handle) {
  const found = readMentionQuery(text, caret)
  if (!found || typeof handle !== 'string' || !handle) {
    return { text: typeof text === 'string' ? text : '', caret: caret || 0 }
  }

  const end = Math.max(0, Math.min(caret, text.length))

  // Not doubled when the next character is already a space, so picking a name
  // in the middle of a sentence does not push the words apart.
  const rest = text.slice(end)
  const spaced = rest.startsWith(' ')
  const spacer = spaced ? '' : ' '

  const head = `${text.slice(0, found.at)}@${handle}${spacer}`

  /*
   * Past the space, whether this added it or it was already there. The caret
   * lands in the same place relative to what the reader sees either way,
   * which is what stops picking a name mid-sentence behaving differently from
   * picking one at the end.
   */
  return { text: `${head}${rest}`, caret: head.length + (spaced ? 1 : 0) }
}

/**
 * Which picked mentions the draft still names.
 *
 * Somebody picks a name, then deletes it, then posts. Without this the
 * address is still on the list and that person is notified about a post that
 * does not mention them - which is a notification nobody can make sense of
 * and, done deliberately, a way to put a message in somebody's inbox with no
 * trace of it anywhere they can see.
 *
 * Matched case-insensitively and literally, the same way splitMentions draws
 * them, so what gets recorded and what gets highlighted agree.
 *
 * @param {unknown} text
 * @param {Array<{handle: string, address: string}>} picked
 * @returns {Array<{handle: string, address: string}>}
 */
export function keepPicked(text, picked) {
  if (typeof text !== 'string' || !Array.isArray(picked)) return []

  const lower = text.toLowerCase()

  const kept = []
  const seen = new Set()

  for (const one of picked) {
    if (!one || typeof one.handle !== 'string' || typeof one.address !== 'string') continue
    if (seen.has(one.address)) continue
    if (!lower.includes(`@${one.handle.toLowerCase()}`)) continue

    seen.add(one.address)
    kept.push(one)
  }

  return kept
}
