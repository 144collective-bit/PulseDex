import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { dashboardReducer, initHistory, getActiveDashboard } from './dashboardReducer'
import { hasSavedDashboards, loadDashboardState, saveDashboardState } from './dashboardStorage'

/**
 * Dashboard state provider.
 *
 * Deliberately a context over a reducer rather than another state library.
 * PulseDEX already carries React Query for server state and plain context for
 * session and profile; a third opinion about client state would be a new
 * convention for one page to follow.
 *
 * What lives here is the *layout* - which modules exist, where they sit, how
 * they are configured, and what the shared context is. What does not live here
 * is any market data: that stays in React Query so modules asking the same
 * question share one request rather than one each.
 */

const DashboardStateContext = createContext(null)
const DashboardActionsContext = createContext(null)

/**
 * State and actions are separate contexts on purpose.
 *
 * The actions object is stable for the life of the provider, so a component
 * that only dispatches - a menu, a toolbar button - does not re-render every
 * time a module moves. With dozens of modules on a canvas that difference is
 * the difference between a smooth drag and a stuttering one.
 */
export function DashboardProvider({ children }) {
  const { account } = useSiweAuth()

  const [history, dispatch] = useReducer(dashboardReducer, undefined, () => initHistory())
  const [customizing, setCustomizing] = useState(false)
  const [saveState, setSaveState] = useState('saved')

  /*
   * Whether this account has never saved a dashboard, which is what the desk
   * chooser keys off. Read from storage rather than inferred from the state:
   * once hydrated, a default layout and a saved one look identical, so a
   * returning user would otherwise be asked to choose a desk on every visit.
   */
  const [isFirstVisit, setIsFirstVisit] = useState(false)

  /*
   * Storage is scoped per account, so switching wallets has to load that
   * account's dashboards rather than carry the previous one across. `hydrated`
   * guards the autosave below: without it the first render after a switch would
   * write the outgoing account's layout into the incoming account's key.
   */
  const hydratedFor = useRef(undefined)

  useEffect(() => {
    hydratedFor.current = undefined
    setIsFirstVisit(!hasSavedDashboards(account))
    dispatch({ type: 'hydrate', state: loadDashboardState(account) })
    hydratedFor.current = account ?? null
    setSaveState('saved')
  }, [account])

  /*
   * Autosave, debounced.
   *
   * The dashboard has to survive a refresh without the user having thought
   * about saving - that is the whole promise of a persisted layout - so this
   * runs on every change rather than waiting for a button. The Save control in
   * the toolbar flushes immediately instead of being the only path.
   */
  const present = history.present
  useEffect(() => {
    if (hydratedFor.current === undefined) return
    if (hydratedFor.current !== (account ?? null)) return

    setSaveState('saving')
    const id = window.setTimeout(() => {
      const ok = saveDashboardState(account, present)
      setSaveState(ok ? 'saved' : 'error')
    }, 500)

    return () => window.clearTimeout(id)
  }, [present, account])

  const flush = useCallback(() => {
    const ok = saveDashboardState(account, present)
    setSaveState(ok ? 'saved' : 'error')
    return ok
  }, [account, present])

  const dashboard = getActiveDashboard(present)

  const state = useMemo(
    () => ({
      dashboard,
      dashboards: present.dashboards,
      activeId: present.activeId,
      globalContext: dashboard?.globalContext ?? {},
      customizing,
      saveState,
      isFirstVisit,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    }),
    [
      dashboard,
      present,
      customizing,
      saveState,
      isFirstVisit,
      history.past.length,
      history.future.length,
    ],
  )

  const actions = useMemo(
    () => ({
      /* layout */
      applyLayout: (layout) => dispatch({ type: 'applyLayout', layout }),
      setModuleLayout: (id, layout) => dispatch({ type: 'setModuleLayout', id, layout }),
      moveModuleOrder: (id, direction) => dispatch({ type: 'moveModuleOrder', id, direction }),

      /* modules */
      // Options rather than three positional extras: callers set some of
      // config, layout and contextMode and never all three.
      addModule: (definition, options = {}) =>
        dispatch({ type: 'addModule', definition, ...options }),
      removeModule: (id) => dispatch({ type: 'removeModule', id }),
      duplicateModule: (id) => dispatch({ type: 'duplicateModule', id }),
      updateModuleConfig: (id, patch) => dispatch({ type: 'updateModuleConfig', id, patch }),
      setModuleContextMode: (id, mode) => dispatch({ type: 'setModuleContextMode', id, mode }),
      setModuleLocked: (id, locked) => dispatch({ type: 'setModuleLocked', id, locked }),
      setModuleHidden: (id, hidden) => dispatch({ type: 'setModuleHidden', id, hidden }),

      /* dashboards */
      createDashboard: (name, preset) => dispatch({ type: 'createDashboard', name, preset }),
      renameDashboard: (name) => dispatch({ type: 'renameDashboard', name }),
      deleteDashboard: (id) => dispatch({ type: 'deleteDashboard', id }),
      setActiveDashboard: (id) => dispatch({ type: 'setActiveDashboard', id }),
      applyPreset: (preset) => dispatch({ type: 'applyPreset', preset }),
      resetDashboard: () => dispatch({ type: 'resetDashboard' }),

      /* context */
      setGlobalContext: (patch) => dispatch({ type: 'setGlobalContext', patch }),

      /* history */
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),

      /* session */
      setCustomizing,
      dismissFirstVisit: () => setIsFirstVisit(false),
      save: flush,
    }),
    [flush],
  )

  return (
    <DashboardStateContext.Provider value={state}>
      <DashboardActionsContext.Provider value={actions}>{children}</DashboardActionsContext.Provider>
    </DashboardStateContext.Provider>
  )
}

export function useDashboardState() {
  const ctx = useContext(DashboardStateContext)
  if (!ctx) throw new Error('useDashboardState must be used inside <DashboardProvider>')
  return ctx
}

export function useDashboardActions() {
  const ctx = useContext(DashboardActionsContext)
  if (!ctx) throw new Error('useDashboardActions must be used inside <DashboardProvider>')
  return ctx
}

/**
 * Resolve the asset and pair a single module should be showing.
 *
 * This is the join between the two halves of the context requirement: a module
 * set to `global` reads the dashboard's shared selection, one set to `local`
 * reads its own config. Modules never look at the global context directly -
 * they call this and get an answer, which is what lets the same component serve
 * both modes without knowing that either exists.
 *
 * @param {import('../types/dashboard.js').DashboardModuleInstance} instance
 */
export function useModuleContext(instance) {
  const { globalContext } = useDashboardState()

  return useMemo(() => {
    const local = instance?.config ?? {}
    if (instance?.contextMode === 'global') {
      return {
        asset: globalContext.asset ?? local.token ?? null,
        pair: globalContext.pair ?? local.pair ?? null,
        following: true,
      }
    }
    return { asset: local.token ?? null, pair: local.pair ?? null, following: false }
  }, [instance?.contextMode, instance?.config, globalContext])
}
