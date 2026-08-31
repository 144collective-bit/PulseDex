/**
 * Technical indicators, computed from candles the chart already has.
 *
 * All of these are derived from the same OHLCV series the chart is drawn from,
 * so switching them on costs no extra requests - which matters here, because
 * the upstream API rate-limits by address and answers a limit by dropping its
 * CORS header rather than returning a status.
 *
 * Every function takes candles oldest-first and returns points the chart
 * library can take directly: `{ time, value }`, with the warm-up period simply
 * absent rather than filled with nulls or zeros. A zero would draw a line to
 * the axis floor, which is worse than no line at all.
 */

/** Simple moving average. */
export function sma(candles, period) {
  if (!Array.isArray(candles) || candles.length < period || period < 1) return []

  const out = []
  let sum = 0

  for (let i = 0; i < candles.length; i += 1) {
    sum += candles[i].close
    if (i >= period) sum -= candles[i - period].close
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period })
  }

  return out
}

/**
 * Exponential moving average.
 *
 * Seeded with a simple average of the first `period` closes rather than the
 * first close alone: seeding from one value leaves a visible hook at the start
 * of the line that takes dozens of bars to decay.
 */
export function ema(candles, period) {
  if (!Array.isArray(candles) || candles.length < period || period < 1) return []

  const k = 2 / (period + 1)
  const out = []

  let seed = 0
  for (let i = 0; i < period; i += 1) seed += candles[i].close
  let prev = seed / period

  out.push({ time: candles[period - 1].time, value: prev })

  for (let i = period; i < candles.length; i += 1) {
    prev = candles[i].close * k + prev * (1 - k)
    out.push({ time: candles[i].time, value: prev })
  }

  return out
}

/**
 * Bollinger bands: a moving average with a standard-deviation envelope.
 *
 * Population deviation, not sample - the period is the whole population being
 * described, which is the convention every charting package uses here.
 */
export function bollinger(candles, period = 20, multiplier = 2) {
  if (!Array.isArray(candles) || candles.length < period) {
    return { upper: [], middle: [], lower: [] }
  }

  const upper = []
  const middle = []
  const lower = []

  for (let i = period - 1; i < candles.length; i += 1) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j += 1) sum += candles[j].close
    const mean = sum / period

    let variance = 0
    for (let j = i - period + 1; j <= i; j += 1) {
      const d = candles[j].close - mean
      variance += d * d
    }
    const sd = Math.sqrt(variance / period)

    const { time } = candles[i]
    middle.push({ time, value: mean })
    upper.push({ time, value: mean + sd * multiplier })
    lower.push({ time, value: mean - sd * multiplier })
  }

  return { upper, middle, lower }
}

/**
 * Relative strength index, by Wilder's smoothing.
 *
 * Wilder's method rather than a plain average of gains and losses: the plain
 * form is a different indicator that happens to share the name, and reads
 * several points away from what every other chart shows for the same series.
 */
export function rsi(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length <= period) return []

  let gains = 0
  let losses = 0

  for (let i = 1; i <= period; i += 1) {
    const change = candles[i].close - candles[i - 1].close
    if (change >= 0) gains += change
    else losses -= change
  }

  let avgGain = gains / period
  let avgLoss = losses / period

  const out = []

  const push = (time) => {
    // No losses at all is not a divide-by-zero, it is a maximal reading.
    const value = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    out.push({ time, value })
  }

  push(candles[period].time)

  for (let i = period + 1; i < candles.length; i += 1) {
    const change = candles[i].close - candles[i - 1].close
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0

    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period

    push(candles[i].time)
  }

  return out
}

/**
 * MACD: the gap between two EMAs, its own average, and the difference.
 *
 * The signal line is an EMA of the MACD line, so it is computed over the MACD
 * values rather than over prices - which is why this reshapes them into
 * candle-like objects before recursing rather than duplicating the EMA maths.
 */
export function macd(candles, fast = 12, slow = 26, signalPeriod = 9) {
  if (!Array.isArray(candles) || candles.length < slow + signalPeriod) {
    return { macd: [], signal: [], histogram: [] }
  }

  const fastLine = ema(candles, fast)
  const slowLine = ema(candles, slow)

  // The two lines start at different bars; align them by time.
  const fastByTime = new Map(fastLine.map((p) => [p.time, p.value]))

  const macdLine = []
  for (const point of slowLine) {
    const f = fastByTime.get(point.time)
    if (f === undefined) continue
    macdLine.push({ time: point.time, value: f - point.value })
  }

  const signal = ema(
    macdLine.map((p) => ({ time: p.time, close: p.value })),
    signalPeriod
  )

  const signalByTime = new Map(signal.map((p) => [p.time, p.value]))

  const histogram = []
  for (const point of macdLine) {
    const s = signalByTime.get(point.time)
    if (s === undefined) continue
    histogram.push({ time: point.time, value: point.value - s })
  }

  return { macd: macdLine, signal, histogram }
}
