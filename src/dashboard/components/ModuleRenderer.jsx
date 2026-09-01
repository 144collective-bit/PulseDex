import { memo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { getModuleDefinition } from '../registry/moduleRegistry'
import { useDashboardActions, useModuleContext } from '../state/DashboardProvider'
import ModuleShell from './ModuleShell'
import ModuleErrorBoundary from './ModuleErrorBoundary'
import { ModuleUnavailable } from './ModuleStates'

/**
 * Turn one stored instance into a rendered module.
 *
 * This is the only place that maps a `type` string to a component, which is
 * what keeps the grid, the toolbar and the reducer free of any knowledge about
 * individual modules.
 */

/**
 * A saved instance whose type is no longer registered.
 *
 * Renaming or retiring a module type orphans instances that people have saved.
 * Rendering nothing would leave a mysterious gap in the layout with no way to
 * clear it, so the placeholder says what happened and offers the one action
 * that helps.
 */
function MissingModule({ instance }) {
  const actions = useDashboardActions()
  return (
    <section className="dash-module dash-module-missing">
      <header className="dash-module-header">
        <div className="dash-module-title">
          <AlertTriangle size={13} aria-hidden="true" />
          <h3>Unknown module</h3>
        </div>
      </header>
      <div className="dash-module-body">
        <div className="dash-module-state">
          <span>
            This dashboard refers to a module type (<code>{instance.type}</code>) that no longer
            exists.
          </span>
          <button
            type="button"
            className="dash-btn dash-btn-sm"
            onClick={() => actions.removeModule(instance.id)}
          >
            Remove it
          </button>
        </div>
      </div>
    </section>
  )
}

function ModuleRendererInner({ instance, customizing, onConfigure }) {
  const definition = getModuleDefinition(instance.type)
  const context = useModuleContext(instance)

  if (!definition) return <MissingModule instance={instance} />

  const Component = definition.component
  const title = definition.getTitle?.({ instance, context, definition }) ?? definition.name
  const subtitle = definition.getSubtitle?.({ instance, context, definition })

  return (
    <ModuleShell
      instance={instance}
      definition={definition}
      title={title}
      subtitle={subtitle}
      customizing={customizing}
      onConfigure={() => onConfigure(instance.id)}
    >
      {/* The boundary sits inside the shell, so a module that throws loses its
          content but keeps its header - and therefore keeps the menu that can
          remove it. A boundary around the whole shell would strand the user
          with a dead tile and no controls. */}
      <ModuleErrorBoundary moduleType={instance.type} resetKey={JSON.stringify(instance.config)}>
        {definition.unavailableReason ? (
          <ModuleUnavailable reason={definition.unavailableReason} />
        ) : (
          <Component instance={instance} config={instance.config} context={context} />
        )}
      </ModuleErrorBoundary>
    </ModuleShell>
  )
}

/**
 * Memoised on the instance.
 *
 * The grid re-renders its whole child list on every drag frame. Without this,
 * dragging one module would re-run every other module's body on every
 * mousemove, which is exactly the "unnecessary global rerender" a canvas of
 * dozens of modules cannot afford.
 */
export default memo(ModuleRendererInner)
