import { describe, it, expect } from 'vitest'
import { parseUnits } from 'viem'
import {
  priceFromSwap,
  bucketSwaps,
  mergeCandleSeries,
  lookbackBlocks,
  BLOCK_SECONDS,
} from './onchainCandles'

/*
 * Candles built from a pool's own Swap events.
 *
 * The chart is currently drawn from an aggregator, which is a copy of this. The
 * arithmetic below decides what a candle claims a price was, so it is checked
 * without a network - the fetching is the easy half.
 *
 * The failures worth guarding are the quiet ones: a price computed the wrong
 * way up looks entirely plausible and is the reciprocal of the truth, and a
 * bucket carried forward states trading that did not happen.
 */

const swapLog = ({ in0 = 0n, in1 = 0n, out0 = 0n, out1 = 0n } = {}) => ({
  args: { amount0In: in0, amount1In: in1, amount0Out: out0, amount1Out: out1 },
})

describe('priceFromSwap', () => {
  it('prices a sale of token0 into the pool', () => {
    // 100 token0 in, 250 token1 out -> 2.5 token1 per token0.
    const out = priceFromSwap(
      swapLog({ in0: parseUnits('100', 18), out1: parseUnits('250', 18) }),
      18,
      18
    )
    expect(out.price).toBeCloseTo(2.5, 9)
    expect(out.isSell).toBe(true)
  })

  it('prices a purchase of token0 the same way', () => {
    // Direction must not change the price, only which side was bought.
    const out = priceFromSwap(
      swapLog({ in1: parseUnits('250', 18), out0: parseUnits('100', 18) }),
      18,
      18
    )
    expect(out.price).toBeCloseTo(2.5, 9)
    expect(out.isSell).toBe(false)
  })

  it('respects each token having its own decimals', () => {
    /*
     * The failure this prevents is enormous rather than subtle: pricing a
     * 6-decimal stablecoin as though it had 18 is out by a factor of a million,
     * and the candle would leave the axis entirely.
     */
    const out = priceFromSwap(
      swapLog({ in0: parseUnits('1', 18), out1: parseUnits('2', 6) }),
      18,
      6
    )
    expect(out.price).toBeCloseTo(2, 9)
  })

  it('refuses a swap with nothing on one side', () => {
    // Division by zero, or a price of infinity - either erases the price axis.
    expect(priceFromSwap(swapLog({ in0: parseUnits('1', 18) }), 18, 18)).toBeNull()
    expect(priceFromSwap(swapLog({ out1: parseUnits('1', 18) }), 18, 18)).toBeNull()
    expect(priceFromSwap(swapLog(), 18, 18)).toBeNull()
  })

  it('refuses a malformed log rather than throwing into the chart', () => {
    expect(priceFromSwap(null, 18, 18)).toBeNull()
    expect(priceFromSwap({}, 18, 18)).toBeNull()
  })
})

