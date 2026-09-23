import { socialPath } from './socialPath'

/**
 * A link somebody can send.
 *
 * The whole point of the URLs added over the last three batches: a room, a
 * message and a post can now be pointed at, and until there is a control that
 * hands you the link, only somebody who thinks to read the address bar
 * benefits. On a phone, where most of this is read, the address bar is a
 * sliver and often hidden.
 *
 * Absolute, because a relative path pasted into a chat app is not a link. The
 * origin comes from wherever this is running rather than from configuration,
 * so a preview deployment hands out preview links and production hands out
 * production ones - a constant here would have every preview quietly
 * advertising the live site.
 *
 * @param {object} where the same shape `socialPath` takes
 * @param {string} [origin] for tests; defaults to this page's
 * @returns {string|null} null when there is no origin to build on, which is
 *   the server-rendered case and not an error
 */
export function shareLink(where, origin) {
  const base = typeof origin === 'string' ? origin : readOrigin()
  if (!base) return null

  const path = socialPath(where)

  // A trailing slash on the origin plus a leading one on the path is a double
  // slash, which some chat apps will not linkify.
  return `${base.replace(/\/+$/, '')}${path}`
}

function readOrigin() {
  try {
    return typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : null
  } catch {
    return null
  }
}

/**
 * Put it on the clipboard.
 *
 * Two ways, because the first one is not always there: the async clipboard
 * API needs a secure context and permission, and a share control that fails
 * on http or in an older browser is a share control that fails for exactly
 * the people least able to work around it. The fallback is the old
 * `execCommand` trick, which works without either.
 *
 * Returns whether it worked, rather than throwing. The caller draws "Copied"
 * or leaves the link on screen to be selected by hand, and neither of those
 * is an exception.
 *
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  if (typeof text !== 'string' || !text) return false

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Refused, or no permission. Fall through rather than give up: the older
    // path below often still works.
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    /*
     * Off-screen rather than hidden. `display: none` and `visibility: hidden`
     * both make the selection fail silently, which is the failure mode this
     * whole fallback exists to avoid.
     */
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'

    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return Boolean(ok)
  } catch {
    return false
  }
}
