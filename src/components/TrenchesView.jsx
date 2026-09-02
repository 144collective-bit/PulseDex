import { useState, useMemo, useEffect } from 'react'
import { Flame, Search, X } from 'lucide-react'
import TrenchColumn from './TrenchColumn'
import TrenchTicker from './TrenchTicker'
import TrenchActivityFeed from './TrenchActivityFeed'
import TrenchDexMovers from './TrenchDexMovers'
import TrenchTokenModal from './TrenchTokenModal'
import TrenchFilterBar from './TrenchFilterBar'
import TrenchAlerts from './TrenchAlerts'
import EcosystemDirectory from './EcosystemDirectory'
import { usePlsPrice, useTokenColumn, useProtocolStats } from '../hooks/usePumpTires'
import { useTrenchBoardView } from '../hooks/useTrenchBoardView'
import { useTrenchWatchlist } from '../hooks/useTrenchWatchlist'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useBoardAlerts } from '../hooks/useBoardAlerts'
import { useBoardKeyboard } from '../hooks/useBoardKeyboard'
import { TRENCH_COLUMNS } from '../config/pumptires'
import { FEATURES } from '../config/features'
import { formatUsd, formatCompactCount } from '../utils/formatters'
import '../styles/trenches.css'
// After trenches.css, so the rules it deliberately restates win.
import '../styles/trenches-controls.css'

/**
 * Live bonding-curve board for the pump.tires launchpad.
 *
 * Three columns (new / closest to graduating / graduated) plus a merged trade
 * tape and a DEX mover panel for tokens that have already migrated to PulseX.
 * All of it is read-only public data — no wallet or signing involved.
 *
 * The previous curated link directory lives on in EcosystemDirectory.jsx and is
 * restored by setting FEATURES.trenchesLive to false.
 */
