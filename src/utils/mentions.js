/**
 * Mentions: finding them in what somebody typed, and drawing them afterwards.
 *
 * Two different jobs, and they deliberately do not share a pattern.
 *
 * Writing a post, the server has to work out who "@someone" meant. It only
 * ever sees text, so it needs a rule for where a name ends, and that rule has
 * to be narrow: letters, digits and underscores. A wider one cannot exist,
 * because a handle here may contain spaces and there is no way to tell
 * "@Pulse Trader" from "@Pulse" followed by the word "Trader".
 *
 * Drawing a post is the opposite situation and a much easier one. By then the
 * mentions are rows - `post_mentions` holds the address and the handle of
 * everybody the post named - so the exact text to look for is known, spaces
 * and all. No pattern is needed or wanted: the handle is searched for
 * literally.
 *
 * Which is why the narrow pattern costs nothing. Somebody whose handle has a
 * space in it cannot be mentioned by typing, but can be by picking them from
 * the composer's list - and once picked, they render correctly forever, and
 * keep rendering correctly after they change their name.
 */

/** How long a handle may be, matching profiles.handle. */
const MAX_HANDLE = 32

/**
 * A mention somebody typed, as opposed to one they picked.
 *
 * Narrow on purpose - see above. Two more things it has to get right:
 *
 * The character before the `@` must not be a word character, or an email
 * address becomes a mention of its own domain and every `you@example.com` in
 * a post pings an account called "example".
 *
 * And it must not match inside a longer run of `@`, so "@@name" is not read
 * as a mention of "@name".
 */
const TYPED = new RegExp(`(^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{1,${MAX_HANDLE}})`, 'g')

/**
 * The handles a body appears to mention, lowercased and deduplicated.
 *
 * Lowercased because that is how the database matches them - `profiles` has a
 * generated `handle_lower` column for exactly this - and deduplicated because
 * naming somebody three times in one post is still one mention of them.
 *
 * @param {unknown} body
 * @returns {string[]}
 */
export function findTypedMentions(body) {
  if (typeof body !== 'string' || body.length === 0) return []

  const found = new Set()
  // A fresh regex per call: a global one carries `lastIndex` between calls and
  // would start the second search wherever the first one stopped.
  const pattern = new RegExp(TYPED.source, 'g')

  let match
  while ((match = pattern.exec(body)) !== null) {
    found.add(match[2].toLowerCase())
  }

  return [...found]
}

/** Escape a handle so it can be searched for literally inside a regex. */
function literal(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Break a body into the parts that are mentions and the parts that are not.
 *
 * Returns segments in order, each either `{ type: 'text', value }` or
 * `{ type: 'mention', value, handle, address }`. The caller renders them; this
 * decides only where the boundaries are.
 *
 * Nothing here produces markup. The segments become React elements, so a
 * handle containing angle brackets is text like any other and there is no
 * point at which it could be anything else.
 *
 * @param {unknown} body
 * @param {Array<{handle: string, address: string}>} mentions
 * @returns {Array<{type: 'text'|'mention', value: string, handle?: string, address?: string}>}
 */
export function splitMentions(body, mentions = []) {
  if (typeof body !== 'string' || body.length === 0) return []
  if (!Array.isArray(mentions) || mentions.length === 0) {
    return [{ type: 'text', value: body }]
  }

  /*
   * Longest handle first.
   *
   * With both "@pulse" and "@pulse trader" mentioned in one post, the shorter
   * one matches inside the longer, and taking it first would leave the word
   * "trader" stranded as plain text beside a link to the wrong person.
   */
  const ordered = mentions
    .filter((m) => m && typeof m.handle === 'string' && m.handle.length > 0)
    .sort((a, b) => b.handle.length - a.handle.length)

  // Every place a mention was found, before any of them are turned into
  // segments - so overlaps can be resolved against the whole set rather than
  // in the order they happened to be discovered.
  const hits = []
  for (const mention of ordered) {
    // Case-insensitive: the row holds the handle as its owner wrote it, and
    // whoever typed it had no reason to match their capitalisation.
    const pattern = new RegExp(`@${literal(mention.handle)}`, 'gi')
    let match
    while ((match = pattern.exec(body)) !== null) {
      hits.push({
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        handle: mention.handle,
        address: mention.address,
      })
    }
  }

  if (hits.length === 0) return [{ type: 'text', value: body }]

  hits.sort((a, b) => a.start - b.start || b.end - a.end)

  const segments = []
  let cursor = 0

  for (const hit of hits) {
    // Already inside a mention taken earlier, which was the longer one.
    if (hit.start < cursor) continue

    if (hit.start > cursor) {
      segments.push({ type: 'text', value: body.slice(cursor, hit.start) })
    }
    segments.push({
      type: 'mention',
      value: hit.value,
      handle: hit.handle,
      address: hit.address,
    })
    cursor = hit.end
  }

  if (cursor < body.length) {
    segments.push({ type: 'text', value: body.slice(cursor) })
  }

  return segments
}
