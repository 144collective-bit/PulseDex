/**
 * Escaping a search box's contents before it becomes a SQL LIKE pattern.
 *
 * Needed because `%` and `_` are wildcards in LIKE, and the text being wrapped
 * in them comes from whatever somebody typed. Unescaped, a search for `%`
 * matches every row in the table - which for a handle search means the
 * "people" list quietly becomes "everybody", and for anything doing a
 * single-row lookup means matching the wrong person entirely. That second case
 * has already bitten this codebase once, in the profile lookup, and was fixed
 * there by removing the pattern rather than escaping it.
 *
 * Here a pattern is genuinely wanted - the point of a search box is partial
 * matching - so it has to be escaped instead.
 */

/**
 * Make text safe to interpolate into a LIKE pattern.
 *
 * The backslash goes first and that order is the whole correctness of this
 * function. Escaping `%` and `_` first would insert backslashes that the
 * backslash rule then escaped again, turning a search for `50%` into one for a
 * literal backslash followed by a wildcard.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeLikePattern(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * A "contains" pattern for a search term, or null if there is nothing to
 * search for.
 *
 * Null rather than `%%` for an empty box, because that pattern matches every
 * row - a search that has not been typed into should return nothing, not
 * everything.
 *
 * Asterisks are removed rather than escaped, and that is specific to how this
 * value travels. PostgREST reads `*` in a like pattern as `%` when it parses
 * the query string, before Postgres ever sees it - so escaping it here would
 * be escaping the wrong layer, and a search for `*` would still come out as
 * "match everything". Dropping it costs somebody searching for a name with an
 * asterisk in it the asterisk, and nothing else: the rest of the name still
 * matches.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function containsPattern(value) {
  const trimmed = typeof value === 'string' ? value.replace(/\*/g, '').trim() : ''
  if (!trimmed) return null
  return `%${escapeLikePattern(trimmed)}%`
}
