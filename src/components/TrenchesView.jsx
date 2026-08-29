import { useState, useMemo, useEffect } from 'react'
import { Flame, Search, X, Activity, Rocket, Crown, Sparkles } from 'lucide-react'
import TrenchColumn from './TrenchColumn'
import TrenchTicker from './TrenchTicker'
import TrenchActivityFeed from './TrenchActivityFeed'
import TrenchDexMovers from './TrenchDexMovers'
import TrenchTokenModal from './TrenchTokenModal'
import EcosystemDirectory from './EcosystemDirectory'
import { usePlsPrice, useTokenColumn, useProtocolStats } from '../hooks/usePumpTires'
import { TRENCH_COLUMNS } from '../config/pumptires'
import { FEATURES } from '../config/features'
import { formatUsd, formatCompactCount } from '../utils/formatters'
import '../styles/trenches.css'

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
export default function TrenchesView() {
  const [search, setSearch] = useState('')
  const [selectedToken, setSelectedToken] = useState(null)
  const [mobilePanel, setMobilePanel] = useState('new')

  const { data: plsPrice } = usePlsPrice()
  const { data: stats } = useProtocolStats()

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

  if (!FEATURES.trenchesLive) {
    return <EcosystemDirectory />
  }

  const mobileTabs = [
    { id: 'new', label: 'New', icon: Sparkles },
    { id: 'koth', label: 'King', icon: Crown },
    { id: 'grad', label: 'Grad', icon: Rocket },
    { id: 'activity', label: 'Trades', icon: Activity },
    { id: 'movers', label: 'DEX', icon: Flame },
  ]

  return (
    <div className="trenches-live-page">
      {/* Header: identity, launchpad totals, search */}
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

      {/* King-of-the-hill ticker */}
      <TrenchTicker
        tokens={kothTokens}
        plsPrice={plsPrice}
        onSelectToken={setSelectedToken}
      />

      {/* Mobile panel switcher — mirrors the screener's segment control */}
      <div className="mobile-screener-switcher trenches-mobile-switcher font-mono">
        {mobileTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`mobile-switcher-btn ${mobilePanel === id ? 'active' : ''}`}
            onClick={() => setMobilePanel(id)}
          >
            <Icon size={13} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Board */}
      <div className={`trenches-board mobile-panel-${mobilePanel}`}>
        {TRENCH_COLUMNS.map((col) => (
          <div key={col.id} className={`trenches-slot slot-${col.id}`}>
            <TrenchColumn
              title={col.title}
              filter={col.filter}
              accent={col.accent}
              variant={col.id}
              search={debouncedSearch}
              plsPrice={plsPrice}
              onSelectToken={setSelectedToken}
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

      {selectedToken && (
        <TrenchTokenModal
          token={selectedToken}
          plsPrice={plsPrice}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </div>
  )
}
