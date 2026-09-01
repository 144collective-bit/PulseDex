/**
 * OHLCV for a PulseChain pool, fetched server-side.
 *
 * The charts read GeckoTerminal's free API. From the browser that has one
 * failure mode that is worse than an outage: when the limiter kicks in it does
 * not answer 429, it stops sending the `Access-Control-Allow-Origin` header, so
 * the browser rejects the response before any of our code sees it. The result
 * is indistinguishable from being offline, it hits every chart at once, and
 * there is nothing the client can do about it.
 *
 * Fetched from a server there is no CORS involved at all, and - the part that
 * actually fixes the limit rather than hiding it - one upstream request now
 * serves every visitor through the CDN cache instead of every visitor making
 * their own.
 */

const UPSTREAM = 'https://api.geckoterminal.com/api/v2/networks/pulsechain'

/**
 * The intervals the client is allowed to ask for.
 *
 * An allowlist rather than passthrough: `timeframe` and `aggregate` land in an
 * upstream URL, and a handler that forwards whatever it is given is an open
 * proxy for anyone who finds it.
 */
const INTERVALS = {
  '5m': { timeframe: 'minute', aggregate: 5, limit: 288 },
  '15m': { timeframe: 'minute', aggregate: 15, limit: 288 },
  '1h': { timeframe: 'hour', aggregate: 1, limit: 240 },
  '4h': { timeframe: 'hour', aggregate: 4, limit: 240 },
  '1d': { timeframe: 'day', aggregate: 1, limit: 180 },
}

const ADDRESS = /^0x[a-fA-F0-9]{40}$/

/** Give up before the platform does, so a stall returns an error we chose. */
const UPSTREAM_TIMEOUT_MS = 10_000

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const url = new URL(req.url, 'http://localhost')
  const pool = url.searchParams.get('pool')
  const intervalId = url.searchParams.get('interval') || '1h'
  const token = url.searchParams.get('token')

  if (!ADDRESS.test(pool || '')) {
    return res.status(400).json({ error: 'A pool address is required' })
  }
  if (!Object.hasOwn(INTERVALS, intervalId)) {
    return res.status(400).json({ error: 'Unknown interval' })
  }
  if (token && !ADDRESS.test(token)) {
    return res.status(400).json({ error: 'Invalid token address' })
  }

  const { timeframe, aggregate, limit } = INTERVALS[intervalId]
  const target =
    `${UPSTREAM}/pools/${pool}/ohlcv/${timeframe}` +
    `?aggregate=${aggregate}&limit=${limit}${token ? `&token=${token}` : ''}`

  try {
    const upstream = await fetch(target, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })

    if (upstream.status === 429) {
      // Passed through rather than dressed up as a server error, so the client
      // can say "rate limited" and mean it.
      res.setHeader('Cache-Control', 'no-store')
      return res.status(429).json({ error: 'Upstream rate limit' })
    }

    if (!upstream.ok) {
      res.setHeader('Cache-Control', 'no-store')
      return res.status(502).json({ error: `Upstream returned ${upstream.status}` })
    }

    const json = await upstream.json()
    const rows = json?.data?.attributes?.ohlcv_list

    if (!Array.isArray(rows)) {
      res.setHeader('Cache-Control', 'no-store')
      return res.status(502).json({ error: 'Unexpected upstream response' })
    }

    /*
     * Cached at the edge for half a minute, and served stale for five more
     * while it refreshes behind the reader's back.
     *
     * That second part is what makes this resilient rather than merely
     * efficient: when the upstream is rate limiting us, the CDN keeps handing
     * out the last good candles instead of every chart going dark together.
     */
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300')
    return res.status(200).json({ ohlcv: rows })
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    res.setHeader('Cache-Control', 'no-store')
    return res
      .status(timedOut ? 504 : 502)
      .json({ error: timedOut ? 'Upstream timed out' : 'Could not reach the chart provider' })
  }
}
