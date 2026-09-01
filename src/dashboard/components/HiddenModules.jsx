import { Eye, Trash2 } from 'lucide-react'
import { getModuleDefinition } from '../registry/moduleRegistry'
import { useDashboardActions, useDashboardState } from '../state/DashboardProvider'

/**
 * The way back from Hide.
 *
 * Hiding a module removes it from the canvas but keeps it in the dashboard, so
 * without somewhere to see hidden modules the difference between Hide and
 * Remove is invisible - and a user who hid something has no way to get it back.
 * Shown only while customising, since that is the only time it is relevant.
 */
export default function HiddenModules() {
  const { dashboard } = useDashboardState()
  const actions = useDashboardActions()

  const hidden = (dashboard?.modules ?? []).filter((m) => m.hidden)
  if (hidden.length === 0) return null

  return (
    <section className="dash-hidden" aria-label="Hidden modules">
      <h3>Hidden modules</h3>
      <ul>
        {hidden.map((m) => {
          const def = getModuleDefinition(m.type)
          return (
            <li key={m.id}>
              <span>{def?.name ?? m.type}</span>
              <button
                type="button"
                className="dash-btn dash-btn-sm"
                onClick={() => actions.setModuleHidden(m.id, false)}
              >
                <Eye size={12} /> Show
              </button>
              <button
                type="button"
                className="dash-btn dash-btn-sm dash-btn-danger"
                onClick={() => actions.removeModule(m.id)}
              >
                <Trash2 size={12} /> Remove
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
