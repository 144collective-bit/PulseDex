/**
 * Dashboard persistence.
 *
 * This is deliberately a thin seam. Everything above it works in terms of
 * `loadDashboardState` / `saveDashboardState`, so replacing localStorage with a
 * real backend later is a change to this file and nothing else. PulseDEX has no
 * database today - `api/auth/*` issues a session cookie and stores nothing - so
 * the store is the browser, scoped to the signed-in wallet the same way the
 * profile and watchlist already are.
 *
 * Scoping matters here for the same reason it matters there: a dashboard says
 * what someone watches and trades, and that should not greet the next person to
 * sign in on a shared machine.
 */

import { readScoped, writeScoped } from '../../utils/profileStorage'
import { buildDefaultDashboard } from './defaultDashboard'

const STORAGE_KEY = 'dashboards'

/** Bump when a shape change needs `migrate` to do something. */
export const DASHBOARD_STATE_VERSION = 1

/** @typedef {import('../types/dashboard.js').DashboardState} DashboardState */

/** A fresh account's starting point: one dashboard, the default layout. */
export function buildInitialState() {
  const dashboard = buildDefaultDashboard()
  return {
    version: DASHBOARD_STATE_VERSION,
    dashboards: [dashboard],
    activeId: dashboard.id,
  }
}

/**
 * Drop anything that is not a usable dashboard.
 *
 * Saved state is user-editable in devtools and survives across deploys, so it
 * is treated as untrusted input. A malformed entry is discarded rather than
 * repaired - a half-valid dashboard renders as a screen of broken modules,
 * which is harder to recover from than a reset.
 */
function isUsableDashboard(d) {
  return (
    d &&
    typeof d.id === 'string' &&
    typeof d.name === 'string' &&
    Array.isArray(d.modules) &&
    d.modules.every(
      (m) => m && typeof m.id === 'string' && typeof m.type === 'string' && m.layout,
    )
  )
}

/**
 * Bring a stored blob up to the current version.
 *
 * There is only one version so far, so this just guards the shape. It exists
 * now rather than later because retrofitting a migration path after users have
 * saved dashboards means guessing what they saved.
 *
 * @param {unknown} raw
 * @returns {DashboardState | null}
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return null

  const dashboards = Array.isArray(raw.dashboards) ? raw.dashboards.filter(isUsableDashboard) : []
  if (dashboards.length === 0) return null

  const activeId = dashboards.some((d) => d.id === raw.activeId) ? raw.activeId : dashboards[0].id

  return {
    version: DASHBOARD_STATE_VERSION,
    dashboards: dashboards.map((d) => ({
      preset: null,
      globalContext: {},
      ...d,
      modules: d.modules.map((m) => ({
        config: {},
        contextMode: 'local',
        locked: false,
        hidden: false,
        ...m,
      })),
    })),
    activeId,
  }
}

/**
 * Read this account's dashboards, falling back to the default layout.
 *
 * Never returns null. A new user, a cleared browser and a corrupted blob all
 * land on the same polished starting dashboard rather than an empty canvas.
 *
 * @param {string | null} account
 * @returns {DashboardState}
 */
export function loadDashboardState(account) {
  const stored = readScoped(STORAGE_KEY, account, null)
  return migrate(stored) ?? buildInitialState()
}

/**
 * Persist. Returns false if the browser refused the write (quota, private
 * mode), which the caller surfaces rather than silently losing a layout.
 *
 * @param {string | null} account
 * @param {DashboardState} state
 */
export function saveDashboardState(account, state) {
  return writeScoped(STORAGE_KEY, account, state)
}
