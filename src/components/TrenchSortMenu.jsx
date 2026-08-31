import { ArrowUpDown, Check } from 'lucide-react'
import { sortOptionsFor, FEED_ORDERS } from '../utils/trenchBoard'
import { useDismissable } from '../hooks/useDismissable'
import FloatingMenu from './FloatingMenu'

/**
 * Ordering control for one column.
 *
 * Two groups, kept visibly apart because they do genuinely different things.
 * A feed order is re-asked of the launchpad and ranks every token it holds; a
 * sort only reorders the rows this column has already loaded. Presenting them
 * as one list would imply the second ranks the whole launchpad, which it
 * cannot - the list endpoint accepts four orderings and nothing else.
 */
export default function TrenchSortMenu({
  variant,
  feeds = [],
  feed,
  onFeedChange,
  sort,
  onSortChange,
}) {
  const { open, toggle, close, wrapRef, buttonRef, floatRef } = useDismissable()

  const options = sortOptionsFor(variant)
  const showFeeds = feeds.length > 1

  // The button carries the active choice, so the column says how it is ordered
  // without the menu being open.
  const activeLabel =
    sort === 'default'
      ? FEED_ORDERS[feed] || 'Column order'
      : options.find((o) => o.id === sort)?.label || 'Sorted'

  return (
    <div className="trench-sort" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`trench-sort-btn ${sort !== 'default' ? 'is-active' : ''}`}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Order: ${activeLabel}`}
      >
        <ArrowUpDown size={11} />
        <span className="trench-sort-label">{activeLabel}</span>
      </button>

      {open && (
        <FloatingMenu
          anchorRef={buttonRef}
          floatRef={floatRef}
          align="right"
          onDismiss={close}
          className="trench-sort-menu"
          role="menu"
        >
          {showFeeds && (
            <>
              <p className="trench-sort-group">Feed · ranks every token</p>
              {feeds.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={feed === id && sort === 'default'}
                  className="trench-sort-item"
                  onClick={() => {
                    onFeedChange(id)
                    // A feed order and a local sort would fight each other, so
                    // choosing one clears the other.
                    onSortChange('default')
                    close()
                  }}
                >
                  <Check size={11} className={feed === id && sort === 'default' ? '' : 'is-hidden'} />
                  <span>{FEED_ORDERS[id]}</span>
                </button>
              ))}
            </>
          )}

          <p className="trench-sort-group">
            {showFeeds ? 'Sort loaded rows' : 'Sort · loaded rows only'}
          </p>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={sort === option.id}
              className="trench-sort-item"
              onClick={() => {
                onSortChange(option.id)
                close()
              }}
            >
              <Check size={11} className={sort === option.id ? '' : 'is-hidden'} />
              <span>
                {option.id === 'default' && showFeeds ? 'Feed order' : option.label}
              </span>
            </button>
          ))}
        </FloatingMenu>
      )}
    </div>
  )
}
