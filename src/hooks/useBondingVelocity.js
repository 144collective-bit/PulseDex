import { useMemo } from 'react'

/**
 * How fast a token is moving along its bonding curve.
 *
 * The launchpad publishes a token's bonding progress but never how quickly it
 * got there, which is the figure that actually decides whether a row is worth
 * acting on: 78% and stalled is a different token from 78% and climbing two
 * points a minute. Nothing upstream carries it, so it is measured here, from
 * the board's own 30-second polling.
 *
 * History lives at module scope rather than in component state because the
 * columns remount on every tab change and a measurement that resets each time
 * the user glances at the screener would never accumulate a reading.
 */

/** address -> [{ t, p }], oldest first. */
const HISTORY = new Map()

/** Enough samples for the window below at the board's poll rate, plus slack. */
const MAX_SAMPLES = 32

/** Ignore samples closer together than this - repeat renders, not new data. */
const MIN_SAMPLE_GAP_MS = 5_000

/** Only the recent past counts; a token that ran an hour ago is not running. */
const WINDOW_MS = 10 * 60 * 1000

/** A reading needs a real span behind it, or noise reads as momentum. */
const MIN_SPAN_MS = 60 * 1000

/** Drop tokens that have fallen off the board so the map cannot grow forever. */
const STALE_MS = 30 * 60 * 1000

let lastPrune = 0

function prune(now) {
  if (now - lastPrune < STALE_MS) return
  lastPrune = now

  for (const [address, samples] of HISTORY) {
    const last = samples[samples.length - 1]
    if (!last || now - last.t > STALE_MS) HISTORY.delete(address)
  }
}

/**
 * Record one observation.
 *
 * Idempotent within the sample gap, so calling it during a render that React
 * replays - as it does in development - cannot double-count.
 */
function record(address, progress, now) {
  if (!address || !Number.isFinite(progress)) return

  let samples = HISTORY.get(address)
  if (!samples) {
    samples = []
    HISTORY.set(address, samples)
  }

  const last = samples[samples.length - 1]
  if (last) {
    if (now - last.t < MIN_SAMPLE_GAP_MS) return
    // A flat reading still has to be recorded: "not moving" is the answer for
    // most of the board, and dropping it would leave a stalled token showing
    // whatever velocity it had ten minutes ago.
  }

  samples.push({ t: now, p: progress })
  if (samples.length > MAX_SAMPLES) samples.shift()
}

/**
 * Velocity for one token, or null while there is not enough history.
 *
 * Measured between the oldest sample still inside the window and the newest,
 * rather than fitted: the curve only moves when someone buys, so the series is
 * a staircase and a regression through it reads lower than the token is
 * actually travelling.
 */
function readVelocity(address, now) {
  const samples = HISTORY.get(address)
  if (!samples || samples.length < 2) return null

  const cutoff = now - WINDOW_MS
  const recent = samples.filter((s) => s.t >= cutoff)
  if (recent.length < 2) return null

  const first = recent[0]
  const last = recent[recent.length - 1]
  const spanMs = last.t - first.t
  if (spanMs < MIN_SPAN_MS) return null

  const perMin = ((last.p - first.p) / spanMs) * 60_000

  // Only a token that is still climbing has a time to graduation. A falling
  // reading is real - sells move the curve back - but it has no ETA.
  const remaining = Math.max(0, 100 - last.p)
  const etaMin = perMin > 0.001 ? remaining / perMin : null

  return { perMin, etaMin, spanMs }
}

/**
 * Velocity for every token in a column, keyed by address.
 *
 * Recording happens here rather than in an effect so the reading is available
 * on the same render that delivered the data; `record` is idempotent, which is
 * what makes that safe.
 */
export function useBondingVelocity(tokens) {
  return useMemo(() => {
    const now = Date.now()
    prune(now)

    const out = new Map()
    for (const token of tokens || []) {
      // A graduated token has left the curve; its progress is pinned at 100 and
      // would read as a permanent standstill.
      if (!token || token.isLaunched) continue

      record(token.address, token.bondingProgress, now)
      const reading = readVelocity(token.address, now)
      if (reading) out.set(token.address, reading)
    }
    return out
  }, [tokens])
}

/** Compact "2.4%/m" style label, or null when there is nothing to say. */
export function formatVelocity(perMin) {
  if (!Number.isFinite(perMin)) return null
  const abs = Math.abs(perMin)
  // Below this the figure is rounding noise on a staircase series.
  if (abs < 0.05) return null
  const digits = abs >= 10 ? 0 : 1
  return `${perMin > 0 ? '+' : '−'}${abs.toFixed(digits)}%/m`
}

/** Compact time-to-graduation label, or null when it is not climbing. */
export function formatEta(etaMin) {
  if (!Number.isFinite(etaMin) || etaMin <= 0) return null
  if (etaMin < 1) return '<1m'
  if (etaMin < 90) return `${Math.round(etaMin)}m`
  const hours = etaMin / 60
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`
  // Beyond a couple of days the estimate is not worth a number.
  return '2d+'
}
