import { createHash } from 'node:crypto'
import { isSameOrigin, rateLimit } from '../../_lib/guard.js'
import { serviceClient } from '../../_lib/supabase.js'
import { fetchPreview } from '../../_lib/linkPreview.js'
import { checkPreviewTarget } from '../../../src/utils/linkSafety.js'

/**
 * Fill the link preview cache for one URL.
 *
 * A read-through cache, like api/_routes/profile/first-seen.js: a hit is one
 * row of our own database, a miss is one outbound request written back so it
 * never happens again. The browser reads hits directly from Supabase and only
 * reaches this route on a miss - see src/services/linkPreviews.js.
 *
 * GET only, and no body is ever read. What this writes is what a public page
 * says about itself; the only thing the caller supplies is which URL to look
 * at, which is the whole of the attack surface and is why
 * api/_lib/linkPreview.js is four layers of checks with the residual risk
 * written down.
 *
 * Same-origin, although everything it returns is public. This turns a request
 * into an outbound request from our infrastructure to an address the caller
 * named; left open it is an anonymous fetching service with our rate limit and
 * our IP address attached, and whoever we fetched would be right to blame us.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Request did not come from this site.' })
  }

  const url = new URL(req.url, 'http://localhost')

  /*
   * The gate first, before anything is read or written.
   *
   * The normalised URL it returns is both what gets fetched and what the cache
   * is keyed on, which is what makes two links differing only by a fragment
   * one row and one request. Keying on the raw text instead would mean the
   * same page fetched once per spelling of it.
   */
  const target = checkPreviewTarget(url.searchParams.get('url'))
  if (!target.ok) {
    /*
     * One sentence for every refusal, with the reason deliberately left out.
     *
     * The reasons distinguish "not https" from "that address is in a blocked
     * range", and the second tells whoever is probing exactly which ranges are
     * refused - which is a map of what to try next. The browser has the same
     * check and already knows it will not render a card, so the detail buys
     * nothing on this side.
     */
    return res.status(400).json({ ok: false, error: 'That link cannot be previewed.' })
  }

  const db = serviceClient()
  if (!db) return res.status(503).json({ ok: false, error: 'Previews are not configured here.' })

  // Hex sha256 of the normalised URL - the same input, algorithm and encoding
  // as previewKey in the browser, because the two have to agree on the key or
  // the browser would never find what this route stored.
  const key = createHash('sha256').update(target.url).digest('hex')

  const cached = await db
    .from('link_previews')
    .select('title, description, site_name, ok, fetched_at')
    .eq('url_hash', key)
    .maybeSingle()

  if (cached.error) {
    console.error('link preview: cache read failed:', cached.error.message)
    // Not fatal: fall through and fetch. A broken cache should slow previews
    // down, not stop them.
  }

  if (cached.data && fresh(cached.data)) {
    return res.status(200).json({
      ok: cached.data.ok === true,
      url: target.url,
      title: cached.data.title,
      description: cached.data.description,
      siteName: cached.data.site_name,
    })
  }

  /*
   * The rate limit guards the fetch, not the cached read above.
   *
   * A hit costs one indexed row and should never be refused; the outbound
   * request is the scarce thing. Checking here rather than at the top means a
   * feed full of links that have all been seen before renders without anybody
   * hitting a limit, and a reader pasting twenty new links cannot make twenty
   * requests leave our infrastructure.
   */
  const limited = rateLimit(req, { key: 'link-preview', limit: 15, windowMs: 60_000 })
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again shortly.' })
  }

  const preview = await fetchPreview(target.url)

  /*
   * Written whether or not it worked, and the failure row is the more
   * important of the two.
   *
   * Without it, a URL that times out is re-fetched by our server for every
   * reader who scrolls past the post, forever - which is a slow outbound flood
   * triggered by one post. `ok: false` is what makes "we looked and there was
   * nothing" a fact we remember.
   *
   * A failed write is swallowed. The caller still gets the answer; the cost of
   * not caching it is that we look again.
   */
  const row = {
    url_hash: key,
    url: target.url,
    title: preview.ok ? preview.title : null,
    description: preview.ok ? preview.description : null,
    site_name: preview.ok ? preview.siteName : null,
    ok: preview.ok === true,
    fetched_at: new Date().toISOString(),
  }

  const written = await db.from('link_previews').upsert(row, { onConflict: 'url_hash' })
  if (written.error) console.error('link preview: cache write failed:', written.error.message)

  return res.status(200).json({
    ok: row.ok,
    url: target.url,
    title: row.title,
    description: row.description,
    siteName: row.site_name,
  })
}

/**
 * How long a cached row is trusted for.
 *
 * A success lasts a week: page titles change, and a preview a year old
 * describing a page that now says something else is worse than one request.
 * A failure lasts an hour - long enough that a post full of dead links is not
 * a steady outbound trickle, short enough that a site which was briefly down
 * gets a card once it is back.
 */
const OK_MS = 7 * 24 * 60 * 60 * 1000
const FAILED_MS = 60 * 60 * 1000

function fresh(row) {
  const at = Date.parse(row.fetched_at || '')
  if (!Number.isFinite(at)) return false
  return Date.now() - at < (row.ok ? OK_MS : FAILED_MS)
}
