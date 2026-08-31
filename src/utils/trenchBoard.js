import { plsToUsd } from '../services/pumptires'
import { failsQuality } from './trenchQuality'

/**
 * Sorting and filtering for the trenches columns.
 *
 * Both are applied to the rows a column has already loaded, not to the feed.
 * The launchpad's list endpoint accepts exactly four orderings - newest,
 * closest to graduating, latest graduated, and most recently traded - and
 * returns an empty list for anything else, so there is no server-side sort by
 * market cap or volume to ask for. The UI says so rather than implying the
 * whole launchpad has been ranked.
 */

/**
 * Column orderings the API itself understands. Selecting one of these re-asks
 * the feed instead of reshuffling loaded rows, so it ranks every token on the
 * launchpad rather than the few dozen on screen.
 */
export const FEED_ORDERS = {
  created_timestamp: 'Newest',
  top_bonding: 'Closest to grad',
  launch_timestamp: 'Latest graduated',
  latest_activity_timestamp: 'Recently traded',
}

/**
 * Client-side orderings. `variants` lists the columns each one makes sense in -
 * bonding progress is pinned at 100 on everything that has already graduated,
 * so offering it there would produce an arbitrary shuffle.
 */
export const SORT_OPTIONS = [
  { id: 'default', label: 'Column order', variants: ['new', 'koth', 'grad'] },
  { id: 'mcap', label: 'Market cap', variants: ['new', 'koth', 'grad'] },
  { id: 'volume', label: 'Volume', variants: ['new', 'koth', 'grad'] },
  { id: 'change5m', label: '5m change', variants: ['new', 'koth', 'grad'] },
  { id: 'velocity', label: 'Curve velocity', variants: ['new', 'koth'] },
  { id: 'bonding', label: 'Bonding %', variants: ['new', 'koth'] },
  { id: 'age', label: 'Newest first', variants: ['new', 'koth', 'grad'] },
]

export function sortOptionsFor(variant) {
  return SORT_OPTIONS.filter((o) => o.variants.includes(variant))
}

export const DEFAULT_FILTERS = {
  minMcap: 0,
  minVolume: 0,
  bondingMin: 0,
  bondingMax: 100,
  watchlistOnly: false,
}

/** How many filters are doing something, for the badge on the filter button. */
export function activeFilterCount(filters) {
  if (!filters) return 0
  let n = 0
  if (filters.minMcap > 0) n += 1
  if (filters.minVolume > 0) n += 1
  if (filters.bondingMin > 0 || filters.bondingMax < 100) n += 1
  if (filters.watchlistOnly) n += 1
  return n
}

/**
 * Sanitise a stored or user-entered filter set.
 *
 * Storage is hand-editable and the number inputs accept anything, so nothing
 * here trusts its input: a NaN minimum would filter every row out of the board
 * and read as a broken feed.
 */
export function normalizeFilters(raw) {
  const num = (value, fallback, min, max) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, n))
  }

  const bondingMin = num(raw?.bondingMin, 0, 0, 100)
  const bondingMax = num(raw?.bondingMax, 100, 0, 100)

  return {
    minMcap: num(raw?.minMcap, 0, 0, Number.MAX_SAFE_INTEGER),
    minVolume: num(raw?.minVolume, 0, 0, Number.MAX_SAFE_INTEGER),
    // Swapped rather than rejected: dragging the range past itself is an easy
    // mistake and an empty column is a poor way to report it.
    bondingMin: Math.min(bondingMin, bondingMax),
    bondingMax: Math.max(bondingMin, bondingMax),
    watchlistOnly: Boolean(raw?.watchlistOnly),
  }
}

/** Distance below the all-time high, as a negative percentage, or null. */
export function drawdownFromAth(token) {
  const ath = Number(token?.priceAth)
  const price = Number(token?.pricePls)
  if (!(ath > 0) || !(price > 0)) return null
  // A token printing a new high reads as 0 rather than a positive number - it
  // is the high, and "+0.4% from ATH" would be nonsense.
  if (price >= ath) return 0
  return ((price - ath) / ath) * 100
}

/**
 * Apply the current view to a column's loaded rows.
 *
 * Filtering runs before sorting so the comparator only ever sees rows that
 * survived, and both are pure - the caller keeps the untouched list for its
 * "showing N of M" line.
 */
export function applyBoardView(
  tokens,
  { variant, sort = 'default', filters, velocity, plsPrice, watchedSet, quality, verdicts } = {}
) {
  const list = Array.isArray(tokens) ? tokens : []
  const f = normalizeFilters(filters)

  const filtered = list.filter((token) => {
    if (!token) return false

    if (f.watchlistOnly && !watchedSet?.has(token.address?.toLowerCase())) return false

    /*
     * A starred token is exempt from the quality signals.
     *
     * They are heuristics, and one of them will eventually be wrong about
     * something the reader has already decided to follow. Having it vanish
     * from a board they filtered themselves would be the worst way to find
     * that out.
     */
    if (!watchedSet?.has(token.address?.toLowerCase())) {
      if (failsQuality(token.address, quality, verdicts)) return false
    }

    if (f.minMcap > 0) {
      if (plsToUsd(token.marketValuePls, plsPrice) < f.minMcap) return false
    }

    if (f.minVolume > 0 && (token.volumeUsd || 0) < f.minVolume) return false

    // Graduated tokens have left the curve, so a bonding window that excludes
    // 100 would silently empty the Graduations column.
    if ((f.bondingMin > 0 || f.bondingMax < 100) && !token.isLaunched) {
      const p = token.bondingProgress || 0
      if (p < f.bondingMin || p > f.bondingMax) return false
    }

    return true
  })

  if (sort === 'default') return filtered

  // A copy: the array belongs to React Query's cache and sorting in place would
  // mutate it.
  const sorted = [...filtered]

  const num = (v) => (Number.isFinite(v) ? v : Number.NEGATIVE_INFINITY)

  const key = {
    mcap: (t) => num(plsToUsd(t.marketValuePls, plsPrice)),
    volume: (t) => num(t.volumeUsd),
    change5m: (t) => (t.change5m === null ? Number.NEGATIVE_INFINITY : num(t.change5m)),
    bonding: (t) => num(t.bondingProgress),
    velocity: (t) => num(velocity?.get(t.address)?.perMin),
    age: (t) => num(variant === 'grad' ? t.launchedAt : t.createdAt),
  }[sort]

  if (!key) return filtered

  // Descending throughout: every one of these reads as "most first".
  sorted.sort((a, b) => key(b) - key(a))
  return sorted
}
