import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { listLibraryEntries } from '../registry/library'
import { useDashboardActions } from '../state/DashboardProvider'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { canFitFrame, fitToFrame } from '../state/gridSlots'

/**
 * Choosing a module for one particular bay.
 *
 * The full library drawer answers "what modules are there"; this answers the
 * much narrower "what goes in this hole", and it is worth a different control.
 * The drawer covers the board, which means the gap being filled is no longer on
 * screen at the moment of choosing - so the menu opens against the bay instead
 * and everything stays in view.
 *
 * Entries come from the same `listLibraryEntries` the drawer uses, so a newly
 * registered module or preset appears in both without either being touched.
 *
 * The drawer remains, reached from the toolbar, for browsing with previews.
 */
export default function SlotAddMenu({ slot, onClose }) {
  const actions = useDashboardActions()
  const [query, setQuery] = useState('')
  const menuRef = useRef(null)
  const inputRef = useRef(null)

  useEscapeKey(true, onClose)

  // Opening a menu to search it and having to click the field first is a step
  // that only exists because the focus was not moved.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /*
   * Close on any pointer press outside. Pointerdown rather than click so the
   * menu is gone before the press lands on whatever is underneath, which
   * otherwise reads as the first click being swallowed.
   */
  useEffect(() => {
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose])

  const groups = useMemo(() => listLibraryEntries(query), [query])
  const count = useMemo(() => groups.reduce((n, g) => n + g.entries.length, 0), [groups])

  /**
   * Add the chosen entry into this bay.
   *
   * A preset carries its configuration and a plain module does not; past that
   * they are the same thing downstream, which is what keeps this one call
   * rather than two paths.
   */
  const choose = (entry) => {
    actions.addModule(entry.definition, {
      config: entry.config,
      contextMode: entry.contextMode,
      // The bay is taken whole, the same way a module that moves into one takes
      // it whole. Anything less would leave a sliver of the bay behind and
      // reshape the rack that moving is careful to leave alone.
      layout: fitToFrame(entry.definition, slot),
    })
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="dash-slot-menu"
      role="dialog"
      aria-label={`Add a module to the ${slot.w} by ${slot.h} space`}
    >
      <div className="dash-slot-menu-search">
        <Search size={13} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search modules"
          aria-label="Search modules"
        />
      </div>

      <div className="dash-slot-menu-list">
        {count === 0 ? (
          <p className="dash-slot-menu-empty">Nothing matches “{query}”.</p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="dash-slot-menu-group">
              <p className="dash-slot-menu-label">{group.label}</p>
              {group.entries.map((entry) => {
                const Icon = entry.icon
                /*
                 * A module whose minimum will not sit inside this bay is shown
                 * but not offered. Hiding it would leave a user hunting for
                 * something they can see in the drawer and not here; saying it
                 * is too big for this space answers the question instead.
                 */
                const tooBig = !canFitFrame(entry.definition, slot)
                const reason =
                  entry.unavailableReason ||
                  (tooBig ? `Needs at least ${entry.definition.minSize?.w ?? 2}x${entry.definition.minSize?.h ?? 2} - this space is ${slot.w}x${slot.h}` : null)

                return (
                  <button
                    key={entry.key}
                    type="button"
                    className="dash-slot-menu-item"
                    onClick={() => choose(entry)}
                    disabled={Boolean(reason)}
                    title={reason || entry.description}
                  >
                    <span className="dash-slot-menu-icon">
                      {Icon ? <Icon size={14} aria-hidden="true" /> : null}
                    </span>
                    <span className="dash-slot-menu-text">
                      <span className="dash-slot-menu-name">{entry.name}</span>
                      <span className="dash-slot-menu-desc">
                        {reason || entry.description}
                      </span>
                    </span>
                    <span className="dash-slot-menu-size">
                      {entry.size.w}×{entry.size.h}
                    </span>
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
