import { describe, it, expect } from 'vitest'
import { CHART_INTERVALS, DEFAULT_INTERVAL } from './geckoterminal'
import { INTERVALS as PROXY_INTERVALS } from '../../api/candles'

/*
 * The client's interval list and the proxy's allowlist have to agree.
 *
 * They live in different files and neither imports the other. The proxy keeps
 * an allowlist on purpose - `timeframe` and `aggregate` end up in an upstream
 * URL, so forwarding whatever arrives would make it an open proxy - but that
 * means every interval has to be added twice.
 *
 * Adding 1m to the picker and not to the handler produced a timeframe button
 * that returned 400 and a chart that rendered nothing. Nothing failed loudly;
 * the button was simply dead. This is the check that would have caught it.
 */

describe('chart intervals', () => {
  it('are all accepted by the proxy that fetches them', () => {
    const missing = CHART_INTERVALS.filter((i) => !Object.hasOwn(PROXY_INTERVALS, i.id)).map(
      (i) => i.id
    )
    expect(missing, 'offered in the picker but rejected by /api/candles').toEqual([])
  })

  it('describe the same candles on both sides', () => {
    /*
     * The id agreeing is not enough. If the client thinks 1m is minute/1 and
     * the proxy resolves it to hour/1, the chart draws hourly candles under a
     * label saying one minute - a disagreement nobody would see as an error.
     */
    for (const client of CHART_INTERVALS) {
      const proxy = PROXY_INTERVALS[client.id]
      if (!proxy) continue
      expect({ id: client.id, tf: proxy.timeframe, ag: proxy.aggregate }).toEqual({
        id: client.id,
        tf: client.timeframe,
        ag: client.aggregate,
      })
    }
  })

  it('offer nothing the API does not support', () => {
    // Verified against the live endpoint: minute, hour and day are the only
    // timeframes it takes. A seven-day aggregate returns 400, which is why
    // there is no weekly candle here rather than an oversight.
    for (const i of CHART_INTERVALS) {
      expect(['minute', 'hour', 'day'], `${i.id} timeframe`).toContain(i.timeframe)
      expect(i.aggregate, `${i.id} aggregate`).toBeGreaterThan(0)
      expect(i.limit, `${i.id} limit`).toBeGreaterThan(0)
    }
  })

  it('default to one the proxy will serve', () => {
    // A default the handler rejects breaks the chart on first load, before
    // anyone has touched a control.
    expect(Object.hasOwn(PROXY_INTERVALS, DEFAULT_INTERVAL)).toBe(true)
  })

  it('give every interval a distinct id and label', () => {
    const ids = CHART_INTERVALS.map((i) => i.id)
    const labels = CHART_INTERVALS.map((i) => i.label)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
