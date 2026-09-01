import { useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { listModulesByCategory } from '../registry/moduleRegistry'
import { useDashboardActions } from '../state/DashboardProvider'
import { useEscapeKey } from '../../hooks/useEscapeKey'

/**
 * The add-module drawer.
 *
 * Every card here is generated from a registry entry, so a newly registered
 * module appears in the library without this file being touched. That is the
 * whole test of whether the registry is doing its job.
 */
export default function ModuleLibrary({ open, onClose }) {
  const actions = useDashboardActions()
  const [query, setQuery] = useState('')
  useEscapeKey(open, onClose)

  const groups = useMemo(() => listModulesByCategory(query), [query])

  if (!open) return null

  const add = (definition) => {
    actions.addModule(definition)
    // The drawer stays open. Building a dashboard means adding several modules
    // in a row, and closing after each one would mean reopening and searching
    // again every time.
  }

  return (
    <div className="dash-library-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="dash-library" role="dialog" aria-label="Add a module">
        <header className="dash-library-header">
          <h2>Add module</h2>
          <button type="button" className="dash-icon-btn" onClick={onClose} aria-label="Close module library">
            <X size={15} />
          </button>
        </header>

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
          {groups.length === 0 ? (
            <div className="dash-module-state">
              <span>No module matches “{query}”</span>
            </div>
          ) : null}

          {groups.map((group) => (
            <section key={group.key} className="dash-library-group">
              <h3>{group.label}</h3>
              <div className="dash-library-grid">
                {group.modules.map((def) => {
                  const Icon = def.icon
                  return (
                    <article key={def.type} className="dash-library-card">
                      <div className="dash-library-card-head">
                        {Icon ? <Icon size={15} aria-hidden="true" /> : null}
                        <h4>{def.name}</h4>
                      </div>
                      <p>{def.description}</p>
                      <div className="dash-library-card-foot">
                        <span className="dash-library-size">
                          {def.defaultSize.w}&times;{def.defaultSize.h}
                        </span>
                        <button
                          type="button"
                          className="dash-btn dash-btn-sm dash-btn-primary"
                          onClick={() => add(def)}
                        >
                          <Plus size={12} /> Add
                        </button>
                      </div>
                      {/* Modules with no data source behind them say so here,
                          rather than being added and then showing an empty
                          panel with no explanation. */}
                      {def.unavailableReason ? (
                        <p className="dash-library-note">{def.unavailableReason}</p>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  )
}
