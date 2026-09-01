import { useState } from 'react'
import {
  Check,
  LayoutGrid,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Settings2,
  Undo2,
} from 'lucide-react'
import { useDashboardActions, useDashboardState } from '../state/DashboardProvider'
import { DASHBOARD_PRESETS } from '../state/defaultDashboard'
import { useDismissable } from '../../hooks/useDismissable'

/**
 * The dashboard's own controls.
 *
 * Normal mode shows almost nothing: which dashboard is open, and the button
 * that starts editing. Everything else appears only while customising, because
 * a page whose purpose is reading numbers should not be wearing a toolbar full
 * of editing controls while they are being read.
 */
export default function DashboardToolbar({ onAddModule }) {
  const { dashboard, dashboards, customizing, saveState, canUndo, canRedo } = useDashboardState()
  const actions = useDashboardActions()
  const presets = useDismissable()
  const picker = useDismissable()
  const [confirmingReset, setConfirmingReset] = useState(false)

  /*
   * Renaming happens in place, where the name already is.
   *
   * Without it every board someone created was called "New dashboard" - the
   * reducer could rename, but nothing in the interface ever called it, so the
   * picker filled up with identical entries.
   */
  const [renaming, setRenaming] = useState(null)

  const commitRename = () => {
    if (renaming !== null) actions.renameDashboard(renaming)
    setRenaming(null)
  }

  const save = () => {
    actions.save()
    actions.setCustomizing(false)
  }

  return (
    <div className={`dash-toolbar ${customizing ? 'is-customizing' : ''}`}>
      <div className="dash-toolbar-left">
        <div className="dash-menu-wrap" ref={picker.wrapRef}>
          {renaming !== null ? (
            <input
              autoFocus
              type="text"
              className="dash-input dash-rename"
              value={renaming}
              aria-label="Dashboard name"
              onChange={(e) => setRenaming(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <button
              type="button"
              ref={picker.buttonRef}
              className="dash-dashboard-picker"
              onClick={picker.toggle}
              aria-haspopup="menu"
              aria-expanded={picker.open}
            >
              <LayoutGrid size={14} aria-hidden="true" />
              <span>{dashboard?.name ?? 'Dashboard'}</span>
            </button>
          )}

          {picker.open ? (
            <div className="dash-menu" role="menu" ref={picker.floatRef}>
              {dashboards.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={d.id === dashboard?.id}
                  onClick={() => {
                    picker.close()
                    actions.setActiveDashboard(d.id)
                  }}
                >
                  {d.id === dashboard?.id ? <Check size={13} /> : <span className="dash-menu-gap" />}
                  {d.name}
                </button>
              ))}
              <div className="dash-menu-sep" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  picker.close()
                  // Not "New dashboard": that is the label of this very button,
                  // and a board carrying it sat directly above the action that
                  // made it, with nothing to tell the two apart.
                  actions.createDashboard('Dashboard')
                }}
              >
                <Plus size={13} /> New dashboard
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  picker.close()
                  setRenaming(dashboard?.name ?? '')
                }}
              >
                <Pencil size={13} /> Rename
              </button>
              {dashboards.length > 1 ? (
                <button
                  type="button"
                  role="menuitem"
                  className="dash-menu-danger"
                  onClick={() => {
                    picker.close()
                    actions.deleteDashboard(dashboard.id)
                  }}
                >
                  Delete this dashboard
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Saving is automatic, so this reports rather than instructs. A button
            that looked like the only way to keep a layout would be a lie. */}
        <span className={`dash-save-state dash-save-${saveState}`} aria-live="polite">
          {saveState === 'saving' ? 'Saving…' : null}
          {saveState === 'saved' ? 'Saved' : null}
          {saveState === 'error' ? 'Could not save to this browser' : null}
        </span>
      </div>

      <div className="dash-toolbar-right">
        {customizing ? (
          <>
            <button
              type="button"
              className="dash-btn"
              onClick={actions.undo}
              disabled={!canUndo}
              aria-label="Undo"
              title="Undo"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              className="dash-btn"
              onClick={actions.redo}
              disabled={!canRedo}
              aria-label="Redo"
              title="Redo"
            >
              <Redo2 size={14} />
            </button>

            <div className="dash-menu-wrap" ref={presets.wrapRef}>
              <button
                type="button"
                ref={presets.buttonRef}
                className="dash-btn"
                onClick={presets.toggle}
                aria-haspopup="menu"
                aria-expanded={presets.open}
              >
                Presets
              </button>
              {presets.open ? (
                <div className="dash-menu dash-menu-wide" role="menu" ref={presets.floatRef}>
                  {DASHBOARD_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        presets.close()
                        actions.applyPreset(p.key)
                      }}
                    >
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.description}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button type="button" className="dash-btn dash-btn-primary" onClick={onAddModule}>
              <Plus size={14} /> Add module
            </button>

            {/* Reset asks first. It throws away an arrangement someone built by
                hand, and undo is a poor safety net for an action taken by
                mistake at the end of a session. */}
            {confirmingReset ? (
              <span className="dash-confirm">
                <span>Reset to the default layout?</span>
                <button
                  type="button"
                  className="dash-btn dash-btn-sm dash-btn-danger"
                  onClick={() => {
                    actions.resetDashboard()
                    setConfirmingReset(false)
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="dash-btn dash-btn-sm"
                  onClick={() => setConfirmingReset(false)}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="dash-btn" onClick={() => setConfirmingReset(true)}>
                <RotateCcw size={14} /> Reset
              </button>
            )}

            <button type="button" className="dash-btn dash-btn-primary" onClick={save}>
              <Save size={14} /> Done
            </button>
          </>
        ) : (
          <button
            type="button"
            className="dash-btn"
            onClick={() => actions.setCustomizing(true)}
          >
            <Settings2 size={14} /> Customize
          </button>
        )}
      </div>
    </div>
  )
}
