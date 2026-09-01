import { describe, it, expect } from 'vitest'
import { sma, ema, bollinger, rsi, macd } from './indicators'
import { candleSeries } from '../test/fixtures'

/*
 * Indicator maths, checked against values worked out by hand.
 *
 * These draw on top of a price chart, which is the least forgiving place for a
 * quiet arithmetic error: a wrong average still looks like a plausible line,
 * and someone may trade on it. Every expected number below comes from the
 * textbook definition rather than from running the code.
 */

const series = candleSeries

describe('sma', () => {
  it('averages the last n closes', () => {
    const out = sma(series([1, 2, 3, 4, 5]), 3)

    // (1+2+3)/3, (2+3+4)/3, (3+4+5)/3
    expect(out.map((p) => p.value)).toEqual([2, 3, 4])
  })

  it('starts only once it has a full window', () => {
    const out = sma(series([1, 2, 3, 4, 5]), 3)

    // The warm-up is absent rather than zero-filled: a zero would draw the
    // line down to the axis floor.
    expect(out).toHaveLength(3)
    expect(out[0].time).toBe(series([1, 2, 3, 4, 5])[2].time)
  })

  it('returns nothing when there are fewer candles than the period', () => {
    expect(sma(series([1, 2]), 5)).toEqual([])
  })

  it('refuses nonsense input rather than throwing', () => {
    expect(sma(null, 3)).toEqual([])
    expect(sma(series([1, 2, 3]), 0)).toEqual([])
  })
})

describe('ema', () => {
  it('seeds from a simple average of the first window', () => {
    // Seeding from a single close leaves a visible hook at the start of the
    // line that takes dozens of bars to decay.
    const out = ema(series([1, 2, 3, 4, 5, 6]), 3)

    expect(out[0].value).toBe(2) // (1+2+3)/3
  })

  it('weights recent closes more heavily than a simple average', () => {
    const closes = [1, 1, 1, 1, 10]
    const [lastEma] = ema(series(closes), 4).slice(-1)
    const [lastSma] = sma(series(closes), 4).slice(-1)

    expect(lastEma.value).toBeGreaterThan(lastSma.value)
  })

  it('follows the textbook multiplier', () => {
    // period 3 -> k = 2/(3+1) = 0.5. Seed (1+2+3)/3 = 2, next close 4:
    // 4*0.5 + 2*0.5 = 3.
    const out = ema(series([1, 2, 3, 4]), 3)
    expect(out[1].value).toBeCloseTo(3, 10)
  })
})

describe('bollinger', () => {
  it('puts the bands either side of the middle', () => {
    const { upper, middle, lower } = bollinger(series([1, 2, 3, 4, 5, 6, 5, 4, 3, 2]), 5, 2)

    expect(upper.at(-1).value).toBeGreaterThan(middle.at(-1).value)
    expect(lower.at(-1).value).toBeLessThan(middle.at(-1).value)
  })

  it('keeps the three bands on the same timestamps', () => {
    const { upper, middle, lower } = bollinger(series([1, 2, 3, 4, 5, 6, 5, 4, 3, 2]), 5, 2)

    expect(upper.map((p) => p.time)).toEqual(middle.map((p) => p.time))
    expect(lower.map((p) => p.time)).toEqual(middle.map((p) => p.time))
  })

  it('collapses the bands onto the middle when price does not move', () => {
    const { upper, middle, lower } = bollinger(series([3, 3, 3, 3, 3, 3]), 5, 2)

    expect(upper.at(-1).value).toBeCloseTo(middle.at(-1).value, 10)
    expect(lower.at(-1).value).toBeCloseTo(middle.at(-1).value, 10)
  })

  it('widens with the multiplier', () => {
    const closes = [1, 2, 3, 4, 5, 4, 3, 2, 1, 2]
    const narrow = bollinger(series(closes), 5, 1)
    const wide = bollinger(series(closes), 5, 3)

    const spread = (b) => b.upper.at(-1).value - b.lower.at(-1).value
    expect(spread(wide)).toBeGreaterThan(spread(narrow))
  })

  it('returns empty bands rather than throwing on a short history', () => {
    expect(bollinger(series([1, 2]), 20)).toEqual({ upper: [], middle: [], lower: [] })
  })
})

describe('rsi', () => {
  it('reads 100 when every bar rises', () => {
    const out = rsi(series([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), 14)
    expect(out.at(-1).value).toBeCloseTo(100, 6)
  })

  it('reads 0 when every bar falls', () => {
    const closes = Array.from({ length: 16 }, (_, i) => 100 - i)
    expect(rsi(series(closes), 14).at(-1).value).toBeCloseTo(0, 6)
  })

  it('stays inside 0 and 100 on a mixed series', () => {
    const closes = [10, 12, 11, 13, 15, 14, 16, 18, 17, 19, 21, 20, 22, 24, 23, 25, 22, 26]
    for (const point of rsi(series(closes), 14)) {
      expect(point.value).toBeGreaterThanOrEqual(0)
      expect(point.value).toBeLessThanOrEqual(100)
    }
  })

  it('needs a full period before it says anything', () => {
    expect(rsi(series([1, 2, 3]), 14)).toEqual([])
  })
})

describe('macd', () => {
  it('returns the line, its signal and the histogram between them', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 10)
    const out = macd(series(closes))

    expect(out.macd.length).toBeGreaterThan(0)
    expect(out.signal.length).toBeGreaterThan(0)
    expect(out.histogram.length).toBeGreaterThan(0)
  })

  it('keeps the histogram equal to the gap between the two lines', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 10)
    const { macd: line, signal, histogram } = macd(series(closes))

    const bar = histogram.at(-1)
    const lineAt = line.find((p) => p.time === bar.time)
    const signalAt = signal.find((p) => p.time === bar.time)

    expect(bar.value).toBeCloseTo(lineAt.value - signalAt.value, 10)
  })

  it('returns empty series rather than throwing on a short history', () => {
    const out = macd(series([1, 2, 3]))

    expect(out.macd).toEqual([])
    expect(out.signal).toEqual([])
    expect(out.histogram).toEqual([])
  })
})
