import { supabase, hasSupabase } from '../config/supabase'
import { LINK_PREVIEW_FIELDS } from '../config/queries'
import { checkPreviewTarget } from '../utils/linkSafety'

/**
 * What a linked page says about itself.
 *
 * Two halves, and the split is the whole design. Reading a cached preview is a
 * plain Supabase query over the anon key, because the row holds what a public
 * page published about itself and belongs to nobody. Filling the cache is an
 * endpoint, because fetching the page is an outbound request to a URL a
 * stranger chose and that must never happen from a browser.
 *
 * Why the server fetches at all: a preview rendered by the reader's browser -
 * or an og:image loaded into an <img> - tells the linked site the IP address
 * of everybody who scrolled past the post. On a site where a post might link
 * to a token's page, that is a list of this app's readers handed to whoever
 * wrote the link. Our server fetches it once and every reader gets our copy.
 *
 * Which is also why there is no image in a preview here. See
 * 0020_posts_worth_making.sql: an og:image is the one field that would undo
 * all of the above.
 */

/**
 * The cache key for a URL: sha256 of the normalised form, hex.
 *
 * Hashed in the browser with SubtleCrypto, and hashed identically on the
 * server - same input, same algorithm, same encoding - because the two have to
 * agree on the key or the browser would never find what the endpoint stored.
 * The normalised form comes from `checkPreviewTarget` rather than from the raw
 * text, so two links differing only by a fragment are one row.
 *
 * @param {string} url the normalised URL
 * @returns {Promise<string|null>}
 */
export async function previewKey(url) {
  if (typeof url !== 'string' || !url) return null

  /*
   * `crypto.subtle` needs a secure context, which localhost and https both
   * are - but a deployment served over plain http would have it undefined, and
   * a missing preview is a better outcome there than a thrown error in the
   * middle of rendering a feed.
   */
  if (!globalThis.crypto?.subtle) return null

  const bytes = new TextEncoder().encode(url)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Flatten a row into what a card draws. */
function toPreview(row, url) {
  return {
    url,
    title: row?.title || null,
    description: row?.description || null,
    siteName: row?.site_name || null,
    /** False means we looked and there was nothing worth showing, which is
     *  different from not having looked - and the caller draws nothing
     *  either way, so this exists to stop it asking again. */
    ok: row?.ok === true,
  }
}

/**
 * The preview for one URL, from the cache, filling it if it is empty.
 *
 * Reads first and asks the endpoint only on a miss, which is the cold path -
 * a link that has been posted before is one indexed row for everybody who sees
 * it afterwards. The obvious shape, always calling the endpoint and letting it
 * answer from its own cache, would be one serverless invocation per link per
 * reader for something the feed's own query could have returned.
 *
 * Returns null for a URL this app will not fetch at all, and null is also what
 * a failed lookup gives - the caller draws no card in either case, and a post
 * with no card under it is the ordinary outcome.
 *
 * @param {unknown} raw a URL out of a post body
 */
export async function fetchLinkPreview(raw) {
  if (!hasSupabase) return null

  // The same gate the endpoint applies, applied here first so a URL that will
  // be refused costs no request at all.
  const target = checkPreviewTarget(raw)
  if (!target.ok) return null

  const key = await previewKey(target.url)
  if (!key) return null

  const cached = await supabase
    .from('link_previews')
    .select(LINK_PREVIEW_FIELDS)
    .eq('url_hash', key)
    .maybeSingle()

  // A failing read is a feed without cards, not a feed that will not load.
  if (cached.error) return null
  if (cached.data) {
    const preview = toPreview(cached.data, target.url)
    return preview.ok ? preview : null
  }

  /*
   * Nothing cached, so ask the endpoint to go and look.
   *
   * Swallowed on failure for the same reason as everything else here: a
   * preview is decoration under a post. There is nothing a reader can do about
   * a link whose page would not load, and nothing worth telling them.
   */
  try {
    const res = await fetch(`/api/links/preview?url=${encodeURIComponent(target.url)}`, {
      credentials: 'same-origin',
    })
    if (!res.ok) return null

    const payload = await res.json()
    const preview = toPreview(
      {
        title: payload.title,
        description: payload.description,
        site_name: payload.siteName,
        ok: payload.ok,
      },
      target.url,
    )
    return preview.ok ? preview : null
  } catch {
    return null
  }
}
