/**
 * Dashboard reducer.
 *
 * Every change to a dashboard goes through here, which is what makes undo and
 * redo cheap rather than a rewrite: the reducer is pure, so history is just a
 * stack of previous states. It also keeps the grid honest - the grid reports a
 * layout, the reducer decides what that means for the instances.
 *
 * The shape is `{ past, present, future }` where `present` is the persisted
 * DashboardState. Only `present` is written to storage; history is per-session.
 */

import { newModuleId, buildDefaultDashboard, getPreset } from './defaultDashboard'
import { buildInitialState } from './dashboardStorage'

/** How many steps back the toolbar can walk, bounded so a long session cannot grow without limit. */
const HISTORY_LIMIT = 50

/**
 * Actions that do not represent an editing step.
 *
 * Hydrating from storage, switching dashboards and changing the global pair are
 * all excluded: undo should walk back through layout edits, not undo the act of
 * loading the page or quietly move the user to a dashboard they were not on.
 */
const NON_UNDOABLE = new Set(['hydrate', 'setActiveDashboard', 'setGlobalContext'])

export function initHistory(present = buildInitialState()) {
  return { past: [], present, future: [] }
}

/** Replace the active dashboard via `fn`, leaving the rest of the state alone. */
function updateActive(state, fn) {
  return {
    ...state,
    dashboards: state.dashboards.map((d) =>
      d.id === state.activeId ? { ...fn(d), updatedAt: Date.now() } : d,
    ),
  }
}

/** Replace one module instance inside the active dashboard. */
function updateModule(state, id, fn) {
  return updateActive(state, (d) => ({
    ...d,
    modules: d.modules.map((m) => (m.id === id ? fn(m) : m)),
  }))
}

export function getActiveDashboard(present) {
  return present.dashboards.find((d) => d.id === present.activeId) ?? present.dashboards[0]
}

/**
 * A name no other dashboard is already using.
 *
 * Every new board used to be called "New dashboard", so a third one left the
 * picker listing the same label three times with nothing to choose between
 * them. Numbering from the second occurrence keeps the first name clean.
 *
 * @param {{id:string,name:string}[]} dashboards
 * @param {string} wanted
 * @param {string} [ignoreId] The dashboard being renamed, which may keep its own name.
 */
