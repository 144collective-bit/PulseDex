import { useEffect, useState } from 'react'
import { fetchLinkPreview } from '../services/linkPreviews'
import { firstLinkIn } from '../utils/linkSafety'

/**
 * The preview card for a post's first link, if there is one worth drawing.
 *
 * One link per post, and the first one: a post with six links would otherwise
 * be six cards under four lines of text, and the first link is the one the
 * post is about.
 *
 * Returns null for everything that is not a card - no link, a link this app
 * will not fetch, a page that did not answer, a page with no title. The caller
 * draws nothing in all of those cases, which is the ordinary outcome: most
 * posts have no link, and plenty of pages have no metadata.
 *
 * Nothing is reported to the reader when this fails. A preview is decoration
 * under a post, there is nothing they could do about a page that would not
 * load, and an error line where a card would be is worse than no card.
 *
 * @param {string|null|undefined} body the post's text
 */
export function useLinkPreview(body) {
  const [preview, setPreview] = useState(null)

  // Derived rather than held, so the effect depends on the URL and not on the
  // whole post - an edit that does not change the link does not refetch.
  const url = firstLinkIn(body)

  useEffect(() => {
    if (!url) {
      setPreview(null)
      return undefined
    }

    let alive = true
    /*
     * Cleared on the way in. Without this, scrolling a virtualised list - or
     * a post being edited to a different link - would show the previous
     * post's card under the new one until the fetch landed, which is the one
     * failure mode of a preview that actually misleads somebody.
     */
    setPreview(null)

    fetchLinkPreview(url).then((found) => {
      if (alive) setPreview(found)
    })

    return () => {
      alive = false
    }
  }, [url])

  return preview
}
