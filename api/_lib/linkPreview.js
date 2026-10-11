import { lookup } from 'node:dns/promises'
import {
  MAX_HTML_BYTES,
  checkPreviewTarget,
  isBlockedAddress,
  readPreviewMeta,
} from '../../src/utils/linkSafety.js'

/**
 * Fetching a page a stranger linked to, from our server.
 *
 * This is the only outbound request in this application made to a URL that
 * somebody else chose, which makes it the only genuine server-side request
 * forgery surface here. Everything below is about narrowing it, and the
 * narrowing is in four layers because any one of them alone has a known way
 * past it.
 *
 *   1. The URL itself: https only, no credentials, default port only, no
 *      private or internal hostname, no literal address in a reserved range.
 *      That is `checkPreviewTarget`, in src/utils/linkSafety.js, with a test
 *      per branch.
 *   2. The resolved addresses: every A and AAAA record the hostname answers
 *      with is checked before we connect. This is what stops the
 *      straightforward attack, which is not a URL containing 169.254.169.254
 *      - that one layer 1 catches - but a hostname the attacker controls whose
 *      only record points there.
 *   3. Every redirect hop, by the same two checks. A 302 to
 *      http://169.254.169.254/ is how a target that passed on the way in
 *      reaches somewhere it should not, and `fetch` follows redirects by
 *      default, so following them is done by hand here.
 *   4. What comes back: HTML only, capped, with a deadline.
 *
 * **What this does not close, stated plainly.** Between resolving a hostname
 * and connecting to it, `fetch` resolves it again - so an attacker who
 * controls the DNS can answer publicly the first time and privately the
 * second. That is DNS rebinding, and closing it means resolving once and
 * connecting to that literal address with the Host header set by hand, which
 * `fetch` does not expose. Doing it properly needs a custom agent or an
 * undici dispatcher, which is the right fix and a larger change than this
 * batch. Until then: layer 2 makes the attack require control of a domain's
 * DNS with a short TTL rather than just the ability to type a URL, and the
 * thing reachable on the other side of it is a Vercel function sandbox with
 * no private network of ours attached. Somebody changing this function should
 * know the window is there rather than discover it.
 */

/**
 * How long to wait.
 *
 * Five seconds, and it bounds the whole operation rather than each hop -
 * three redirects at five seconds each would be a request somebody is waiting
 * fifteen seconds on. A preview is decoration under a post; it gives up early.
 */
const TIMEOUT_MS = 5000

/** How many redirects to follow. Three is more than any honest page needs and
 *  few enough that a redirect loop is not a way to hold a function open. */
const MAX_HOPS = 3

/**
 * A browser-ish user agent, and the reason it is not a browser's.
 *
 * Naming ourselves means a site that does not want to be fetched by us can
 * say so, and means anybody reading their logs can tell what we are. Pretending
 * to be Chrome to get past a block would be deciding on their behalf.
 */
const USER_AGENT = 'PulseDexBot/1.0 (+https://pulsedex.net; link preview)'

/**
 * Does this hostname resolve anywhere it should not?
 *
 * Every address, not just the first. A hostname with one public A record and
 * one pointing at 10.0.0.1 is a hostname that resolves to 10.0.0.1 half the
 * time, and "half the time" is not a security property.
 *
 * A lookup that fails means refused, not allowed. An unresolvable hostname is
 * not fetchable anyway, so the strict answer costs nothing.
 *
 * @param {string} hostname
 * @returns {Promise<boolean>} true if it is safe to connect
 */
async function resolvesPublicly(hostname) {
  let addresses
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch {
    return false
  }

  if (!Array.isArray(addresses) || addresses.length === 0) return false
  return addresses.every((entry) => !isBlockedAddress(entry?.address))
}

/** Both checks on one URL: its shape, then where it resolves. */
async function allowed(raw) {
  const target = checkPreviewTarget(raw)
  if (!target.ok) return null
  return (await resolvesPublicly(target.host)) ? target : null
}

/**
 * Read at most `MAX_HTML_BYTES` of a response body.
 *
 * Streamed and counted rather than `res.text()`, because `text()` reads to the
 * end: a server answering with a gigabyte, or with no Content-Length and an
 * endless body, would be read into this function's memory in full. The cap is
 * the only thing standing between a preview and that, since Content-Length is
 * a claim the sender makes.
 */
