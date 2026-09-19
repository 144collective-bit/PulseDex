/**
 * What a profile may contain, beyond a name.
 *
 * A bio, a few links, and a picture. All three are shown to strangers, which
 * is the thing that makes them different from the rest of the profile: the
 * theme and the sound preference are between somebody and their browser, and
 * these are published.
 *
 * Links get the most attention here, and the reason is specific to this
 * product. A profile link on a site about which tokens to buy is close to an
 * ideal phishing surface - "claim your airdrop", pointing at a lookalike
 * domain, under a name the reader already half-trusts because they have been
 * talking to them. The rules below exist for that and not for tidiness.
 */

import { stripInvisible, normaliseNewlines, capNewlines, trimLineEnds } from './textClean.js'

/** Longest a bio may be. Enough for a sentence about yourself, short enough
 *  that a profile card stays a card. */
export const MAX_BIO_LENGTH = 300

/** How many links a profile may list. */
export const MAX_LINKS = 3

/**
 * Tidy a bio, or decide there isn't one.
 *
 * Null rather than an error when it cannot be used, matching how a handle is
 * handled: a bio is decoration, and losing it is a smaller failure than losing
 * whatever else the person was saving at the time.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normaliseBio(raw) {
  if (typeof raw !== 'string') return null

  // One newline at most: a bio sits in a fixed-height card, and a wall of
  // blank lines is a way to push everything around it off the screen.
  const cleaned = trimLineEnds(capNewlines(stripInvisible(normaliseNewlines(raw)), 1)).trim()

  if (cleaned.length === 0) return null
  if ([...cleaned].length > MAX_BIO_LENGTH) return null
  return cleaned
}

/**
 * Check one link.
 *
 * https only. Not http, which would let a profile downgrade whoever clicks it
 * onto a connection somebody else can rewrite - and every site worth linking
 * to has had TLS for a decade.
 *
 * Credentials in the authority are refused outright rather than stripped.
 * `https://pulsex.com@evil.example` is a link to evil.example that reads as a
 * link to pulsex.com, which is the whole trick, and a reader checking the URL
 * before clicking would be checking the part that does not decide where they
 * go.
 *
 * @param {unknown} raw
 * @returns {{ url: string, host: string } | null}
 */
export function normaliseLink(raw) {
  if (typeof raw !== 'string') return null

  const trimmed = stripInvisible(raw).trim()
  if (trimmed.length === 0 || trimmed.length > 500) return null

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null
  if (!parsed.hostname || !parsed.hostname.includes('.')) return null

  /*
   * The host is returned alongside the url, and it is what the interface
   * shows. The alternative - letting somebody supply their own label - is how
   * a link reading "pulsex.com" arrives at a domain that is not pulsex.com.
   * Nobody gets to name their own link here.
   */
  return { url: parsed.toString(), host: parsed.hostname.replace(/^www\./, '') }
}

/**
 * Check a list of links.
 *
 * Duplicates by host are dropped: three links to the same place is either a
 * mistake or an attempt to fill the card, and neither is worth rendering.
 *
 * @param {unknown} raw
 * @returns {{ url: string, host: string }[]}
 */
export function normaliseLinks(raw) {
  if (!Array.isArray(raw)) return []

  const seen = new Set()
  const out = []

  for (const entry of raw) {
    if (out.length >= MAX_LINKS) break
    const link = normaliseLink(typeof entry === 'string' ? entry : entry?.url)
    if (!link || seen.has(link.host)) continue
    seen.add(link.host)
    out.push(link)
  }

  return out
}
