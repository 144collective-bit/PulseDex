import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
 * Candles, and the difference between "this pool is quiet" and "we did not
 * understand the answer".
 *
 * Returning an empty array for both meant a provider hiccup surfaced as "no
 * price history for this pool" - a confident claim about the market, made from
 * a response we had not parsed, with no retry offered because nothing looked
 * wrong. An empty list is still an empty list; a missing one is an error.
 */

vi.mock('../utils/http', () => ({
  fetchWithTimeout: vi.fn(),
  isTimeout: (e) => e?.name === 'TimeoutError',
}))

const { fetchWithTimeout } = await import('../utils/http')
const { getPoolCandles, CHART_INTERVALS, DEFAULT_INTERVAL } = await import('./geckoterminal')

/** Unique per test: the module caches by URL, and a hit would skip the fetch. */
let poolCounter = 0
const nextPool = () => `0x${String(poolCounter++).padStart(40, '0')}`

const proxyOk = (rows) => ({ ok: true, status: 200, json: async () => ({ ohlcv: rows }) })
const proxyStatus = (status) => ({ ok: false, status, json: async () => ({}) })

/** [timestamp, open, high, low, close, volume], newest first, as the API sends. */
function rows(count, startTs = 1_780_000_000) {
  return Array.from({ length: count }, (_, i) => [startTs - i * 3600, 1, 2, 0.5, 1.5, 100])
}

beforeEach(() => {
  fetchWithTimeout.mockReset()
})

describe('getPoolCandles', () => {
  it('returns candles oldest first, whatever order the API sent', async () => {
    fetchWithTimeout.mockResolvedValue(proxyOk(rows(10)))

    const candles = await getPoolCandles(nextPool(), '1h')

    expect(candles.length).toBeGreaterThan(0)
    for (let i = 1; i < candles.length; i += 1) {
      expect(candles[i].time).toBeGreaterThan(candles[i - 1].time)
    }
  })

  it('maps a tuple onto the fields the chart library expects', async () => {
    fetchWithTimeout.mockResolvedValue(proxyOk([[1_780_000_000, 1, 2, 0.5, 1.5, 100], ...rows(9, 1_779_990_000)]))

    const [candle] = await getPoolCandles(nextPool(), '1h')

    expect(candle).toMatchObject({
      open: expect.any(Number),
      high: expect.any(Number),
      low: expect.any(Number),
      close: expect.any(Number),
      volume: expect.any(Number),
    })
  })

  it('throws rather than claiming a pool has no history when the answer is unreadable', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: true, status: 200, json: async () => ({ nonsense: true }) })

    await expect(getPoolCandles(nextPool(), '1h')).rejects.toThrow(/unavailable|unexpected/i)
  })

  it('reports a rate limit as a rate limit', async () => {
    fetchWithTimeout.mockResolvedValue(proxyStatus(429))

    await expect(getPoolCandles(nextPool(), '1h')).rejects.toThrow(/rate limited/i)
  })

  it('does not go direct after a rate limit, which would spend the limit faster', async () => {
    fetchWithTimeout.mockResolvedValue(proxyStatus(429))

    await getPoolCandles(nextPool(), '1h').catch(() => {})

    expect(fetchWithTimeout).toHaveBeenCalledOnce()
  })

  it('falls back to the provider when the proxy is not deployed', async () => {
    // 404 means this deployment has no function, not that the data is missing.
    fetchWithTimeout.mockResolvedValueOnce(proxyStatus(404)).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { attributes: { ohlcv_list: rows(10) } } }),
    })

    const candles = await getPoolCandles(nextPool(), '1h')

    expect(candles.length).toBeGreaterThan(0)
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2)
    expect(fetchWithTimeout.mock.calls[0][0]).toContain('/api/candles')
    expect(fetchWithTimeout.mock.calls[1][0]).toContain('geckoterminal.com')
  })

  it('asks the proxy first, not the provider', async () => {
    fetchWithTimeout.mockResolvedValue(proxyOk(rows(10)))

    await getPoolCandles(nextPool(), '1h')

    expect(fetchWithTimeout.mock.calls[0][0]).toContain('/api/candles')
  })

  it('names the token so the series is priced from the right side of the pool', async () => {
    // PLS is pinned to a DAI/WPLS pool where DAI is the base token; without
    // this the default series is DAI at about $1.00, drawn under a PLS label.
    fetchWithTimeout.mockResolvedValue(proxyOk(rows(10)))

    await getPoolCandles(nextPool(), '1h', { tokenAddress: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27' })

    expect(fetchWithTimeout.mock.calls[0][0]).toContain('token=0xA1077a294dDE1B09bB078844df40758a5D0f9a27')
  })

  it('returns nothing for no pool, without asking anyone', async () => {
    expect(await getPoolCandles(null, '1h')).toEqual([])
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('falls back to the default interval when given an unknown one', async () => {
    fetchWithTimeout.mockResolvedValue(proxyOk(rows(10)))

    await getPoolCandles(nextPool(), 'not-an-interval')

    expect(fetchWithTimeout.mock.calls[0][0]).toContain(`interval=${DEFAULT_INTERVAL}`)
  })

  it('offers intervals that all carry the fields the request needs', () => {
    for (const interval of CHART_INTERVALS) {
      expect(interval.id).toBeTruthy()
      expect(interval.timeframe).toBeTruthy()
      expect(interval.aggregate).toBeGreaterThan(0)
      expect(interval.limit).toBeGreaterThan(0)
    }
  })
})