async function readCapped(res) {
  if (!res.body) return ''

  const reader = res.body.getReader()
  const chunks = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      chunks.push(value)
      total += value.length
      if (total >= MAX_HTML_BYTES) break
    }
  } finally {
    // Tell the other end we are done, so a server still sending is not left
    // streaming into a function that has stopped reading.
    reader.cancel().catch(() => {})
  }

  const joined = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    joined.set(chunk.subarray(0, Math.min(chunk.length, total - at)), at)
    at += chunk.length
    if (at >= total) break
  }

  // Lossy on purpose: a page in an encoding this misreads produces a wrong
  // title, which is the same outcome as no title and not worth a decoder for.
  return new TextDecoder('utf-8', { fatal: false }).decode(joined)
}

/**
 * What a linked page says about itself.
 *
 * Returns `{ ok: false }` for everything that did not work, with no reason
 * attached - the caller caches the failure and draws nothing, and there is
 * nothing a reader could do with the detail. Failures are logged for us.
 *
 * @param {unknown} raw a URL out of a post body
 * @returns {Promise<{ ok: boolean, url?: string, title?: string|null,
 *   description?: string|null, siteName?: string|null }>}
 */
export async function fetchPreview(raw) {
  const first = await allowed(raw)
  if (!first) return { ok: false }

  /*
   * One deadline for the whole thing, shared across every hop. Passed as a
   * signal rather than checked between hops so a single slow response cannot
   * outlast it either.
   */
  const deadline = AbortSignal.timeout(TIMEOUT_MS)

  let target = first
  let res = null

  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
    try {
      res = await fetch(target.url, {
        /*
         * Manual, so every hop is checked. With `redirect: 'follow'` the
         * runtime would quietly take a 302 to http://169.254.169.254/ on our
         * behalf, which is how a URL that passed on the way in reaches
         * somewhere it should not - and the only observable result would be a
         * preview, so nothing would look wrong.
         */
        redirect: 'manual',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          // No cookies are ever sent - fetch sends none by default - and
          // nothing here adds an Authorization header. Worth being explicit
          // that this request carries no credentials of ours anywhere.
        },
        signal: deadline,
      })
    } catch (err) {
      console.error('link preview: fetch failed:', err?.message || err)
      return { ok: false }
    }

    if (res.status < 300 || res.status > 399) break

    const location = res.headers.get('location')
    if (!location) break

    /*
     * Resolved against the URL we asked for, because a Location header is
     * allowed to be relative - and then put through both checks again from
     * scratch. A hop is a new URL and gets no credit for where it came from.
     */
    let next
    try {
      next = new URL(location, target.url).toString()
    } catch {
      return { ok: false }
    }

    const checked = await allowed(next)
    if (!checked) {
      console.error('link preview: refused a redirect to', String(location).slice(0, 120))
      return { ok: false }
    }

    target = checked
    res = null
  }

  // Ran out of hops without a final response.
  if (!res) return { ok: false }
  if (!res.ok) return { ok: false }

  /*
   * HTML only. A preview is read out of markup, so anything else is either
   * not a page or is a payload there is no reason to pull into memory - and
   * a 400MB video would otherwise be read up to the cap for nothing.
   */
  const type = res.headers.get('content-type') || ''
  if (!/^\s*(text\/html|application\/xhtml\+xml)/i.test(type)) return { ok: false }

  let html
  try {
    html = await readCapped(res)
  } catch (err) {
    console.error('link preview: reading the body failed:', err?.message || err)
    return { ok: false }
  }

  const meta = readPreviewMeta(html)

  /*
   * A card needs something to say. With no title at all there is nothing to
   * draw but the hostname, which the link itself already shows - so that
   * counts as a failure and gets cached as one, rather than becoming an empty
   * card under every post linking to a page with no metadata.
   */
  if (!meta.title) return { ok: false }

  return {
    ok: true,
    url: target.url,
    title: meta.title,
    description: meta.description,
    // The host is the fallback, because a card with no name on it gives a
    // reader no way to tell where a link goes - which is the one thing a
    // preview has to do on a site where a wrong link costs money.
    siteName: meta.siteName || target.host,
  }
}
