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

import { fetchWithTimeout, isTimeout } from '../utils/http'

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
 * The raw OHLCV tuples, from our proxy or - failing that - from the source.
 *
 * The fallback is deliberately narrow. It runs when the proxy itself is
 * unreachable or answers 5xx, which means "this deployment cannot serve
 * candles"; it does not run on a 429, because the upstream refusing our server
 * will refuse the browser too, and asking twice only spends the limit faster.
 */
async function readCandleRows(proxyUrl, directUrl) {
  try {
    const res = await fetchWithTimeout(proxyUrl)

    if (res.ok) {
      const json = await res.json()
      if (Array.isArray(json?.ohlcv)) return json.ohlcv
      throw new Error('Chart data unavailable (unexpected response)')
    }

    if (res.status === 429) {
      throw new Error('Chart data is rate limited right now. Try again in a moment.')
    }
    if (res.status === 400) {
      throw new Error('Chart data unavailable (bad request)')
    }
    // 404 (no such function), 502, 504: the proxy cannot help. Fall through.
  } catch (err) {
    // A message we already composed is a real answer, not a reason to retry.
    if (err?.message?.startsWith('Chart data')) throw err
    if (isTimeout(err)) throw new Error('Chart data took too long to answer. Try again.')
  }

  return readDirect(directUrl)
}

/** The original path: straight to the provider, CORS and all. */
async function readDirect(url) {
  let res
  try {
    res = await fetchWithTimeout(url)
  } catch (err) {
    if (isTimeout(err)) throw new Error('Chart data took too long to answer. Try again.')

    /*
     * A rejected connection rather than a status.
     *
     * The limiter does not answer with 429 - it stops sending the
     * `Access-Control-Allow-Origin` header, so the browser rejects the
     * response before any code reaches us. This is the failure the proxy above
     * exists to avoid, and reaching it means the proxy was unavailable too.
     */
    throw new Error('Chart data is rate limited right now. Try again in a moment.')
  }

  if (res.status === 429) {
    throw new Error('Chart data is rate limited right now. Try again in a moment.')
  }
  if (!res.ok) throw new Error(`Chart data unavailable (${res.status})`)

  const json = await res.json()
  return json?.data?.attributes?.ohlcv_list
}

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

  /*
   * Asked for through our own origin.
   *
   * `/api/candles` fetches the same data server-side, where there is no CORS
   * to lose and where one response is cached at the edge for every visitor
   * rather than each of them spending a request from the shared free-tier
   * budget. Going direct is kept as a fallback below, so a deployment without
   * the function - or a broken one - degrades to how this worked before rather
   * than taking every chart down.
   */
  const proxyUrl = `/api/candles?pool=${poolAddress}&interval=${interval.id}${token}`
  const directUrl =
    `${BASE}/pools/${poolAddress}/ohlcv/${interval.timeframe}` +
    `?aggregate=${interval.aggregate}&limit=${interval.limit}${token}`

  const cached = cache.get(proxyUrl)
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.candles

  const rows = await readCandleRows(proxyUrl, directUrl)

  /*
   * A response we cannot read is a failure, not an empty pool.
   *
   * Returning [] for both meant a provider hiccup surfaced as "no price history
   * for this pool" - a confident claim about the market, made from an answer we
   * had not understood, and with no retry offered because nothing had gone
   * wrong as far as the caller could tell. An empty list is still an empty
   * list; a missing one is now an error.
   */
  if (!Array.isArray(rows)) {
    throw new Error('Chart data unavailable (unexpected response)')
  }

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

  cache.set(proxyUrl, { at: Date.now(), candles })
  // Bounded so a long session cannot grow it without limit.
  if (cache.size > 60) cache.delete(cache.keys().next().value)

  return candles
}
