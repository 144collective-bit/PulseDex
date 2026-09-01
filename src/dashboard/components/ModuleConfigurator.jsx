import { X } from 'lucide-react'
import { getModuleDefinition } from '../registry/moduleRegistry'
import { useDashboardActions, useDashboardState } from '../state/DashboardProvider'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import TokenSelector from './TokenSelector'
import PairSelector from './PairSelector'

/**
 * One configuration panel for every module.
 *
 * Modules declare `configSchema` and this renders it. The alternative -
 * each module shipping its own settings form - is what turns "add a module"
 * back into a day of work, and guarantees that fifteen modules end up with
 * fifteen slightly different ideas of what a dropdown looks like.
 *
 * Changes apply immediately rather than on a Save press. The panel sits beside
 * the live module, so the effect of a change is visible while making it, and
 * undo already covers the "put it back" case.
 */

function Field({ field, value, onChange }) {
  const id = `cfg-${field.key}`

  switch (field.type) {
    case 'token':
      return (
        <label className="dash-field" htmlFor={id}>
          <span className="dash-field-label">{field.label}</span>
          <TokenSelector label={field.label} value={value ?? null} onChange={onChange} />
          {field.help ? <span className="dash-field-help">{field.help}</span> : null}
        </label>
      )

    case 'pair':
      return (
        <div className="dash-field">
          <span className="dash-field-label">{field.label}</span>
          <PairSelector value={value ?? null} onChange={onChange} />
          {field.help ? <span className="dash-field-help">{field.help}</span> : null}
        </div>
      )

    case 'select':
      return (
        <label className="dash-field" htmlFor={id}>
          <span className="dash-field-label">{field.label}</span>
          <select
            id={id}
            className="dash-input"
            value={value ?? field.options?.[0]?.value ?? ''}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {field.help ? <span className="dash-field-help">{field.help}</span> : null}
        </label>
      )

    case 'number':
      return (
        <label className="dash-field" htmlFor={id}>
          <span className="dash-field-label">{field.label}</span>
          <input
            id={id}
            type="number"
            className="dash-input"
            value={value ?? ''}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            onChange={(e) => {
              const n = Number(e.target.value)
              onChange(Number.isFinite(n) ? n : undefined)
            }}
          />
          {field.help ? <span className="dash-field-help">{field.help}</span> : null}
        </label>
      )

    case 'toggle':
      return (
        <label className="dash-field dash-field-inline" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="dash-field-label">{field.label}</span>
          {field.help ? <span className="dash-field-help">{field.help}</span> : null}
        </label>
      )

    case 'text':
    default:
      return (
        <label className="dash-field" htmlFor={id}>
          <span className="dash-field-label">{field.label}</span>
          <input
            id={id}
            type="text"
            className="dash-input"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.help ? <span className="dash-field-help">{field.help}</span> : null}
        </label>
      )
  }
}

export default function ModuleConfigurator({ moduleId, onClose }) {
  const { dashboard } = useDashboardState()
  const actions = useDashboardActions()
  useEscapeKey(Boolean(moduleId), onClose)

  const instance = dashboard?.modules.find((m) => m.id === moduleId)
  const definition = instance ? getModuleDefinition(instance.type) : null

  if (!instance || !definition) return null

  const following = instance.contextMode === 'global'

  return (
    <aside className="dash-config" role="dialog" aria-label={`${definition.name} settings`}>
      <header className="dash-config-header">
        <h2>{definition.name} settings</h2>
        <button type="button" className="dash-icon-btn" onClick={onClose} aria-label="Close settings">
          <X size={15} />
        </button>
      </header>

      <div className="dash-config-body">
        <p className="dash-config-desc">{definition.description}</p>

        {definition.contextAware ? (
          <label className="dash-field dash-field-inline" htmlFor="cfg-follow">
            <input
              id="cfg-follow"
              type="checkbox"
              checked={following}
              onChange={(e) =>
                actions.setModuleContextMode(instance.id, e.target.checked ? 'global' : 'local')
              }
            />
            <span className="dash-field-label">Follow the dashboard context</span>
            <span className="dash-field-help">
              On, this module shows whatever the toolbar is set to. Off, it keeps its own selection
              below and ignores the toolbar.
            </span>
          </label>
        ) : null}

        {/* Fields that pick an asset are pointless while the module is
            following the toolbar - they would be edited and have no effect.
            They stay visible but disabled, so the reason is obvious. */}
        <fieldset
          className="dash-config-fields"
          disabled={following && definition.contextKind !== null}
        >
          {definition.configSchema.map((field) => (
            <Field
              key={field.key}
              field={field}
              value={instance.config[field.key]}
              onChange={(v) => actions.updateModuleConfig(instance.id, { [field.key]: v })}
            />
          ))}
        </fieldset>
      </div>
    </aside>
  )
}
