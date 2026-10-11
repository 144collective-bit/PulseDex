/**
 * Deciding whether our server may fetch a URL a stranger put in a post.
 *
 * This is the only place in the app where somebody else's input becomes an
 * outbound request from our infrastructure, which makes it the only genuine
 * server-side request forgery surface here. Everything in this file exists to
 * narrow it.
 *
 * Pure, and separate from the fetch (api/_lib/linkPreview.js), because the
 * deciding is the part worth checking exhaustively and the part that can be
 * checked without a network at all. Every branch below has a test.
 *
 * What this cannot do, stated plainly because the gap is real: a hostname is
 * resolved by DNS, and DNS can answer differently the second time it is asked.
 * So validating a resolved address and then connecting by hostname leaves a
 * window where the answer changes in between - DNS rebinding. Closing it
 * properly means resolving once and connecting to that literal address with
 * the Host header set by hand, which `fetch` does not expose. The caller
 * resolves and checks every address before connecting, which stops the
 * straightforward attack (a hostname whose only A record is 169.254.169.254)
 * and leaves the racing one open. That residual is written up in
 * api/_lib/linkPreview.js, where somebody changing the fetch will read it.
 */

/**
 * The first link in a post body, or null.
 *
 * One preview per post, and the first link rather than all of them: a post
 * with six links would otherwise be six outbound requests and six cards under
 * four lines of text, and the first link is the one the post is about.
 *
 * Only https. A preview of an http page would mean our server making a
 * plaintext request on a reader's behalf and presenting what came back as
 * what the page says, which is a claim we cannot make about an unauthenticated
 * connection.
 *
 * The pattern stops at whitespace and at the punctuation that ends a sentence
 * rather than belongs to a URL - "see https://example.com." should not try to
 * fetch a path ending in a full stop. Brackets are excluded for the same
 * reason: a link inside parentheses is the common case in prose.
 *
 * @param {unknown} body
 * @returns {string|null}
 */
export function firstLinkIn(body) {
  if (typeof body !== 'string') return null

  const match = /https:\/\/[^\s<>"'`()[\]{}]+/.exec(body)
  if (!match) return null

  // Trailing sentence punctuation belongs to the prose, not the URL.
  const trimmed = match[0].replace(/[.,;:!?]+$/, '')
  return trimmed.length > 'https://'.length ? trimmed : null
}

/**
 * Every link in a post body, in order, deduplicated.
 *
 * Used for rendering - a post's links are all made clickable even though only
 * the first gets a preview. Capped, because the renderer should not be handed
 * an unbounded list by somebody who pasted a wall of URLs.
 *
 * @param {unknown} body
 * @param {number} [limit]
 * @returns {string[]}
 */
export function linksIn(body, limit = 10) {
  if (typeof body !== 'string') return []

  const found = body.match(/https:\/\/[^\s<>"'`()[\]{}]+/g) || []
  const seen = new Set()

  for (const raw of found) {
    const trimmed = raw.replace(/[.,;:!?]+$/, '')
    if (trimmed.length > 'https://'.length) seen.add(trimmed)
    if (seen.size >= limit) break
  }

  return [...seen]
}

/* ------------------------------------------------------------------ IPv4 -- */

/** An IPv4 literal as a 32-bit number, or null if it is not one.
 *
 *  Strict: four decimal octets, no leading zeroes, no octal or hex or
 *  shorthand. Those alternative spellings are exactly how a blocklist on the
 *  text of an address gets walked past - `0177.0.0.1` and `2130706433` are
 *  both 127.0.0.1 to a resolver - so anything that is not the one canonical
 *  form is not treated as an address at all, and falls through to being a
 *  hostname, which gets resolved and checked properly. */
function ipv4ToInt(value) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value)
  if (!match) return null

  let total = 0
  for (let i = 1; i <= 4; i += 1) {
    const part = match[i]
    // A leading zero means somebody is spelling it oddly. Refuse the parse.
    if (part.length > 1 && part[0] === '0') return null
    const n = Number(part)
    if (n > 255) return null
    total = total * 256 + n
  }
  return total
}

/** Ranges no outbound request of ours has any business reaching. */
const BLOCKED_V4 = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, and the cloud metadata address
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
]

const inV4Range = (ip, [base, bits]) => {
  const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0
  return (ip & mask) >>> 0 === (ipv4ToInt(base) & mask) >>> 0
}

/* ------------------------------------------------------------------ IPv6 -- */

