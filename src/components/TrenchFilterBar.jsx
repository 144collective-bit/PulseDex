import { useState } from 'react'
import { ChevronDown, Search, SlidersHorizontal, Star, RotateCcw, X } from 'lucide-react'
import { useMediaQuery } from '../hooks/useMediaQuery'
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
 *
 * Narrow screens collapse the groups behind the FILTERS control. They used to
 * stay on one line that scrolled sideways with the scrollbar hidden, which
 * meant five of the fourteen controls - the whole curve group, and Starred -
 * were off the right edge with nothing to say so. A filter nobody can find is
 * not a filter. Collapsed is honest about there being more, costs one line
 * instead of four, and keeps the count badge visible so active filters still
 * announce themselves.
 */
export default function TrenchFilterBar({
  filters,
  onChange,
  onReset,
  shown,
  loaded,
  watchlistCount,
  search = '',
  onSearchChange,
}) {
  const count = activeFilterCount(filters)
  const set = (patch) => onChange({ ...filters, ...patch })

  /*
   * Matches the breakpoint the stylesheet uses for this bar. The groups are
   * unmounted rather than hidden with CSS, so a collapsed bar does not leave
   * fourteen controls in the tab order for a keyboard to walk through and a
   * screen reader to read out.
   */
  const narrow = useMediaQuery('(max-width: 900px)')
  const [open, setOpen] = useState(false)
  const showGroups = !narrow || open

  /*
   * Search lives here on a phone, because the header that used to hold it is
   * gone at this width. Collapsed to a magnifier until it is wanted - a field
   * wide enough to type an address into is most of a phone's width, and this
   * row has to stay one line.
   */
  const [searchOpen, setSearchOpen] = useState(false)
  const showSearch = narrow && Boolean(onSearchChange)

  const bondingActive = BONDING_PRESETS.findIndex(
    (p) => p.min === filters.bondingMin && p.max === filters.bondingMax
  )

  return (
    <div className={`trench-filter-bar ${narrow ? 'is-collapsible' : ''} ${open ? 'is-open' : ''}`}>
      {showSearch && (
        <button
          type="button"
          className={`tfb-search-btn ${search ? 'is-on' : ''}`}
          onClick={() => setSearchOpen((v) => !v)}
          aria-expanded={searchOpen}
          aria-label={search ? `Search: ${search}` : 'Search tokens'}
          title="Search name, symbol or address"
        >
          <Search size={13} />
        </button>
      )}

      {narrow ? (
        <button
          type="button"
          className="tfb-lead tfb-lead-btn font-mono"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={open ? 'Hide filters' : 'Show filters'}
        >
          <SlidersHorizontal size={12} />
          <span>FILTERS</span>
          {count > 0 && <span className="tfb-count">{count}</span>}
          <ChevronDown size={12} className="tfb-lead-caret" />
        </button>
      ) : (
        <div className="tfb-lead font-mono">
          <SlidersHorizontal size={12} />
          <span>FILTERS</span>
          {count > 0 && <span className="tfb-count">{count}</span>}
        </div>
      )}

      {showGroups && (
      <>
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
      </>
      )}

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

      {showSearch && searchOpen && (
        <div className="tfb-search">
          <Search size={13} className="tfb-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="tfb-search-input font-mono"
            placeholder="Search name, symbol or address…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search launchpad tokens"
            autoFocus
          />
          {search && (
            <button
              type="button"
              className="tfb-search-clear"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      <div className="tfb-tail font-mono">
        {/* Says "of what is loaded", because that is all it can honestly be. */}
        <span className="tfb-showing" title="Filters apply to the rows each column has loaded">
          {shown} / {loaded} <span className="tfb-showing-word">loaded</span>
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
