import { useMemo } from 'react'
import { getModuleDefinition } from '../registry/moduleRegistry'
import { DASHBOARD_PRESETS, GRID_COLS } from '../state/defaultDashboard'
import { useDashboardActions } from '../state/DashboardProvider'

/**
 * The starting desk, offered once.
 *
 * Five ready-made dashboards already existed, and nobody was ever going to find
 * them: they lived behind Customize, then a Presets menu, which is two
 * deliberate steps into an editing mode a new user has no reason to enter. So a
 * first visit asks the question directly instead of silently applying the
 * default and hoping.
 *
 * Shown only when this account has never saved a dashboard, and dismissable
 * without choosing - the default is a perfectly good answer.
 */

/**
 * A preset drawn as its own layout.
 *
 * The thumbnail is generated from the modules the preset actually places rather
 * than being an illustration of it, so it cannot drift out of step with what
 * choosing it produces. Blocks are positioned as percentages of the same
 * twelve-column grid the real canvas uses.
 */
function LayoutThumb({ modules }) {
  const rows = useMemo(
    () => modules.reduce((max, m) => Math.max(max, m.layout.y + m.layout.h), 0) || 1,
    [modules],
  )

  return (
    <div className="dash-desk-thumb" aria-hidden="true">
      {modules.map((m) => {
        const def = getModuleDefinition(m.type)
        return (
          <span
            key={m.id}
            className="dash-desk-block"
            title={def?.name}
            style={{
              left: `${(m.layout.x / GRID_COLS) * 100}%`,
              width: `${(m.layout.w / GRID_COLS) * 100}%`,
              top: `${(m.layout.y / rows) * 100}%`,
              height: `${(m.layout.h / rows) * 100}%`,
            }}
          />
        )
      })}
    </div>
  )
}

export default function DeskChooser() {
  const actions = useDashboardActions()

  /* Built once: each preset's `build()` mints fresh module ids, and rebuilding
     on every render would give React a new key for every block each time. */
  const desks = useMemo(
    () => DASHBOARD_PRESETS.map((preset) => ({ ...preset, modules: preset.build() })),
    [],
  )

  const choose = (key) => {
    // 'default' is already what is loaded, so applying it would be a no-op that
    // still counted as an edit in the undo history.
    if (key !== 'default') actions.applyPreset(key)
    actions.dismissFirstVisit()
  }

  return (
    <div className="dash-desk-backdrop" role="dialog" aria-label="Choose a starting dashboard">
      <div className="dash-desk">
        <header className="dash-desk-header">
          <h2>Start with a desk</h2>
          <p>
            Pick a layout to begin from. Every one of them is fully editable afterwards, and you can
            switch or reset at any time.
          </p>
        </header>

        <div className="dash-desk-grid">
          {desks.map((desk) => (
            <button
              key={desk.key}
              type="button"
              className="dash-desk-card"
              onClick={() => choose(desk.key)}
            >
              <LayoutThumb modules={desk.modules} />
              <span className="dash-desk-name">{desk.name}</span>
              <span className="dash-desk-desc">{desk.description}</span>
              <span className="dash-desk-count">
                {desk.modules.length} module{desk.modules.length === 1 ? '' : 's'}
              </span>
            </button>
          ))}
        </div>

        <footer className="dash-desk-foot">
          <button type="button" className="dash-btn" onClick={() => actions.dismissFirstVisit()}>
            Skip, use the default
          </button>
        </footer>
      </div>
    </div>
  )
}
