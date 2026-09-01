import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Link2,
  Lock,
  MoreVertical,
  Settings2,
  Trash2,
  Unlock,
} from 'lucide-react'
import { useDismissable } from '../../hooks/useDismissable'
import { useDashboardActions } from '../state/DashboardProvider'

/**
 * The chrome every module wears.
 *
 * Modules render their content and nothing else. Header, title, context badge,
 * menu, and the entire set of customise affordances live here, so adding a
 * module never means reimplementing a Remove button - and so all of them behave
 * the same way when one of them is changed.
 *
 * The header doubles as the drag handle. `dragConfig.cancel` in the grid
 * excludes the action buttons, or opening the menu would start a drag.
 */
export default function ModuleShell({
  instance,
  definition,
  title,
  subtitle,
  customizing,
  onConfigure,
  children,
}) {
  const actions = useDashboardActions()
  const menu = useDismissable()

  const Icon = definition?.icon
  const locked = Boolean(instance.locked)
  const following = instance.contextMode === 'global'
  const configurable = (definition?.configSchema?.length ?? 0) > 0 || definition?.contextAware

  return (
    <section
      className={`dash-module ${locked ? 'is-locked' : ''} ${customizing ? 'is-editing' : ''}`}
      aria-label={title || definition?.name || 'Dashboard module'}
    >
      <header className="dash-module-header">
        <div className="dash-module-title">
          {Icon ? <Icon size={13} aria-hidden="true" /> : null}
          <h3>{title || definition?.name || 'Module'}</h3>
          {subtitle ? <span className="dash-module-subtitle">{subtitle}</span> : null}
        </div>

        <div className="dash-module-actions">
          {/* The context badge is the answer to "why did this change when I
              changed the pair?" - it is shown at all times, not only while
              customising, because that question is asked while reading. */}
          {following ? (
            <span className="dash-module-badge" title="Following the dashboard pair">
              <Link2 size={11} aria-hidden="true" />
              <span className="dash-sr-only">Following the dashboard context</span>
            </span>
          ) : null}

          {locked ? (
            <span className="dash-module-badge" title="Position locked">
              <Lock size={11} aria-hidden="true" />
            </span>
          ) : null}

          {configurable ? (
            <button
              type="button"
              className="dash-icon-btn"
              onClick={onConfigure}
              aria-label={`Configure ${definition?.name ?? 'module'}`}
              title="Configure"
            >
              <Settings2 size={13} />
            </button>
          ) : null}

          <div className="dash-menu-wrap" ref={menu.wrapRef}>
            <button
              type="button"
              ref={menu.buttonRef}
              className="dash-icon-btn"
              onClick={menu.toggle}
              aria-haspopup="menu"
              aria-expanded={menu.open}
              aria-label={`${definition?.name ?? 'Module'} options`}
              title="Options"
            >
              <MoreVertical size={13} />
            </button>

            {menu.open ? (
              <div className="dash-menu" role="menu" ref={menu.floatRef}>
                {configurable ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      menu.close()
                      onConfigure?.()
                    }}
                  >
                    <Settings2 size={13} /> Configure
                  </button>
                ) : null}

                {/* The keyboard and touch route to moving a module. Dragging
                    is the fast path, not the only one. */}
                <button
                  type="button"
                  role="menuitem"
                  disabled={locked}
                  onClick={() => actions.moveModuleOrder(instance.id, 'up')}
                >
                  <ArrowUp size={13} /> Move earlier
                </button>

                <button
                  type="button"
                  role="menuitem"
                  disabled={locked}
                  onClick={() => actions.moveModuleOrder(instance.id, 'down')}
                >
                  <ArrowDown size={13} /> Move later
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    menu.close()
                    actions.duplicateModule(instance.id)
                  }}
                >
                  <Copy size={13} /> Duplicate
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    menu.close()
                    actions.setModuleLocked(instance.id, !locked)
                  }}
                >
                  {locked ? <Unlock size={13} /> : <Lock size={13} />}
                  {locked ? 'Unlock position' : 'Lock position'}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    menu.close()
                    actions.setModuleHidden(instance.id, !instance.hidden)
                  }}
                >
                  {instance.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                  {instance.hidden ? 'Show' : 'Hide'}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="dash-menu-danger"
                  onClick={() => {
                    menu.close()
                    actions.removeModule(instance.id)
                  }}
                >
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="dash-module-body">{children}</div>
    </section>
  )
}
