import { splitMentions } from './mentions'
import { linksIn } from './linkSafety'

/**
 * A post's body, broken into the pieces that get drawn differently.
 *
 * Three kinds: plain text, a mention, and a link. Mentions were already
 * handled by `splitMentions`; Batch 3 adds links, because until now a URL in a
 * post was drawn as text somebody had to select and paste. On a site whose
 * posts are substantially "look at this", that was the main thing a post could
 * not do.
 *
 * Mentions win over links where they overlap. They cannot really overlap - a
 * handle is `@something` and a link starts `https://` - but the rule has to be
 * one way round rather than depending on which pass ran first, and a mention
 * is a row the database holds while a link is found by pattern.
 *
 * Still only pieces of the original string. Nothing here builds markup, and
 * the caller maps the pieces to elements - so a handle or a URL containing
 * angle brackets is drawn as angle brackets. There is no point in this path
 * where a string becomes HTML.
 *
 * @param {unknown} body
 * @param {Array<{ handle: string, address: string }>} [mentions]
 * @returns {Array<{ type: 'text'|'mention'|'link', value: string, address?: string }>}
 */
export function postSegments(body, mentions = []) {
  if (typeof body !== 'string' || body.length === 0) return []

  // Mentions first, which gives text runs with the mentions already carved
  // out. Links are then found inside the text runs only, which is what makes
  // mentions win without needing to compare positions.
  const withMentions = splitMentions(body, mentions)

  const urls = linksIn(body)
  if (urls.length === 0) return withMentions

  const segments = []
  for (const segment of withMentions) {
    if (segment.type !== 'text') {
      segments.push(segment)
      continue
    }
    segments.push(...splitLinksIn(segment.value, urls))
  }

  return segments
}

/**
 * One run of text, split around any of `urls` that appear in it.
 *
 * Found by `indexOf` against the known list rather than by running the URL
 * pattern again. The list came from the whole body, so this cannot invent a
 * link the body did not contain - and matching a fixed string is not a
 * pattern that can be made to behave badly by what somebody typed.
 *
 * Longest first, so a link that is a prefix of another - `https://a.com` and
 * `https://a.com/path` in one post - does not match inside the longer one and
 * leave `/path` stranded as text beside a link to the wrong page. The same
 * problem `splitMentions` solves the same way.
 */
function splitLinksIn(text, urls) {
  const ordered = [...urls].sort((a, b) => b.length - a.length)
  const segments = []

  let rest = text
  let guard = 0

  while (rest.length > 0 && guard < 500) {
    guard += 1

    // The earliest of any of them, so the pieces come out in reading order
    // even though the list is in length order.
    let at = -1
    let found = null
    for (const url of ordered) {
      const index = rest.indexOf(url)
      if (index !== -1 && (at === -1 || index < at)) {
        at = index
        found = url
      }
    }

    if (found === null) break

    if (at > 0) segments.push({ type: 'text', value: rest.slice(0, at) })
    segments.push({ type: 'link', value: found })
    rest = rest.slice(at + found.length)
  }

  if (rest.length > 0) segments.push({ type: 'text', value: rest })
  return segments
}

/**
 * How a link is shown: the host, and a hint of the path.
 *
 * A full URL in running text is unreadable and, worse, is a way to make a link
 * look like it points somewhere it does not - a long path can be made to read
 * as a hostname. The host is the part that decides where a press goes, so it
 * leads, and the path is truncated after it.
 *
 * Falls back to the raw string for anything unparseable, which cannot reach
 * here from `postSegments` - the pattern that found it required `https://` -
 * but this function is exported and somebody will call it with something else.
 *
 * @param {unknown} url
 * @returns {string}
 */
export function linkLabel(url) {
  if (typeof url !== 'string') return ''

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  const host = parsed.hostname.replace(/^www\./, '')
  const tail = `${parsed.pathname}${parsed.search}`.replace(/^\/$/, '')

  if (!tail) return host
  return tail.length > 20 ? `${host}${tail.slice(0, 19)}…` : `${host}${tail}`
}