/**
 * An IPv6 literal as eight 16-bit groups, or null.
 *
 * Handles `::` once, and the IPv4-mapped tail (`::ffff:1.2.3.4`) because that
 * is the spelling that gets an IPv4 address past an IPv6-only check.
 */
function ipv6Groups(value) {
  let text = value.trim()
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1)
  if (!/^[0-9a-fA-F:.]+$/.test(text)) return null

  // A trailing IPv4 is turned into two groups first, so the rest of this only
  // has to think in hex groups.
  const dotted = /^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(text)
  if (dotted) {
    const v4 = ipv4ToInt(dotted[2])
    if (v4 === null) return null
    const hi = (v4 >>> 16) & 0xffff
    const lo = v4 & 0xffff
    text = `${dotted[1]}${hi.toString(16)}:${lo.toString(16)}`
  }

  const halves = text.split('::')
  if (halves.length > 2) return null

  const parse = (part) =>
    part === ''
      ? []
      : part.split(':').map((g) => (/^[0-9a-fA-F]{1,4}$/.test(g) ? parseInt(g, 16) : NaN))

  const head = parse(halves[0])
  const tail = halves.length === 2 ? parse(halves[1]) : []
  if ([...head, ...tail].some((g) => Number.isNaN(g))) return null

  if (halves.length === 1) return head.length === 8 ? head : null

  const fill = 8 - head.length - tail.length
  if (fill < 1) return null

  return [...head, ...Array(fill).fill(0), ...tail]
}

/* ------------------------------------------------------------------------- */

/**
 * Is this literal address one our server must not connect to?
 *
 * True for anything private, loopback, link-local, multicast or reserved -
 * and true for anything unparseable, which is the important default. A
 * spelling this function does not understand is not a spelling to trust.
 *
 * @param {unknown} value an IP literal, with or without brackets
 * @returns {boolean}
 */
export function isBlockedAddress(value) {
  if (typeof value !== 'string' || !value.trim()) return true

  const v4 = ipv4ToInt(value.trim())
  if (v4 !== null) return BLOCKED_V4.some((range) => inV4Range(v4, range))

  const groups = ipv6Groups(value)
  if (!groups) return true

  const [a, b] = groups
  const allZero = groups.every((g) => g === 0)

  if (allZero) return true // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true // ::1
  if ((a & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((a & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (a === 0x2001 && b === 0x0db8) return true // 2001:db8::/32 documentation

  /*
   * An IPv4 address wearing an IPv6 hat. `::ffff:169.254.169.254` is the
   * metadata endpoint, and a check that only understood dotted quads would
   * wave it through.
   */
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return isBlockedAddress(`${(groups[6] >> 8) & 0xff}.${groups[6] & 0xff}.${(groups[7] >> 8) & 0xff}.${groups[7] & 0xff}`)
  }

  // 64:ff9b::/96 - NAT64, which translates to an arbitrary IPv4 destination.
  if (a === 0x0064 && b === 0xff9b) return true

  return false
}

/** Hostnames that name something inside a network rather than on the
 *  internet. Matched on the whole label suffix, so `notlocalhost.com` is
 *  unaffected. */
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan']
const BLOCKED_HOSTS = ['localhost', 'metadata.google.internal', 'metadata']

/** Why a URL was refused. Codes rather than sentences, because the caller
 *  decides what, if anything, a reader is told. */
export const PREVIEW_REFUSED = {
  notUrl: 'notUrl',
  notHttps: 'notHttps',
  hasCredentials: 'hasCredentials',
  blockedHost: 'blockedHost',
  blockedAddress: 'blockedAddress',
  tooLong: 'tooLong',
  nonDefaultPort: 'nonDefaultPort',
}

/** Matches the `url` column in 0020. A URL longer than this cannot be cached,
 *  so there is no point fetching it. */
export const MAX_PREVIEW_URL = 2000

/**
 * May our server fetch this?
 *
 * Returns the normalised URL to fetch and to key the cache on, or a reason.
 * Normalising here rather than at the call site means the gate and the cache
 * key are the same string by construction - two URLs that differ only by a
 * fragment are one row, and one fetch.
 *
 * The port must be the default. An https URL naming port 9200 or 6379 is
 * reaching for a service rather than a web page, and allowing arbitrary ports
 * turns one host that resolves publicly into a port scanner.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, url: string, host: string } | { ok: false, reason: string }}
 */
export function checkPreviewTarget(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, reason: PREVIEW_REFUSED.notUrl }
  }
  if (raw.length > MAX_PREVIEW_URL) {
    return { ok: false, reason: PREVIEW_REFUSED.tooLong }
  }

  let url
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: PREVIEW_REFUSED.notUrl }
  }

  if (url.protocol !== 'https:') return { ok: false, reason: PREVIEW_REFUSED.notHttps }

  // `https://user:pass@host` would send credentials somebody else chose, from
  // our server, and the userinfo half is also a classic way to make a URL read
  // as pointing somewhere it does not.
  if (url.username || url.password) {
    return { ok: false, reason: PREVIEW_REFUSED.hasCredentials }
  }

  if (url.port && url.port !== '443') {
    return { ok: false, reason: PREVIEW_REFUSED.nonDefaultPort }
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return { ok: false, reason: PREVIEW_REFUSED.notUrl }

  if (BLOCKED_HOSTS.includes(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: PREVIEW_REFUSED.blockedHost }
  }

  /*
   * A hostname with no dot in it is a single label, which on a private network
   * resolves to a machine on that network. Refused: nothing on the public
   * internet is addressed that way.
   */
  if (!host.includes('.') && !host.includes(':')) {
    return { ok: false, reason: PREVIEW_REFUSED.blockedHost }
  }

  // An IP literal is checked here and now. A hostname cannot be - that needs a
  // resolver, and the caller does it before connecting.
  const bracketed = url.hostname.startsWith('[')
  if (bracketed || ipv4ToInt(host) !== null) {
    if (isBlockedAddress(bracketed ? url.hostname : host)) {
      return { ok: false, reason: PREVIEW_REFUSED.blockedAddress }
    }
  }

  /*
   * The fragment is dropped: it never reaches a server, so two URLs differing
   * only there are one fetch. The query is kept - it routinely selects which
   * page is being linked to.
   */
  url.hash = ''

  const normalised = url.toString()
  if (normalised.length > MAX_PREVIEW_URL) {
    return { ok: false, reason: PREVIEW_REFUSED.tooLong }
  }

  return { ok: true, url: normalised, host }
}

