import { useEffect, useMemo, useRef } from 'react'
import { Inbox, AlertTriangle } from 'lucide-react'
import TrenchTokenCard from './TrenchTokenCard'
import TrenchSortMenu from './TrenchSortMenu'
import TrenchQualityMenu from './TrenchQualityMenu'
import { FilteredEmpty } from './TrenchFilterBar'
import { useTokenColumn } from '../hooks/usePumpTires'
import { useBondingVelocity } from '../hooks/useBondingVelocity'
import { plsToUsd } from '../services/pumptires'
import { applyBoardView } from '../utils/trenchBoard'
import { assessTokens, DEFAULT_QUALITY, activeQualityCount } from '../utils/trenchQuality'
import { formatUsd } from '../utils/formatters'

/** Rows near the top of a column load their logo immediately. */
const EAGER_ROWS = 14

/**
 * Pages the column will fetch on its own before it starts asking.
 *
 * The sentinel loads the next page whenever it comes into view, which is fine
 * while every row is on screen. Under a filter it is not: the visible list is
 * short, so the sentinel never leaves the viewport, and the column pages
 * through the entire launchpad hunting for matches - one filter chip took it
 * from 45 rows to 135 in a couple of seconds and it had no reason to stop.
 * Past this it waits to be asked.
 */
const MAX_AUTO_PAGES = 8

/** Placeholder rows shown on first load so the column doesn't jump when data lands. */
function RowSkeleton() {
  return (
    <div className="trench-row is-skeleton" aria-hidden="true">
      <span className="sk sk-rank" />
      <span className="sk sk-logo" />
      <span className="sk-ident">
        <span className="sk sk-line-a" />
        <span className="sk sk-line-b" />
      </span>
      <span className="sk-num">
        <span className="sk sk-line-c" />
        <span className="sk sk-line-d" />
      </span>
      <span className="sk sk-bond" />
    </div>
  )
}

/**
 * One scrolling column of the trenches board.
 *
 * Pages are cursor-based, so the next page loads when a sentinel at the bottom
 * of the list scrolls into view rather than on a click.
 */
