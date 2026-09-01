import { AlertTriangle, Inbox, Loader2, PlugZap } from 'lucide-react'

/**
 * The four states every module body can be in.
 *
 * They live here rather than in each module so that a dashboard of a dozen
 * modules does not show a dozen different ideas of what "loading" looks like.
 * A module renders its content; if it has none yet, it renders one of these.
 */

export function ModuleLoading({ label = 'Loading' }) {
  return (
    <div className="dash-module-state" role="status" aria-live="polite">
      <Loader2 size={16} className="dash-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ModuleEmpty({ label = 'No data available', hint }) {
  return (
    <div className="dash-module-state">
      <Inbox size={16} aria-hidden="true" />
      <span>{label}</span>
      {hint ? <p className="dash-module-state-hint">{hint}</p> : null}
    </div>
  )
}

/**
 * A module that could not load its data.
 *
 * Always offers a retry. A failed request on a free public API is usually a
 * rate limit rather than a real outage, and the fix is to ask again.
 */
export function ModuleError({ label = 'Unable to load data', onRetry, detail }) {
  return (
    <div className="dash-module-state dash-module-state-error" role="alert">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>{label}</span>
      {detail ? <p className="dash-module-state-hint">{detail}</p> : null}
      {onRetry ? (
        <button type="button" className="dash-btn dash-btn-sm" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}

/**
 * A module whose data source does not exist yet.
 *
 * Distinct from an error on purpose. An error means "this should work and did
 * not"; this means "nothing is wired up behind this, and no number you see here
 * would be real". Modules in this state show the reason rather than a plausible
 * looking figure.
 */
export function ModuleUnavailable({ reason }) {
  return (
    <div className="dash-module-state">
      <PlugZap size={16} aria-hidden="true" />
      <span>Not connected</span>
      <p className="dash-module-state-hint">{reason}</p>
    </div>
  )
}
