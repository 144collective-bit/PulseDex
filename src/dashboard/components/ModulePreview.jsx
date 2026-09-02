import { useMemo } from 'react'
import { Plus, GripVertical } from 'lucide-react'
import ModuleErrorBoundary from './ModuleErrorBoundary'
import { ModuleUnavailable } from './ModuleStates'

/**
 * A library entry, rendered for real.
 *
 * The catalogue used to be a name and a sentence, which is a poor basis for
 * choosing: "Top movers" and "Rankings" describe a shape, not what you would
 * actually see. This renders the module itself with live data, so the choice is
 * made by looking rather than by inferring.
 *
 * One at a time, deliberately. Rendering all forty-odd entries as live tiles
 * would mount forty modules - each with its own queries, and several with their
 * own chart canvases - to fill a drawer, and at card size a table or a chart is
 * illegible anyway. A single large preview costs one module and is actually
 * readable.
 *
 * The preview is inert. It takes no pointer events, so clicking a row inside a
 * watchlist preview cannot change the dashboard behind the drawer, and the
 * module's own menus are absent because there is no instance to act on.
 */
export default function ModulePreview({ entry, onAdd }) {
  /*
   * A synthetic instance, keyed off the entry so switching selection remounts
   * rather than feeding new config into a module that thinks it is the old one.
   */
  const instance = useMemo(
    () =>
      entry
        ? {
            id: `preview-${entry.key}`,
            type: entry.definition.type,
            layout: { x: 0, y: 0, ...entry.size },
            config: { ...entry.definition.defaultConfig, ...entry.config },
            contextMode: 'local',
            locked: false,
            hidden: false,
          }
        : null,
    [entry],
  )

  if (!entry || !instance) {
    return (
      <div className="dash-preview dash-preview-empty">
        <p>Select a module to see it here.</p>
      </div>
    )
  }

  const Component = entry.definition.component
  const Icon = entry.icon

  return (
    <div className="dash-preview">
      <header className="dash-preview-head">
        <div className="dash-preview-title">
          {Icon ? <Icon size={16} aria-hidden="true" /> : null}
          <h3>{entry.name}</h3>
        </div>
        <p>{entry.description}</p>
      </header>

      <div className="dash-preview-stage" aria-hidden="true">
        {/* Sized to the module's own default footprint so the preview is a fair
            impression of what lands on the canvas, not a squeezed version. */}
        <div className="dash-preview-frame">
          <ModuleErrorBoundary moduleType={entry.definition.type} resetKey={entry.key}>
            {entry.unavailableReason ? (
              <ModuleUnavailable reason={entry.unavailableReason} />
            ) : (
              <Component
                instance={instance}
                config={instance.config}
                context={{ asset: null, pair: null, following: false }}
              />
            )}
          </ModuleErrorBoundary>
        </div>
      </div>

      <footer className="dash-preview-foot">
        <span className="dash-preview-meta">
          {entry.kind === 'module'
            ? 'Generic module — configure it after adding'
            : `${entry.size.w}×${entry.size.h} on the grid`}
        </span>
        <span className="dash-preview-actions">
          <span className="dash-preview-hint">
            <GripVertical size={12} aria-hidden="true" /> or drag it onto the dashboard
          </span>
          <button type="button" className="dash-btn dash-btn-primary" onClick={() => onAdd(entry)}>
            <Plus size={13} /> Add
          </button>
        </span>
      </footer>
    </div>
  )
}