export default function TrenchColumn({
  title,
  shortTitle,
  filter,
  feeds = [],
  accent = 'cyan',
  variant = 'new',
  search = '',
  plsPrice,
  onSelectToken,
  sort = 'default',
  onSortChange,
  onFeedChange,
  filters,
  onResetFilters,
  watchedSet,
  isWatched,
  onToggleWatch,
  onCounts,
  newAddresses,
  quality,
  onQualityChange,
}) {
  const sentinelRef = useRef(null)

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
  } = useTokenColumn(filter, search)

  const pageCount = data?.pages.length || 0
  const autoLoads = pageCount < MAX_AUTO_PAGES

  // Load more when the sentinel scrolls into view, up to the page cap above.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage || !autoLoads) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '250px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, autoLoads])

  const tokens = useMemo(
    () => data?.pages.flatMap((p) => p.tokens) || [],
    [data]
  )

  // Measured off the unfiltered list: a token's curve speed does not depend on
  // whether the current filters happen to be showing it.
  const velocity = useBondingVelocity(tokens)

  /*
   * Launch quality, for the column that needs it.
   *
   * Only New Launches carries the control: it is where scripted launches
   * arrive, and a token that reached King of the Hill or graduated has already
   * been judged by the market more harshly than any heuristic here could.
   *
   * Assessed off the unfiltered list, and for a stronger reason than velocity
   * is: whether a wallet is flooding the board is a fact about everything it
   * has minted, not about whichever of those the filters are letting through.
   * Assessing the filtered list would let the filter erase its own evidence.
   */
  const wantsQuality = Boolean(onQualityChange)

  const { verdicts, counts: qualityCounts } = useMemo(
    () => (wantsQuality ? assessTokens(tokens) : { verdicts: null, counts: {} }),
    [tokens, wantsQuality]
  )

  const visible = useMemo(
    () =>
      applyBoardView(tokens, {
        variant,
        sort,
        filters,
        velocity,
        plsPrice,
        watchedSet,
        quality,
        verdicts,
      }),
    [tokens, variant, sort, filters, velocity, plsPrice, watchedSet, quality, verdicts]
  )

  // The board's filter bar totals these across the three columns.
  useEffect(() => {
    onCounts?.(variant, { shown: visible.length, loaded: tokens.length })
  }, [onCounts, variant, visible.length, tokens.length])

  // Aggregate what is on screen, so the heading agrees with the rows below it.
  const totalMcap = visible.reduce(
    (sum, t) => sum + plsToUsd(t.marketValuePls, plsPrice),
    0
  )

  const hiddenByFilters = tokens.length > 0 && visible.length === 0

  /*
   * Whether the quality signals are what emptied the column.
   *
   * Answered by re-running the view without them: if rows come back, they were
   * the cause. Cheaper than it looks - it only runs on an empty column, and
   * only where the control exists.
   */
  const emptiedByQuality =
    hiddenByFilters &&
    wantsQuality &&
    activeQualityCount(quality) > 0 &&
    applyBoardView(tokens, { variant, sort, filters, velocity, plsPrice, watchedSet }).length > 0

  return (
    <section className={`trench-column trench-panel accent-${accent}`}>
      {/*
        Heading and labels travel as one block.

        They used to be stuck to the viewport separately, at offsets that
        assumed a fixed heading height. The heading is 35px at some widths and
        44 at others, so the labels docked a few pixels low and a row showed
        through the seam. One sticky element cannot come apart.
      */}
      <div className="trench-panel-dock">
        <header className="trench-panel-head">
          <div className="tph-title-group">
            <span className={`tph-dot accent-dot-${accent}`} aria-hidden="true" />
            {/* The full title is the accessible name at every width; only
                which of the two spans is painted changes. */}
            <h2 className="tph-title font-mono" aria-label={title}>
              <span className="tph-title-full" aria-hidden="true">{title}</span>
              <span className="tph-title-short" aria-hidden="true">
                {shortTitle || title}
              </span>
            </h2>
            {isFetching && !isLoading && (
              <span className="tph-live" title="Refreshing" aria-hidden="true" />
            )}
          </div>
          <div className="tph-meta font-mono">
            {totalMcap > 0 && <span className="tph-agg">{formatUsd(totalMcap)}</span>}
            <span className="tph-count" title={`${visible.length} of ${tokens.length} loaded`}>
              {visible.length}
            </span>
            {wantsQuality && (
              <TrenchQualityMenu
                quality={quality}
                counts={qualityCounts}
                onChange={onQualityChange}
              />
            )}
            <TrenchSortMenu
              variant={variant}
              feeds={feeds}
              feed={filter}
              onFeedChange={onFeedChange}
              sort={sort}
              onSortChange={onSortChange}
            />
          </div>
        </header>

        {/* Column labels, so every number below reads as a real table */}
        <div className="trench-col-labels font-mono" aria-hidden="true">
          <span className="tcl-rank">#</span>
          {/* Each figure the label names is wrapped so it can drop out on its
              own as the column narrows, rather than the whole line wrapping. */}
          <span className="tcl-ident">
            TOKEN<span className="tcl-age"> / AGE</span>
            <span className="tcl-mc"> · MC</span>
            <span className="tcl-vol"> · VOL</span>
          </span>
          <span className="tcl-num">PRICE / 5M</span>
          <span className="tcl-bond">{variant === 'grad' ? 'STATUS' : 'BONDING'}</span>
        </div>
      </div>

      <div className="trench-panel-scroll">
        {isLoading &&
          Array.from({ length: 8 }, (_, i) => <RowSkeleton key={i} />)}

        {isError && !tokens.length && (
          <div className="trench-panel-state font-mono is-error">
            <AlertTriangle size={15} />
            <span>Feed unavailable</span>
          </div>
        )}

        {!isLoading && !isError && tokens.length === 0 && (
          <div className="trench-panel-state font-mono">
            <Inbox size={15} />
            <span>{search ? 'No matches' : 'Nothing here yet'}</span>
          </div>
        )}

        {/* A column emptied by filters is a different situation from an empty
            feed, and needs the way out rather than "nothing here yet". */}
        {!isLoading && !isError && hiddenByFilters && (
          <FilteredEmpty
            onReset={onResetFilters}
            onClearQuality={() => onQualityChange?.(DEFAULT_QUALITY)}
            byQuality={emptiedByQuality}
          />
        )}

        {visible.map((token, index) => (
          <TrenchTokenCard
            key={token.address}
            token={token}
            plsPrice={plsPrice}
            variant={variant}
            rank={index + 1}
            onSelect={onSelectToken}
            eager={index < EAGER_ROWS}
            velocity={velocity.get(token.address)}
            watched={isWatched?.(token.address)}
            onToggleWatch={onToggleWatch}
            isNew={newAddresses?.has(token.address)}
          />
        ))}

        {/* Infinite-scroll trigger */}
        <div ref={sentinelRef} className="trench-sentinel">
          {isFetchingNextPage &&
            Array.from({ length: 3 }, (_, i) => <RowSkeleton key={i} />)}
        </div>

        {/* Past the cap the column says how deep it has looked and lets the
            reader decide whether to keep going. */}
        {!autoLoads && hasNextPage && !isFetchingNextPage && (
          <div className="trench-more font-mono">
            <span>Searched the {tokens.length} most recent</span>
            <button type="button" className="btn-sm" onClick={() => fetchNextPage()}>
              Load more
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