/* -------------------------------------------------------- reading a page -- */

/** How much of a page is read looking for its metadata. The head of an HTML
 *  document is at the top of it; anything that puts its og: tags 200KB in is
 *  not a page this is going to render a card for. */
export const MAX_HTML_BYTES = 256 * 1024

/** The few entities worth decoding in a title. Not a general HTML entity
 *  decoder: this output is rendered as text by React, so the risk of an
 *  unhandled entity is a visible `&amp;`, not an injection. */
const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

const decode = (text) =>
  text
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    // Collapse the whitespace a <title> spread over three lines arrives with.
    .replace(/\s+/g, ' ')
    .trim()

/** One meta tag's content, by property or name, in either attribute order. */
function meta(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  ]

  for (const pattern of patterns) {
    const found = pattern.exec(html)
    if (found && found[1].trim()) return decode(found[1])
  }
  return null
}

/**
 * What a page says about itself.
 *
 * Regex over the markup rather than a parser, and that is a deliberate choice
 * about dependencies rather than laziness: an HTML parser in a serverless
 * function is a large dependency and a large attack surface to add for four
 * strings, and nothing here builds a DOM or evaluates anything. The output is
 * rendered as text by React, so a tag this misreads produces a wrong title,
 * not a script.
 *
 * Open Graph first, then the document title. `og:site_name` is preferred over
 * the hostname because it is what the site calls itself, but the caller passes
 * the host as a fallback - a card with no name on it gives a reader no way to
 * tell where a link goes, which is the one thing a preview must do.
 *
 * Returns nulls rather than throwing on anything unparseable. A page we cannot
 * read is a post with no card under it.
 *
 * @param {unknown} html
 * @param {number} [limit] how much to look at
 */
export function readPreviewMeta(html, limit = MAX_HTML_BYTES) {
  if (typeof html !== 'string') return { title: null, description: null, siteName: null }

  const head = html.slice(0, limit)

  const titleTag = /<title[^>]*>([\s\S]{0,500}?)<\/title>/i.exec(head)

  return {
    title: clamp(meta(head, 'og:title') || (titleTag ? decode(titleTag[1]) : null), 300),
    description: clamp(meta(head, 'og:description') || meta(head, 'description'), 500),
    siteName: clamp(meta(head, 'og:site_name'), 100),
  }
}

/** Trim to what the column holds, so a page with a 4KB description is cached
 *  rather than refused by a check constraint after the fetch already happened. */
function clamp(value, max) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed
}