describe('bucketSwaps', () => {
  const at = (time, price, volume = 1) => ({ time, price, volume })

  it('takes open from the first trade and close from the last', () => {
    const [candle] = bucketSwaps([at(10, 5), at(20, 7), at(30, 6)], 60)
    expect(candle).toMatchObject({ time: 0, open: 5, high: 7, low: 5, close: 6, trades: 3 })
  })

  it('orders by time before reading open and close, not by arrival', () => {
    // Logs come back grouped by block, and a caller may concatenate ranges.
    // Trusting arrival order silently swaps a candle's open and close.
    const [candle] = bucketSwaps([at(30, 6), at(10, 5), at(20, 7)], 60)
    expect(candle.open).toBe(5)
    expect(candle.close).toBe(6)
  })

  it('aligns buckets to the interval, so they match another source', () => {
    // What lets these be merged with a history fetched elsewhere.
    const [candle] = bucketSwaps([at(3_661, 1)], 60)
    expect(candle.time).toBe(3_660)
    expect(candle.time % 60).toBe(0)
  })

  it('sums volume across a bucket', () => {
    const [candle] = bucketSwaps([at(1, 5, 100), at(2, 5, 250)], 60)
    expect(candle.volume).toBe(350)
  })

  it('leaves a quiet stretch empty rather than carrying a candle forward', () => {
    /*
     * On this chain a pool can go untouched for an hour. Filling that with
     * repeated flat candles states trading that did not happen; a gap is what
     * actually occurred.
     */
    const candles = bucketSwaps([at(0, 5), at(600, 6)], 60)
    expect(candles).toHaveLength(2)
    expect(candles.map((c) => c.time)).toEqual([0, 600])
  })

  it('returns candles in time order', () => {
    const candles = bucketSwaps([at(600, 6), at(0, 5), at(300, 7)], 60)
    expect(candles.map((c) => c.time)).toEqual([0, 300, 600])
  })

  it('drops trades it cannot price', () => {
    const candles = bucketSwaps(
      [at(1, 0), at(2, -5), at(3, Number.NaN), { time: 4 }, at(5, 9)],
      60
    )
    expect(candles).toHaveLength(1)
    expect(candles[0].trades).toBe(1)
  })

  it('survives nonsense arguments', () => {
    expect(bucketSwaps(null, 60)).toEqual([])
    expect(bucketSwaps([at(1, 1)], 0)).toEqual([])
    expect(bucketSwaps([at(1, 1)], -60)).toEqual([])
  })
})

describe('mergeCandleSeries', () => {
  const c = (time, close) => ({ time, open: close, high: close, low: close, close, volume: 1 })

  it('replaces the overlap with the on-chain version', () => {
    /*
     * The aggregator's most recent candle is usually still forming and minutes
     * stale. Appending rather than overlapping would draw the same minute
     * twice, at two different prices.
     */
    const merged = mergeCandleSeries([c(0, 1), c(60, 2), c(120, 3)], [c(60, 99), c(120, 98)])
    expect(merged.map((x) => [x.time, x.close])).toEqual([
      [0, 1],
      [60, 99],
      [120, 98],
    ])
  })

  it('returns the history untouched when there is nothing live', () => {
    // What makes this safe to switch on: the worst case is the existing chart.
    const history = [c(0, 1), c(60, 2)]
    expect(mergeCandleSeries(history, [])).toEqual(history)
    expect(mergeCandleSeries(history, null)).toEqual(history)
  })

  it('keeps live candles when there is no history at all', () => {
    // A pair too new to have been indexed - which is most of the Trenches board.
    const live = [c(60, 5)]
    expect(mergeCandleSeries([], live)).toEqual(live)
    expect(mergeCandleSeries(null, live)).toEqual(live)
  })

  it('never emits the same timestamp twice', () => {
    const merged = mergeCandleSeries([c(0, 1), c(60, 2)], [c(60, 9), c(120, 10)])
    const times = merged.map((x) => x.time)
    expect(new Set(times).size).toBe(times.length)
  })

  it('comes back in time order whatever it was given', () => {
    const merged = mergeCandleSeries([c(120, 3), c(0, 1)], [c(180, 4)])
    expect(merged.map((x) => x.time)).toEqual([0, 120, 180])
  })
})

describe('lookbackBlocks', () => {
  it('converts a stretch of time into a block count', () => {
    expect(lookbackBlocks(3600)).toBe(3600 / BLOCK_SECONDS)
  })

  it('caps the range, because a wide getLogs is refused or slow', () => {
    // Refusal is the good case; the bad one is a node that accepts and stalls.
    expect(lookbackBlocks(10 ** 9)).toBe(5000)
    expect(lookbackBlocks(10 ** 9, { max: 100 })).toBe(100)
  })

  it('asks for nothing when given nothing', () => {
    expect(lookbackBlocks(0)).toBe(0)
    expect(lookbackBlocks(-5)).toBe(0)
  })
})
