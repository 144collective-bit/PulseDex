import { SlidersHorizontal, Star, RotateCcw, X } from 'lucide-react'
import { DEFAULT_FILTERS, activeFilterCount } from '../utils/trenchBoard'

/** Market-cap floors, in USD. Chosen to straddle where a curve starts to matter. */
const MCAP_PRESETS = [0, 1_000, 5_000, 25_000, 100_000]

/** Volume floors, in USD. */
const VOLUME_PRESETS = [0, 500, 2_500, 10_000]

/** Bonding windows. `null` bounds mean "leave that end alone". */
const BONDING_PRESETS = [
  { label: 'Any', min: 0, max: 100 },
  { label: 'Fresh · under 25%', min: 0, max: 25 },
  { label: 'Running · 25-75%', min: 25, max: 75 },
  { label: 'Near grad · 75%+', min: 75, max: 100 },
]

function presetLabel(value) {
  if (!value) return 'Any'
  if (value >= 1000) return `$${value / 1000}K`
  return `$${value}`
}

/**
 * Filters shared by the three token columns.
 *
 * One bar rather than a control set per column: these are the same questions
 * in all three. What differs per column stays in that column's heading -
 * ordering, and the launch-quality signals, which only New Launches needs.
 *
 * Every filter applies to the rows a column has already loaded - the launchpad
 * offers no server-side filtering - so the bar reports what it is showing out
 * of what it has rather than implying it searched the whole launchpad.
 */
export default function TrenchFilterBar({
  filters,
  onChange,
  onReset,
  shown,
  loaded,
  watchlistCount,
}) {
  const count = activeFilterCount(filters)
  const set = (patch) => onChange({ ...filters, ...patch })

  const bondingActive = BONDING_PRESETS.findIndex(
    (p) => p.min === filters.bondingMin && p.max === filters.bondingMax
  )

  return (
    <div className="trench-filter-bar">
      <div className="tfb-lead font-mono">
        <SlidersHorizontal size={12} />
        <span>FILTERS</span>
        {count > 0 && <span className="tfb-count">{count}</span>}
      </div>

      <div className="tfb-group">
        <span className="tfb-label font-mono">MIN MC</span>
        <div className="tfb-chips">
          {MCAP_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              className={`tfb-chip font-mono ${filters.minMcap === value ? 'is-on' : ''}`}
              onClick={() => set({ minMcap: value })}
              aria-pressed={filters.minMcap === value}
            >
              {presetLabel(value)}
            </button>
          ))}
        </div>
      </div>

      <div className="tfb-group">
        <span className="tfb-label font-mono">MIN VOL</span>
        <div className="tfb-chips">
          {VOLUME_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              className={`tfb-chip font-mono ${filters.minVolume === value ? 'is-on' : ''}`}
              onClick={() => set({ minVolume: value })}
              aria-pressed={filters.minVolume === value}
            >
              {presetLabel(value)}
            </button>
          ))}
        </div>
      </div>

      <div className="tfb-group">
        <span className="tfb-label font-mono">CURVE</span>
        <div className="tfb-chips">
          {BONDING_PRESETS.map((preset, i) => (
            <button
              key={preset.label}
              type="button"
              className={`tfb-chip font-mono ${bondingActive === i ? 'is-on' : ''}`}
              onClick={() => set({ bondingMin: preset.min, bondingMax: preset.max })}
              aria-pressed={bondingActive === i}
              title={preset.label}
            >
              {preset.label.split(' · ')[0]}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className={`tfb-chip tfb-star font-mono ${filters.watchlistOnly ? 'is-on' : ''}`}
        onClick={() => set({ watchlistOnly: !filters.watchlistOnly })}
        aria-pressed={filters.watchlistOnly}
        title={
          watchlistCount
            ? `Show only your ${watchlistCount} starred tokens`
            : 'Star a token to use this filter'
        }
      >
        <Star size={11} className={filters.watchlistOnly ? 'is-filled' : ''} />
        <span>Starred</span>
        {watchlistCount > 0 && <span className="tfb-star-count">{watchlistCount}</span>}
      </button>

      <div className="tfb-tail font-mono">
        {/* Says "of what is loaded", because that is all it can honestly be. */}
        <span className="tfb-showing" title="Filters apply to the rows each column has loaded">
          {shown} / {loaded} loaded
        </span>
        {count > 0 && (
          <button type="button" className="tfb-reset" onClick={onReset} title="Clear filters">
            <RotateCcw size={11} />
            <span>Clear</span>
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The empty state a column shows when filtering has hidden everything in it.
 *
 * Two controls can empty a column now and they sit in different places, so the
 * way out has to name the one that did it rather than offering a generic
 * "clear" that leaves the other still filtering.
 */
export function FilteredEmpty({ onReset, onClearQuality, byQuality }) {
  return (
    <div className="trench-panel-state font-mono">
      <X size={15} />
      <span>{byQuality ? 'Quality filters hid every row' : 'No rows match the filters'}</span>
      <button
        type="button"
        className="btn-sm"
        onClick={byQuality ? onClearQuality : onReset}
      >
        {byQuality ? 'Turn quality filters off' : 'Clear filters'}
      </button>
    </div>
  )
}

export { DEFAULT_FILTERS }
