/**
 * Fetch with a deadline.
 *
 * `fetch` has no timeout. A request to a host that accepts the connection and
 * then says nothing stays pending for as long as the tab is open, and every
 * panel waiting on it stays on its loading state with no error and nothing to
 * retry - the failure mode that looks least like a failure and is hardest to
 * report. Every network call in the app goes through here so that cannot happen
 * anywhere.
 *
 * The timeout is a ceiling on one attempt, not on a whole operation: callers
 * that retry get a fresh deadline each time, which is the behaviour they want.
 */

/** Long enough for a slow public API on a bad connection, short enough to notice. */
export const DEFAULT_TIMEOUT_MS = 12_000

/**
 * @param {string} url
 * @param {RequestInit & { timeout?: number }} [options]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}) {
  const { timeout = DEFAULT_TIMEOUT_MS, signal, ...rest } = options

  /*
   * A caller's own signal still has to work, so the two are combined rather
   * than the caller's being dropped. React Query aborts queries this way when
   * a component unmounts, and losing that would leave requests running for
   * panels that no longer exist.
   */
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeout)

  const onAbort = () => controller.abort(signal.reason)
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    return await fetch(url, { ...rest, signal: controller.signal })
  } catch (err) {
    /*
     * Rethrown with a name and a message the caller can use.
     *
     * Aborting with a reason makes that reason the thrown value, so this
     * surfaces as a DOMException named TimeoutError carrying the bare word
     * "Timeout" - accurate, and useless in an error panel. A caller's own
     * abort is left alone: an unmounted component is not a failure.
     */
    if ((err?.name === 'TimeoutError' || err?.name === 'AbortError') && !signal?.aborted) {
      const timedOut = new Error(`Request timed out after ${Math.round(timeout / 1000)}s`)
      timedOut.name = 'TimeoutError'
      timedOut.url = url
      throw timedOut
    }
    throw err
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Whether a failure was this module giving up rather than the network refusing. */
export function isTimeout(err) {
  return err?.name === 'TimeoutError'
}
