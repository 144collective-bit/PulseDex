import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { isChunkLoadError } from '../utils/lazyRetry'

/**
 * The last thing between a thrown error and a white screen.
 *
 * React unmounts the whole tree when nothing catches a throw. For a page made
 * of lazily-imported tabs that is not a theoretical risk: a tab held open
 * across a deployment asks for chunk files the domain has already replaced,
 * the import rejects, and the app disappears - no message, no reload button,
 * nothing to tell the reader the page is not simply broken forever.
 *
 * src/utils/lazyRetry.js handles the common case before it gets here, by
 * retrying and then reloading. This catches what is left: a second failure
 * after a reload already happened, and any ordinary render error in a tab.
 * Either way the shell around it - the nav, the ticker, the account menu -
 * stays up, so the reader can go somewhere else without reaching for the
 * browser's own reload.
 */
export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, resetKey: props.resetKey }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  /**
   * Clear the error when the reader navigates.
   *
   * Without this, one tab that throws leaves the message in place for every
   * other tab too, since they all render inside this boundary - the nav would
   * appear to have stopped working entirely.
   */
  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error, info) {
    // Logged, not swallowed. The boundary exists so a bug can be found and
    // fixed without the page going down, which needs the bug to be visible.
    console.error('Route failed to render:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    const stale = isChunkLoadError(this.state.error)

    return (
      <div className="route-error" role="alert">
        <AlertTriangle size={20} className="route-error-icon" />
        <h2 className="route-error-title">
          {stale ? 'This page has been updated' : 'This section stopped working'}
        </h2>
        <p className="route-error-body">
          {stale
            ? 'PulseDex was updated while this tab was open, so part of it could not load. Reloading picks up the new version.'
            : 'Something in this section threw an error. The rest of the app is still working - try another tab, or reload.'}
        </p>
        <div className="route-error-actions">
          <button
            type="button"
            className="route-error-btn"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={13} />
            Reload
          </button>
          {!stale && (
            <button
              type="button"
              className="route-error-btn is-quiet"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          )}
        </div>
        {/* The message itself, for anyone reporting it. Not the stack - that
            names minified symbols and helps nobody reading the page. */}
        <p className="route-error-detail font-mono">{String(this.state.error?.message || '')}</p>
      </div>
    )
  }
}
