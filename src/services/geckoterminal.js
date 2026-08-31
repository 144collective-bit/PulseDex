/**
 * OHLCV for PulseChain pools.
 *
 * Exists because the DexScreener embed cannot be relied on. Its URL renders a
 * full chart in a top-level tab but hangs on "Loading pair…" inside a
 * cross-origin iframe, whatever permissions the frame is given - the chart
 * needs storage the browser partitions away from third-party frames. Nothing
 * on our side fixes that, so the chart is drawn from data instead of borrowed
 * from an iframe.
 *
 * GeckoTerminal's public API needs no key and covers PulseChain pools by pool
 * address, which is exactly the identifier the screener already carries.
 */

const BASE = 'https://api.geckoterminal.com/api/v2/networks/pulsechain'

/**
 * Short-lived cache, shared across component remounts.
 *
 * The chart remounts on every pair change, and the free tier rate-limits a
 * burst - clicking through pools quickly returned a network failure rather
 * than a 429. Serving a recent response for a pool already viewed keeps that
 * within the limit.
 */
const cache = new Map()
const CACHE_TTL = 30_000

/** Chart intervals, mapped to the timeframe and aggregate the API expects. */
export const CHART_INTERVALS = [
  { id: '5m', label: '5M', timeframe: 'minute', aggregate: 5, limit: 288 },
  { id: '15m', label: '15M', timeframe: 'minute', aggregate: 15, limit: 288 },
  { id: '1h', label: '1H', timeframe: 'hour', aggregate: 1, limit: 240 },
  { id: '4h', label: '4H', timeframe: 'hour', aggregate: 4, limit: 240 },
  { id: '1d', label: '1D', timeframe: 'day', aggregate: 1, limit: 180 },
]

export const DEFAULT_INTERVAL = '1h'

/**
 * Candles for one pool, oldest first.
 *
 * The API returns newest first as `[timestamp, open, high, low, close, volume]`
 * tuples; the chart library rejects unsorted or duplicated timestamps, so the
 * order is reversed and duplicates dropped here rather than at the call site.
 */
export async function getPoolCandles(poolAddress, intervalId = DEFAULT_INTERVAL, options = {}) {
  if (!poolAddress) return []

  const interval =
    CHART_INTERVALS.find((i) => i.id === intervalId) ||
    CHART_INTERVALS.find((i) => i.id === DEFAULT_INTERVAL)

  /*
   * Which side of the pool to price, when the caller cares.
   *
   * The series is quoted in the pool's own orientation, which is not always
   * the one wanted: PLS is pinned to the DAI/WPLS pool, where DAI is the base
   * token, so the default series is DAI at about $1.00 and would have drawn a
   * flat line labelled PLS. Naming the token leaves no room for that - the API
   * accepts a contract address here and works out the side itself.
   */
  const token = options.tokenAddress ? `&token=${options.tokenAddress}` : ''

  const url =
    `${BASE}/pools/${poolAddress}/ohlcv/${interval.timeframe}` +
    `?aggregate=${interval.aggregate}&limit=${interval.limit}${token}`

  const cached = cache.get(url)
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.candles

  let res
  try {
    res = await fetch(url)
  } catch {
    // A rejected connection rather than a status: the rate limiter refuses the
    // request outright, so there is no code to report.
    throw new Error('Chart data is rate limited right now. Try again in a moment.')
  }

  if (res.status === 429) {
    throw new Error('Chart data is rate limited right now. Try again in a moment.')
  }
  if (!res.ok) throw new Error(`Chart data unavailable (${res.status})`)

  const json = await res.json()
  const rows = json?.data?.attributes?.ohlcv_list
  if (!Array.isArray(rows)) return []

  const seen = new Set()
  const candles = []

  // Reverse rather than sort: the API is already ordered, and a sort would
  // hide a malformed response instead of letting the filters below drop it.
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const [time, open, high, low, close, volume] = rows[i] || []
    const t = Number(time)
    if (!t || seen.has(t)) continue

    const c = {
      time: t,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume) || 0,
    }
    // A zero or non-finite price draws as a spike to the axis floor.
    if (![c.open, c.high, c.low, c.close].every((v) => isFinite(v) && v > 0)) continue

    seen.add(t)
    candles.push(c)
  }

  cache.set(url, { at: Date.now(), candles })
  // Bounded so a long session cannot grow it without limit.
  if (cache.size > 60) cache.delete(cache.keys().next().value)

  return candles
}
