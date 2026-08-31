/**
 * The chart's tool set: what can be switched on, and what it looks like.
 *
 * Kept as data rather than spread through the component so the toolbars and
 * the series builder read from one list - a toggle can never exist in a menu
 * without something drawing it, or the reverse.
 *
 * Every study here is computed from the candles the chart already holds, so
 * switching one on costs no request. That is deliberate: the upstream API
 * limits by address and signals a limit by dropping its CORS header rather
 * than returning a status, so features that would add calls are the expensive
 * kind and features that only add arithmetic are free.
 */

export const CHART_TYPES = [
  { id: 'candles', label: 'Candles' },
  { id: 'bars', label: 'Bars' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
]

/**
 * Moving-average periods on offer, and the colour each one always takes.
 *
 * Fixed per period rather than assigned in the order they are switched on: a
 * reader who runs the 50 in violet wants it violet on the next pair too, and a
 * colour that moves when an unrelated average is toggled is worse than no
 * colour coding at all.
 */
export const EMA_PERIODS = [
  { period: 9, color: '#00ff9d' },
  { period: 12, color: '#3ba9ff' },
  { period: 20, color: '#fbbf24' },
  { period: 26, color: '#ff7ac6' },
  { period: 50, color: '#a78bfa' },
  { period: 100, color: '#f97316' },
  { period: 200, color: '#00e5ff' },
]

export const SMA_PERIODS = [
  { period: 20, color: '#94a3b8' },
  { period: 50, color: '#cbd5e1' },
  { period: 100, color: '#7c8b99' },
  { period: 200, color: '#e2e8f0' },
]

export const RSI_PERIODS = [7, 9, 14, 21]

/** Where the RSI bands sit. Editable later; fixed for now at the convention. */
export const RSI_BANDS = [70, 30]

/**
 * Studies that need their own scale, and so their own pane.
 *
 * Order matters: panes are laid out top to bottom in this order, and the
 * builder assigns indices from whichever are enabled - so turning volume off
 * moves the ones below it up rather than leaving a gap.
 */
export const PANES = [
  { id: 'volume', label: 'Volume', height: 70 },
  { id: 'rsi', label: 'RSI', height: 88 },
  { id: 'macd', label: 'MACD 12/26/9', height: 96 },
]

export const DEFAULT_CHART_SETTINGS = {
  type: 'candles',
  logScale: false,
  ema: [],
  sma: [],
  bollinger: false,
  rsiPeriod: 14,
  panes: { volume: true, rsi: false, macd: false },
}

const asPeriodList = (raw, allowed) => {
  if (!Array.isArray(raw)) return []
  const valid = new Set(allowed.map((o) => o.period))
  // De-duplicated and ordered, so two stored copies of the same period cannot
  // stack two identical lines on the chart.
  return [...new Set(raw.filter((p) => valid.has(p)))].sort((a, b) => a - b)
}

/**
 * Reject anything hand-edited in storage before it reaches the chart.
 *
 * Also migrates the previous shape, which held fixed booleans - `ema20`,
 * `ema50`, `sma200` - from before the periods were selectable. Someone who set
 * that up should not lose it to a release.
 */
export function normalizeChartSettings(raw) {
  const base = DEFAULT_CHART_SETTINGS

  const type = CHART_TYPES.some((t) => t.id === raw?.type) ? raw.type : base.type

  const legacy = raw?.overlays
  const ema = legacy
    ? [legacy.ema20 && 20, legacy.ema50 && 50].filter(Boolean)
    : asPeriodList(raw?.ema, EMA_PERIODS)
  const sma = legacy ? [legacy.sma200 && 200].filter(Boolean) : asPeriodList(raw?.sma, SMA_PERIODS)
  const bollinger = legacy ? Boolean(legacy.bollinger) : Boolean(raw?.bollinger)

  const rsiPeriod = RSI_PERIODS.includes(raw?.rsiPeriod) ? raw.rsiPeriod : base.rsiPeriod

  const panes = {}
  for (const p of PANES) {
    // Volume defaults on, so an absent value must not read as false for it the
    // way it does for the rest.
    panes[p.id] = raw?.panes?.[p.id] === undefined ? base.panes[p.id] : Boolean(raw.panes[p.id])
  }

  return { type, logScale: Boolean(raw?.logScale), ema, sma, bollinger, rsiPeriod, panes }
}

/** How many moving averages are drawn, for the EMA button's badge. */
export function maCount(settings) {
  return (settings?.ema?.length || 0) + (settings?.sma?.length || 0) + (settings?.bollinger ? 1 : 0)
}

/** Studies left in the general menu, for its badge. */
export function studyCount(settings) {
  return PANES.filter((p) => p.id !== 'volume' && p.id !== 'rsi' && settings?.panes?.[p.id]).length
}
