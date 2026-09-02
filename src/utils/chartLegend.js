import { formatCryptoPrice, formatUsd } from './formatters'

/**
 * The OHLC readout a chart shows under the crosshair.
 *
 * Every serious chart has one - open, high, low, close and volume for whatever
 * candle the pointer is over - and this one had none. Without it the chart can
 * be looked at but not read: there is no way to get the actual numbers out of a
 * candle short of guessing against the price axis.
 *
 * Pure, and separate from the chart, because the suite runs in node and cannot
 * mount a component. The arithmetic here decides what a reader believes a
 * candle did, so it is worth being able to check.
 */

/** Which way a candle closed, for colouring. */
export const DIRECTION = { up: 'up', down: 'down', flat: 'flat' }

export function candleDirection(candle) {
  if (!candle) return DIRECTION.flat
  const open = Number(candle.open)
  const close = Number(candle.close)
  if (!Number.isFinite(open) || !Number.isFinite(close)) return DIRECTION.flat
  if (close > open) return DIRECTION.up
  if (close < open) return DIRECTION.down
  return DIRECTION.flat
}

/**
 * The candle's own move, open to close, as a percentage.
 *
 * Measured within the candle rather than against the previous close. Both are
 * defensible, but this is the one the body on screen actually draws - a reader
 * comparing the number to the candle should find they agree.
 */
export function candleChangePct(candle) {
  if (!candle) return null
  const open = Number(candle.open)
  const close = Number(candle.close)
  if (!Number.isFinite(open) || !Number.isFinite(close) || open === 0) return null
  return ((close - open) / open) * 100
}

/**
 * Volume, which arrives from the feed in dollars.
 *
 * Reported compactly: the digits of a pool's five-minute turnover are noise,
 * the magnitude is the signal.
 */
export function formatVolume(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return formatUsd(n, n >= 1000 ? 1 : 2)
}

/**
 * Everything the readout shows for one candle.
 *
 * Returns null when there is no candle to describe, so the caller renders
 * nothing rather than a row of dashes.
 */
export function legendForCandle(candle) {
  if (!candle) return null

  /*
   * A candle missing any of its four prices is not a candle, and showing
   * nothing beats a legend with holes in it that still reads as real.
   *
   * Emptiness is checked before the conversion, because Number(null) and
   * Number('') are both 0 - finite, and so accepted by the test below. A
   * missing low would have been reported as $0.00, which on a chart reads as a
   * crash to zero rather than as absent data.
   */
  const raw = [candle.open, candle.high, candle.low, candle.close]
  if (raw.some((v) => v === null || v === undefined || v === '')) return null

  const [open, high, low, close] = raw.map(Number)
  if (![open, high, low, close].every(Number.isFinite)) return null

  const changePct = candleChangePct(candle)

  return {
    time: candle.time ?? null,
    open: formatCryptoPrice(open),
    high: formatCryptoPrice(high),
    low: formatCryptoPrice(low),
    close: formatCryptoPrice(close),
    volume: formatVolume(candle.volume),
    changePct,
    changeLabel: changePct === null ? null : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`,
    direction: candleDirection(candle),
  }
}

/**
 * The candle the readout should describe.
 *
 * Whatever the pointer is over, and the most recent candle when it is over
 * nothing. A legend that empties when the mouse leaves the chart makes the
 * numbers feel like a tooltip rather than part of the chart, and the last
 * candle is the one a reader wants by default anyway.
 */
export function activeCandle(candles, hoveredTime) {
  if (!Array.isArray(candles) || candles.length === 0) return null
  if (hoveredTime == null) return candles[candles.length - 1]

  // Times come back from the chart library as the series' own time values, so
  // an exact match is the normal case rather than a search.
  const hit = candles.find((c) => c.time === hoveredTime)
  return hit || candles[candles.length - 1]
}
