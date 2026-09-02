import { useEffect, useMemo, useState } from 'react'
import { GripVertical, Plus, Search, X } from 'lucide-react'
import { listLibraryEntries } from '../registry/library'
import { useDashboardActions } from '../state/DashboardProvider'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { fitToSlot } from '../state/gridSlots'
import { COLS } from '../state/gridConfig'
import ModulePreview from './ModulePreview'

/**
 * The add-module drawer.
 *
 * Two panes: what there is on the left, what it actually looks like on the
 * right. Choosing from a list of names and one-line descriptions meant
 * inferring what "Top movers" or "Ratio" would put on screen, and the fastest
 * way to find out was to add one and undo it. The preview replaces that guess
 * with the module itself, running on live data.
 *
 * Every row is generated from a registry entry or a preset, so a newly
 * registered module appears here without this file being touched. That remains
 * the test of whether the registry is doing its job.
 *
 * Three ways out, suiting different intentions: drag a row onto the canvas when
 * you know where it goes, press Add when you only know you want one, or open
 * the drawer from an empty slot and have Add fill that slot.
 */
export default function ModuleLibrary({ open, onClose, targetSlot, onDragDefChange }) {
  const actions = useDashboardActions()
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)
  useEscapeKey(open, onClose)

  const groups = useMemo(() => listLibraryEntries(query), [query])

  const entries = useMemo(() => groups.flatMap((g) => g.entries), [groups])

  /*
   * Keep a selection alive as the search narrows. Without this, typing would
   * empty the preview pane the moment the selected entry stopped matching,
   * which reads as the preview breaking rather than the filter working.
   */
  const selected = useMemo(
    () => entries.find((e) => e.key === selectedKey) ?? entries[0] ?? null,
    [entries, selectedKey],
  )

  useEffect(() => {
    if (!open) setSelectedKey(null)
  }, [open])

  if (!open) return null

  /**
   * Add an entry, whichever kind it is.
   *
   * A preset carries its configuration and a plain module does not; beyond that
   * they are the same thing to everything downstream, which is what keeps this
   * a one-line difference rather than a second code path.
   */
  const add = (entry) => {
    const options = { config: entry.config, contextMode: entry.contextMode }

    if (targetSlot) {
      actions.addModule(entry.definition, {
        ...options,
        layout: fitToSlot(entry.definition, targetSlot, COLS.lg),
      })
      // The slot has been filled, so the reason this drawer was open is gone.
      onClose()
      return
    }
    actions.addModule(entry.definition, options)
    // Otherwise it stays open: building a desk means adding several modules in
    // a row, and closing after each one would mean reopening and searching
    // again every time.
  }

  /*
   * Dragging a row has to reach the canvas, which this drawer is sitting on
   * top of. So for the duration of the drag the drawer stops taking pointer
   * events and drops most of its opacity - the row keeps following the cursor,
   * and the grid underneath receives the dragover it needs to show a preview.
   */
  const startDrag = (event, entry) => {
    setDragging(entry.key)
    onDragDefChange?.(entry)
    // Firefox refuses to start a drag unless some data is set.
    event.dataTransfer.setData('text/plain', entry.key)
    event.dataTransfer.effectAllowed = 'copy'
  }

  const endDrag = () => {
    setDragging(null)
    onDragDefChange?.(null)
  }

  return (
    <div
      className={`dash-library-backdrop ${dragging ? 'is-dragging' : ''}`}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        className={`dash-library ${dragging ? 'is-dragging' : ''}`}
        role="dialog"
        aria-label="Add a module"
      >
        <header className="dash-library-header">
          <h2>{targetSlot ? 'Add module here' : 'Add module'}</h2>
          <button
            type="button"
            className="dash-icon-btn"
            onClick={onClose}
            aria-label="Close module library"
          >
            <X size={15} />
          </button>
        </header>

        <p className="dash-library-hint">
          {targetSlot
            ? `Choosing one drops it into the ${targetSlot.w}×${targetSlot.h} space you picked.`
            : 'Pick one to preview it, then add it or drag it onto the dashboard.'}
        </p>

        <div className="dash-token-search dash-library-search">
          <Search size={13} aria-hidden="true" />
          <input
            autoFocus
            type="text"
            value={query}
            placeholder="Search modules"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search modules"
          />
        </div>

        <div className="dash-library-body">
          <div className="dash-library-list" role="listbox" aria-label="Available modules">
            {groups.length === 0 ? (
              <div className="dash-module-state">
                <span>No module matches “{query}”</span>
              </div>
            ) : null}

            {groups.map((group) => (
              <section key={group.key} className="dash-library-group">
                <h3>{group.label}</h3>
                <ul>
                  {group.entries.map((entry) => {
                    const Icon = entry.icon
                    const isSelected = selected?.key === entry.key
                    return (
                      <li key={entry.key}>
                        <div
                          className={`dash-library-row ${isSelected ? 'is-selected' : ''} ${
                            entry.kind === 'module' ? 'is-module' : ''
                          } ${dragging === entry.key ? 'is-dragging' : ''}`}
                          draggable
                          onDragStart={(e) => startDrag(e, entry)}
                          onDragEnd={endDrag}
                        >
                          <GripVertical size={12} className="dash-library-grip" aria-hidden="true" />
                          <button
                            type="button"
                            className="dash-library-row-main"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => setSelectedKey(entry.key)}
                          >
                            {Icon ? <Icon size={13} aria-hidden="true" /> : null}
                            <span className="dash-library-row-name">{entry.name}</span>
                            {entry.kind === 'module' ? (
                              <span className="dash-library-row-tag">Configurable</span>
                            ) : null}
                          </button>
                          <button
                            type="button"
                            className="dash-icon-btn"
                            onClick={() => add(entry)}
                            aria-label={`Add ${entry.name}`}
                            title={`Add ${entry.name}`}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>

          <div className="dash-library-preview">
            <ModulePreview entry={selected} onAdd={add} />
          </div>
        </div>
      </aside>
    </div>
  )
}
