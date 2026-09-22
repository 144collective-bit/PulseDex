/**
 * Marking the matched part of a search result.
 *
 * Split out from the component because it is the part that can be wrong in a
 * way nobody notices: a highlight that lands one character off, or that
 * silently drops the rest of a message because the term contained a bracket,
 * looks like a rendering quirk rather than a bug. Here it can be asserted on.
 */

/** Escape a string for use as a literal inside a regular expression. */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The term as the search actually ran it.
 *
 * The same shaping `containsPattern` does before the query goes out, repeated
 * here rather than imported, because the two answer different questions and
 * only happen to agree: one builds a LIKE pattern, this one builds a string to
 * find in the result. Asterisks are dropped for the same reason they are
 * dropped there - PostgREST turns them into wildcards before Postgres sees
 * them, so a message matched by `a*b` was matched by `ab`, and highlighting
 * the asterisk would mark something the database never looked for.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function searchTerm(value) {
  return typeof value === 'string' ? value.replace(/\*/g, '').trim() : ''
}

/**
 * Split a message into the parts that matched and the parts that did not.
 *
 * Returns segments in order, so rendering is a map with no index arithmetic
 * and no `dangerouslySetInnerHTML` - which matters more here than usual, since
 * every string involved was typed by a stranger and this is the one place that
 * would be tempted to build markup out of both at once.
 *
 * Matching is case-insensitive and literal, to agree with the `ilike` that
 * found the row. An empty term returns the whole body as one unmatched
 * segment rather than an empty list, so a caller never has to special-case it
 * to avoid rendering nothing.
 *
 * @param {unknown} body
 * @param {unknown} term
 * @returns {{text: string, match: boolean}[]}
 */
export function splitHighlight(body, term) {
  const text = typeof body === 'string' ? body : ''
  const needle = searchTerm(term)

  if (!text) return []
  if (!needle) return [{ text, match: false }]

  const segments = []
  const pattern = new RegExp(escapeRegExp(needle), 'gi')
  let last = 0

  for (const found of text.matchAll(pattern)) {
    if (found.index > last) segments.push({ text: text.slice(last, found.index), match: false })
    segments.push({ text: found[0], match: true })
    last = found.index + found[0].length
  }

  if (last < text.length) segments.push({ text: text.slice(last), match: false })
  return segments
}
