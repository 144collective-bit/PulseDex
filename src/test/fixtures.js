/**
 * Shared test fixtures.
 *
 * Not run as tests - the suite only collects `*.test.js`, and nothing in the
 * app imports this, so it never reaches a bundle.
 *
 * These exist because the same three fakes were being rewritten in every file
 * that needed them, each slightly differently. A response builder that returns
 * a `text()` in one file and not in another is how a test starts passing for
 * the wrong reason.
 */

/**
 * A `fetch` Response, near enough for code that reads status and JSON.
 *
 * @param {unknown} body
 * @param {number} [status]
 */
export function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  }
}

/**
 * A failed Response.
 *
 * Carries the same surface as the success case: callers read `text()` on a
 * failure to build an error message, and a fake without it throws a
 * TypeError that looks nothing like the failure being tested.
 */
export function errorResponse(status, body = '') {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: async () => ({}),
    text: async () => body,
    headers: { get: () => null },
  }
}

/**
 * A fetch that accepts the connection and then says nothing.
 *
 * The failure that has no status and no error - the one a deadline exists to
 * turn into something reportable. Rejects only when its signal aborts.
 */
export function hangingFetch() {
  return (_url, options) =>
    new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal.reason))
    })
}

/**
 * A localStorage that behaves like the real one, including refusing writes.
 *
 * @param {{ full?: boolean }} [options] `full` throws on write, as a browser
 *   does at quota and in some private modes.
 */
export function memoryStorage({ full = false } = {}) {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (full) throw new Error('QuotaExceededError')
      map.set(k, String(v))
    },
    removeItem: (k) => map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

/**
 * Enough `window` for a module that inspects the page while it loads.
 *
 * The event methods matter: wagmi's EIP-6963 discovery listens for wallets
 * announcing themselves, and without them importing the config throws.
 *
 * @param {{ ethereum?: unknown, origin?: string }} [options]
 */
export function browserWindow({ ethereum, origin = 'https://www.pulsedex.net' } = {}) {
  return {
    ethereum,
    location: { origin, href: `${origin}/` },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    innerWidth: 1280,
  }
}

/**
 * Candles from a list of closes, one per hour, oldest first.
 *
 * Every indicator takes this shape, and each of them cares only about `close`
 * and `time`, so the rest is filled in consistently rather than per test.
 *
 * @param {number[]} closes
 * @param {number} [startTime]
 */
export function candleSeries(closes, startTime = 1_780_000_000) {
  return closes.map((close, i) => ({
    time: startTime + i * 3600,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
  }))
}

/**
 * OHLCV tuples as the upstream sends them: newest first.
 *
 * `[timestamp, open, high, low, close, volume]` - the order the chart service
 * has to reverse, which is a thing worth being able to build wrongly on
 * purpose.
 */
export function ohlcvTuples(count, startTs = 1_780_000_000) {
  return Array.from({ length: count }, (_, i) => [startTs - i * 3600, 1, 2, 0.5, 1.5, 100])
}