export default function TrenchesView({ onOpenTokenPage }) {
  const [search, setSearch] = useState('')

  /*
   * The header is desktop-only.
   *
   * Identity, the launchpad totals and a full-width search field cost about a
   * third of a phone screen before the board begins - and the board is the
   * reason anyone opened this page. The totals are context rather than
   * something to act on, the title repeats the tab that was just tapped, and
   * the search survives as a magnifier in the filter row, which is already the
   * one compact strip of controls. On a wide screen there is room for all of
   * it, so nothing changes there.
   */
  const narrow = useMediaQuery('(max-width: 900px)')
  const [selectedToken, setSelectedToken] = useState(null)

  const { data: plsPrice } = usePlsPrice()
  const { data: stats } = useProtocolStats()

  const {
    filters,
    updateFilters,
    resetFilters,
    quality,
    updateQuality,
    orders,
    setColumnOrder,
    reportCounts,
    totals,
  } = useTrenchBoardView()

  const { watchedSet, isWatched, toggle: toggleWatch, count: watchlistCount } =
    useTrenchWatchlist()

  const onBoardKeyDown = useBoardKeyboard()

  // Unfiltered King-of-the-Hill list, shared with the matching column through
  // React Query's cache — this drives the ticker and the trade tape's targets.
  const { data: kothData } = useTokenColumn('top_bonding', '')

  const kothTokens = useMemo(
    () => kothData?.pages.flatMap((p) => p.tokens) || [],
    [kothData]
  )

  // The tape merges per-token feeds, so keep the target list small and stable.
  const activityAddresses = useMemo(
    () => kothTokens.slice(0, 10).map((t) => t.address),
    [kothTokens]
  )

  const tokenIndex = useMemo(() => {
    const index = {}
    kothTokens.forEach((t) => {
      index[t.address] = t
    })
    return index
  }, [kothTokens])

  // Debounce the search so typing doesn't fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(id)
  }, [search])

  /*
   * The other two columns' lists, for the alert diffing below.
   *
   * These are the same queries the columns themselves run - React Query serves
   * both callers from one cache entry, so subscribing here costs no extra
   * requests. The New column's key follows whichever feed it is reading.
   */
  const { data: newData } = useTokenColumn(orders.new.feed, debouncedSearch)
  const { data: gradData } = useTokenColumn('launch_timestamp', debouncedSearch)

  const newTokens = useMemo(
    () => newData?.pages.flatMap((p) => p.tokens) || [],
    [newData]
  )
  const gradTokens = useMemo(
    () => gradData?.pages.flatMap((p) => p.tokens) || [],
    [gradData]
  )

  const { newAddresses, alerts, dismiss } = useBoardAlerts({
    newTokens,
    gradTokens,
    kothTokens,
    // A search narrows every column, so arrivals and departures are the query
    // changing rather than the launchpad moving.
    enabled: !debouncedSearch,
  })

  if (!FEATURES.trenchesLive) {
    return <EcosystemDirectory />
  }

  return (
    <div className="trenches-live-page">
      {/* Header: identity, launchpad totals, search. Desktop only - see above. */}
      {!narrow && (
      <header className="trenches-live-head">
        <div className="tlh-brand">
          <div className="trenches-badge">
            <Flame size={13} className="text-pulse-yellow animate-pulse" />
            <span>THE TRENCHES</span>
            <span className="trenches-live-tag">LIVE</span>
          </div>
          <p className="tlh-sub">
            Bonding-curve launches on PulseChain, straight from the pump.tires feed.
          </p>
        </div>

        {stats && (
          <div className="tlh-stats font-mono">
            <div className="tlh-stat">
              <span className="tlh-stat-label">Tokens</span>
              <span className="tlh-stat-val">{formatCompactCount(stats.totalTokens)}</span>
            </div>
            <div className="tlh-stat">
              <span className="tlh-stat-label">Graduated</span>
              <span className="tlh-stat-val text-pulse-green">
                {formatCompactCount(stats.totalLaunches)}
              </span>
            </div>
            <div className="tlh-stat">
              <span className="tlh-stat-label">Volume</span>
              <span className="tlh-stat-val">{formatUsd(stats.totalVolumeUsd)}</span>
            </div>
            <div className="tlh-stat">
              <span className="tlh-stat-label">Fees Burned</span>
              <span className="tlh-stat-val text-pulse-purple">
                {formatUsd(stats.feesBurnedUsd)}
              </span>
            </div>
          </div>
        )}

        <div className="tlh-search">
          <Search size={13} className="tlh-search-icon" />
          <input
            type="text"
            className="tlh-search-input font-mono"
            placeholder="Search name, symbol or address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search launchpad tokens"
          />
          {search && (
            <button
              type="button"
              className="tlh-search-clear"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </header>
      )}

      {/* King-of-the-hill ticker */}
      <TrenchTicker
        tokens={kothTokens}
        plsPrice={plsPrice}
        onSelectToken={setSelectedToken}
      />

      {/*
        Board.

        There used to be a segment control above this that showed one panel at
        a time on a narrow screen. The board keeps all three token columns side
        by side at every width now, with the two live rails stacked underneath,
        so there is nothing left for it to switch between.
      */}
      <TrenchFilterBar
        filters={filters}
        onChange={updateFilters}
        onReset={resetFilters}
        shown={totals.shown}
        loaded={totals.loaded}
        watchlistCount={watchlistCount}
        search={search}
        onSearchChange={setSearch}
      />

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
          the handler only ever acts on a focused row, which is a button. */}
      <div className="trenches-board" onKeyDown={onBoardKeyDown}>
        {/*
          Launch quality is New Launches' own control: passing the handler is
          what gives a column the menu, and only that column gets it.
        */}
        {TRENCH_COLUMNS.map((col) => (
          <div key={col.id} className={`trenches-slot slot-${col.id}`}>
            <TrenchColumn
              title={col.title}
              shortTitle={col.shortTitle}
              filter={orders[col.id].feed}
              feeds={col.feeds}
              accent={col.accent}
              variant={col.id}
              search={debouncedSearch}
              plsPrice={plsPrice}
              onSelectToken={setSelectedToken}
              sort={orders[col.id].sort}
              onSortChange={(sort) => setColumnOrder(col.id, { sort })}
              onFeedChange={(feed) => setColumnOrder(col.id, { feed })}
              filters={filters}
              onResetFilters={resetFilters}
              watchedSet={watchedSet}
              isWatched={isWatched}
              onToggleWatch={toggleWatch}
              onCounts={reportCounts}
              newAddresses={col.id === 'new' ? newAddresses : null}
              quality={col.id === 'new' ? quality : null}
              onQualityChange={col.id === 'new' ? updateQuality : null}
            />
          </div>
        ))}

        <div className="trenches-slot slot-activity">
          <TrenchActivityFeed
            addresses={activityAddresses}
            tokenIndex={tokenIndex}
            onSelectToken={setSelectedToken}
          />
        </div>

        <div className="trenches-slot slot-movers">
          <TrenchDexMovers onSelectToken={setSelectedToken} />
        </div>
      </div>

      <TrenchAlerts alerts={alerts} onDismiss={dismiss} onSelectToken={setSelectedToken} />

      {selectedToken && (
        <TrenchTokenModal
          token={selectedToken}
          plsPrice={plsPrice}
          onClose={() => setSelectedToken(null)}
          onOpenFullPage={(t) => {
            setSelectedToken(null)
            onOpenTokenPage?.(t.address)
          }}
        />
      )}
    </div>
  )
}