function uniqueName(dashboards, wanted, ignoreId) {
  const taken = new Set(
    dashboards.filter((d) => d.id !== ignoreId).map((d) => d.name.toLowerCase()),
  )
  if (!taken.has(wanted.toLowerCase())) return wanted

  for (let n = 2; n < 500; n += 1) {
    const candidate = `${wanted} ${n}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  return wanted
}

/**
 * Find a free row for a newly added module.
 *
 * New modules land at the bottom rather than at 0,0. Dropping one into the top
 * left would shove the existing layout down the page every time something was
 * added, which reads as the dashboard rearranging itself.
 */
function nextFreeRow(modules) {
  return modules.reduce((max, m) => Math.max(max, (m.layout?.y ?? 0) + (m.layout?.h ?? 0)), 0)
}

/** @param {{past:any[],present:any,future:any[]}} history */
export function dashboardReducer(history, action) {
  if (action.type === 'undo') {
    if (history.past.length === 0) return history
    const previous = history.past[history.past.length - 1]
    return {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future],
    }
  }

  if (action.type === 'redo') {
    if (history.future.length === 0) return history
    const [next, ...rest] = history.future
    return { past: [...history.past, history.present], present: next, future: rest }
  }

  const present = reducePresent(history.present, action)
  if (present === history.present) return history

  if (NON_UNDOABLE.has(action.type)) {
    return { ...history, present }
  }

  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present,
    // Any new edit abandons the redo branch, which is what every editor does.
    future: [],
  }
}

function reducePresent(state, action) {
  switch (action.type) {
    /* ---------------------------------------------------------------- state */

    case 'hydrate':
      return action.state

    /* ----------------------------------------------------------- dashboards */

    case 'setActiveDashboard':
      return state.dashboards.some((d) => d.id === action.id)
        ? { ...state, activeId: action.id }
        : state

    case 'createDashboard': {
      const preset = action.preset ? getPreset(action.preset) : null
      const dashboard = {
        id: newModuleId('dashboard'),
        name: uniqueName(state.dashboards, action.name || preset?.name || 'New dashboard'),
        preset: preset?.key ?? null,
        globalContext: getActiveDashboard(state)?.globalContext ?? {},
        modules: preset ? preset.build() : [],
        updatedAt: Date.now(),
      }
      return { ...state, dashboards: [...state.dashboards, dashboard], activeId: dashboard.id }
    }

    case 'renameDashboard': {
      const name = String(action.name ?? '').trim()
      // An empty name would leave an unlabelled entry in the picker with no way
      // to tell it from the others, so a blank rename is simply ignored.
      if (!name) return state
      return updateActive(state, (d) => ({
        ...d,
        name: uniqueName(state.dashboards, name, state.activeId),
      }))
    }

    case 'deleteDashboard': {
      // The last dashboard is never deleted - an account with none would have
      // nothing to render and no control to get back from it.
      if (state.dashboards.length <= 1) return state
      const dashboards = state.dashboards.filter((d) => d.id !== action.id)
      const activeId = action.id === state.activeId ? dashboards[0].id : state.activeId
      return { ...state, dashboards, activeId }
    }

    case 'applyPreset': {
      const preset = getPreset(action.preset)
      if (!preset) return state
      return updateActive(state, (d) => ({ ...d, preset: preset.key, modules: preset.build() }))
    }

    case 'resetDashboard': {
      const fresh = buildDefaultDashboard()
      // Keeps the id and name, so a reset restores the layout without the
      // dashboard appearing to have been replaced by a different one.
      return updateActive(state, (d) => ({
        ...d,
        preset: 'default',
        modules: fresh.modules,
        globalContext: fresh.globalContext,
      }))
    }

    /* -------------------------------------------------------------- context */

    case 'setGlobalContext':
      return updateActive(state, (d) => ({
        ...d,
        globalContext: { ...d.globalContext, ...action.patch },
      }))

    /* -------------------------------------------------------------- modules */

    case 'addModule': {
      const { definition, config } = action
      return updateActive(state, (d) => ({
        ...d,
        modules: [
          ...d.modules,
          {
            id: newModuleId(definition.type),
            type: definition.type,
            layout: {
              x: 0,
              y: nextFreeRow(d.modules),
              w: definition.defaultSize.w,
              h: definition.defaultSize.h,
            },
            config: { ...definition.defaultConfig, ...config },
            contextMode: definition.contextAware ? 'global' : 'local',
            locked: false,
            hidden: false,
          },
        ],
      }))
    }

    case 'removeModule':
      return updateActive(state, (d) => ({
        ...d,
        modules: d.modules.filter((m) => m.id !== action.id),
      }))

    case 'duplicateModule': {
      const dashboard = getActiveDashboard(state)
      const source = dashboard?.modules.find((m) => m.id === action.id)
      if (!source) return state
      // The copy takes a fresh id and sits below the original rather than on
      // top of it, so it is visible immediately without hunting for it.
      const copy = {
        ...source,
        id: newModuleId(source.type),
        locked: false,
        layout: { ...source.layout, y: nextFreeRow(dashboard.modules) },
        config: { ...source.config },
      }
      return updateActive(state, (d) => ({ ...d, modules: [...d.modules, copy] }))
    }

    case 'updateModuleConfig':
      return updateModule(state, action.id, (m) => ({
        ...m,
        config: { ...m.config, ...action.patch },
      }))

    case 'setModuleContextMode':
      return updateModule(state, action.id, (m) => ({ ...m, contextMode: action.mode }))

    case 'setModuleLocked':
      return updateModule(state, action.id, (m) => ({ ...m, locked: action.locked }))

    case 'setModuleHidden':
      return updateModule(state, action.id, (m) => ({ ...m, hidden: action.hidden }))

    /* --------------------------------------------------------------- layout */

    case 'applyLayout': {
      // The grid reports every item on every change. Map by id so a module the
      // grid does not know about (a hidden one) keeps its stored position.
      const byId = new Map(action.layout.map((l) => [l.i, l]))
      return updateActive(state, (d) => ({
        ...d,
        modules: d.modules.map((m) => {
          const next = byId.get(m.id)
          if (!next) return m
          const { x, y, w, h } = next
          const same = m.layout.x === x && m.layout.y === y && m.layout.w === w && m.layout.h === h
          return same ? m : { ...m, layout: { x, y, w, h } }
        }),
      }))
    }

    case 'setModuleLayout':
      return updateModule(state, action.id, (m) => ({
        ...m,
        layout: { ...m.layout, ...action.layout },
      }))

    /**
     * Move a module one slot earlier or later by swapping grid slots with its
     * neighbour.
     *
     * This is the non-drag path, and it is not a convenience. Dragging is
     * unusable with a keyboard and awkward on a phone, so moving a module has
     * to be possible without it - the menu and the arrow keys both land here.
     * Swapping whole layout objects rather than nudging coordinates means the
     * result is the same at every breakpoint and can never overlap.
     */
    case 'moveModuleOrder': {
      const dashboard = getActiveDashboard(state)
      const visible = dashboard.modules.filter((m) => !m.hidden)
      const index = visible.findIndex((m) => m.id === action.id)
      if (index < 0) return state

      const target = action.direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= visible.length) return state

      const a = visible[index]
      const b = visible[target]

      return updateActive(state, (d) => {
        const modules = d.modules.map((m) => {
          if (m.id === a.id) return { ...m, layout: { ...b.layout } }
          if (m.id === b.id) return { ...m, layout: { ...a.layout } }
          return m
        })
        // Keep the array in the same order as the slots, so the next move
        // reads the neighbour the user actually sees.
        const ia = modules.findIndex((m) => m.id === a.id)
        const ib = modules.findIndex((m) => m.id === b.id)
        const swapped = [...modules]
        ;[swapped[ia], swapped[ib]] = [swapped[ib], swapped[ia]]
        return { ...d, modules: swapped }
      })
    }

    default:
      return state
  }
}
