import { describe, it, expect } from 'vitest'
import {
  legendForCandle,
  candleDirection,
  candleChangePct,
  formatVolume,
  activeCandle,
  DIRECTION,
} from './chartLegend'

/*
 * The OHLC readout.
 *
 * The chart had none, which meant it could be looked at but not read - no way
 * to get the numbers out of a candle except by guessing against the price axis.
 * What is checked here is the arithmetic behind what a reader ends up
 * believing a candle did.
 */

const candle = (over = {}) => ({
  time: 1_700_000_000,
  open: 100,
  high: 120,
  low: 90,
  close: 110,
  volume: 5000,
  ...over,
})

describe('candleDirection', () => {
  it('reads a close above the open as up', () => {
    expect(candleDirection(candle({ open: 1, close: 2 }))).toBe(DIRECTION.up)
  })

  it('reads a close below the open as down', () => {
    expect(candleDirection(candle({ open: 2, close: 1 }))).toBe(DIRECTION.down)
  })

  it('reads an unchanged candle as flat rather than up', () => {
    // A doji coloured green would say something the candle does not.
    expect(candleDirection(candle({ open: 1, close: 1 }))).toBe(DIRECTION.flat)
  })

  it('is flat when there is nothing to read', () => {
    expect(candleDirection(null)).toBe(DIRECTION.flat)
    expect(candleDirection(candle({ close: undefined }))).toBe(DIRECTION.flat)
  })
})

describe('candleChangePct', () => {
  it('measures the candle open to close, which is what its body draws', () => {
    /*
     * Against the previous close would also be defensible, but this is the move
     * the body on screen actually shows - a reader comparing the number to the
     * candle should find they agree.
     */
    expect(candleChangePct(candle({ open: 100, close: 110 }))).toBeCloseTo(10, 6)
    expect(candleChangePct(candle({ open: 100, close: 90 }))).toBeCloseTo(-10, 6)
  })

  it('survives the very small prices this chain is full of', () => {
    expect(candleChangePct(candle({ open: 8.5e-6, close: 8.6e-6 }))).toBeCloseTo(1.1765, 3)
  })

  it('has no answer when the open is zero, rather than dividing by it', () => {
    expect(candleChangePct(candle({ open: 0, close: 5 }))).toBeNull()
  })

  it('has no answer for a malformed candle', () => {
    expect(candleChangePct(null)).toBeNull()
    expect(candleChangePct(candle({ close: 'abc' }))).toBeNull()
  })
})

describe('formatVolume', () => {
  it('reports magnitude rather than digits', () => {
    expect(formatVolume(1_250_000)).toMatch(/1\.2M|1\.3M/)
  })

  it('says nothing for a candle that traded nothing', () => {
    // A dash reads as missing data; absent reads as no trades, which is true.
    expect(formatVolume(0)).toBeNull()
    expect(formatVolume(null)).toBeNull()
    expect(formatVolume('abc')).toBeNull()
  })
})

describe('legendForCandle', () => {
  it('describes a whole candle', () => {
    const out = legendForCandle(candle())
    expect(out.open).toContain('100')
    expect(out.high).toContain('120')
    expect(out.low).toContain('90')
    expect(out.close).toContain('110')
    expect(out.changeLabel).toBe('+10.00%')
    expect(out.direction).toBe(DIRECTION.up)
  })

  it('signs a fall', () => {
    expect(legendForCandle(candle({ open: 100, close: 95 })).changeLabel).toBe('-5.00%')
  })

  it('refuses a candle missing one of its prices', () => {
    /*
     * A legend with holes in it still reads as real. Showing nothing is the
     * honest response to a candle that is not one.
     */
    expect(legendForCandle(candle({ high: undefined }))).toBeNull()
    expect(legendForCandle(candle({ low: null }))).toBeNull()
    expect(legendForCandle(null)).toBeNull()
  })

  it('keeps a candle that merely traded nothing', () => {
    // No volume is a fact about the candle, not a fault in it.
    const out = legendForCandle(candle({ volume: 0 }))
    expect(out).not.toBeNull()
    expect(out.volume).toBeNull()
  })

  it('formats the tiny prices this chain trades at', () => {
    const out = legendForCandle(candle({ open: 8.52e-6, high: 8.6e-6, low: 8.5e-6, close: 8.55e-6 }))
    expect(out.open).toMatch(/^\$0\.0/)
    expect(out.changeLabel).toBe('+0.35%')
  })
})

describe('activeCandle', () => {
  const series = [candle({ time: 1, close: 1 }), candle({ time: 2, close: 2 }), candle({ time: 3, close: 3 })]

  it('picks the candle under the pointer', () => {
    expect(activeCandle(series, 2).close).toBe(2)
  })

  it('falls back to the most recent when the pointer is off the chart', () => {
    /*
     * A readout that empties when the mouse leaves makes the numbers feel like
     * a tooltip rather than part of the chart, and the last candle is the one
     * wanted by default anyway.
     */
    expect(activeCandle(series, null).close).toBe(3)
    expect(activeCandle(series, undefined).close).toBe(3)
  })

  it('falls back rather than blanking on a time that is not in the series', () => {
    expect(activeCandle(series, 999).close).toBe(3)
  })

  it('has nothing to show for an empty series', () => {
    expect(activeCandle([], 1)).toBeNull()
    expect(activeCandle(null, 1)).toBeNull()
  })
})
