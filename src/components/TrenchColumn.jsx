import { useEffect, useRef } from 'react'
import { Inbox, AlertTriangle } from 'lucide-react'
import TrenchTokenCard from './TrenchTokenCard'
import { useTokenColumn } from '../hooks/usePumpTires'
import { plsToUsd } from '../services/pumptires'
import { formatUsd } from '../utils/formatters'

/** Rows near the top of a column load their logo immediately. */
const EAGER_ROWS = 14

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
  filter,
  accent = 'cyan',
  variant = 'new',
  search = '',
  plsPrice,
  onSelectToken,
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

  // Load more when the sentinel becomes visible inside the scroll container.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage) return

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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const tokens = data?.pages.flatMap((p) => p.tokens) || []

  // Aggregate the loaded rows so the header carries a live read on the column.
  const totalMcap = tokens.reduce(
    (sum, t) => sum + plsToUsd(t.marketValuePls, plsPrice),
    0
  )

  return (
    <section className={`trench-column trench-panel accent-${accent}`}>
      <header className="trench-panel-head">
        <div className="tph-title-group">
          <span className={`tph-dot accent-dot-${accent}`} aria-hidden="true" />
          <h2 className="tph-title font-mono">{title}</h2>
          {isFetching && !isLoading && (
            <span className="tph-live" title="Refreshing" aria-hidden="true" />
          )}
        </div>
        <div className="tph-meta font-mono">
          {totalMcap > 0 && <span className="tph-agg">{formatUsd(totalMcap)}</span>}
          <span className="tph-count">{tokens.length}</span>
        </div>
      </header>

      {/* Column labels, so every number below reads as a real table */}
      <div className="trench-col-labels font-mono" aria-hidden="true">
        <span className="tcl-rank">#</span>
        <span className="tcl-ident">
          TOKEN / AGE · MC<span className="tcl-vol"> · VOL</span>
        </span>
        <span className="tcl-num">PRICE / 5M</span>
        <span className="tcl-bond">{variant === 'grad' ? 'STATUS' : 'BONDING'}</span>
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

        {tokens.map((token, index) => (
          <TrenchTokenCard
            key={token.address}
            token={token}
            plsPrice={plsPrice}
            variant={variant}
            rank={index + 1}
            onSelect={onSelectToken}
            eager={index < EAGER_ROWS}
          />
        ))}

        {/* Infinite-scroll trigger */}
        <div ref={sentinelRef} className="trench-sentinel">
          {isFetchingNextPage &&
            Array.from({ length: 3 }, (_, i) => <RowSkeleton key={i} />)}
        </div>
      </div>
    </section>
  )
}
