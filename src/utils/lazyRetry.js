/**
 * Loading a route's code, and surviving it not being there.
 *
 * Every tab in this app is a `lazy()` import, which means its code is fetched
 * the first time somebody opens it - not when the page loads. That is a real
 * saving and it has one sharp edge: the file name carries a content hash, and
 * a deployment replaces the whole set. A tab that has been open across a
 * deploy is holding an index.html that names chunks the domain no longer
 * serves, so the next tab the reader opens fetches a 404, the import rejects,
 * and React - with nothing above it to catch the throw - unmounts everything.
 *
 * The symptom is a white screen on a click that worked five minutes ago, with
 * no message and nothing in the UI to recover from it. It is not a crash in
 * the page being opened; that page's code never arrived.
 *
 * So: retry once for an ordinary network blip, and if it fails again treat it
 * as what it almost always is - this tab is running against a build that no
 * longer exists - and reload, which fetches the current index.html and its
 * current chunk names. Once per session, so a chunk that is genuinely missing
 * cannot put the page in a reload loop; after that the error is allowed
 * through to the boundary, which says so in words.
 */

/** Did this fail because the code never arrived, rather than while running? */
export function isChunkLoadError(error) {
  const message = String(error?.message || error || '')
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    // Safari's wording, which shares none of the above.
    /Unable to load|Import.*failed/i.test(message) ||
    /ChunkLoadError/i.test(error?.name || '')
  )
}

/** Key for the one reload we allow ourselves per tab. */
export const RELOAD_KEY = 'pulsedex:chunk-reload'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Import a module, once more if needed, then reload rather than go blank.
 *
 * Everything it touches is injected so this can be tested without a browser:
 * the suite runs it with a fake clock, a plain object for storage and a
 * counter for reload.
 */
export async function loadWithRetry(importer, options = {}) {
  const {
    delay = wait,
    storage = safeSessionStorage(),
    reload = () => window.location.reload(),
    retryMs = 350,
  } = options

  try {
    const module = await importer()
    // Got here, so this build's chunks are being served. Forget any reload we
    // did earlier, or the next deploy this tab lives through gets no recovery.
    storage.removeItem(RELOAD_KEY)
    return module
  } catch (first) {
    if (!isChunkLoadError(first)) throw first

    await delay(retryMs)
    try {
      const module = await importer()
      storage.removeItem(RELOAD_KEY)
      return module
    } catch (second) {
      if (!isChunkLoadError(second)) throw second
      if (storage.getItem(RELOAD_KEY)) throw second

      storage.setItem(RELOAD_KEY, '1')
      reload()
      /*
       * Never settles, deliberately. Resolving would render a tab from a build
       * that is on its way out; rejecting would flash the boundary's error for
       * the moment before the document is replaced. Leaving it pending holds
       * the loading state until the reload takes over.
       */
      return new Promise(() => {})
    }
  }
}

/** sessionStorage, or a stub where it throws - Safari private mode, embedded
 *  webviews, a browser with site data switched off. A missing store costs the
 *  reload guard, not the page. */
function safeSessionStorage() {
  try {
    const probe = '__pulsedex_probe__'
    window.sessionStorage.setItem(probe, '1')
    window.sessionStorage.removeItem(probe)
    return window.sessionStorage
  } catch {
    const map = new Map()
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    }
  }
}
