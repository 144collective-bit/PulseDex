import { Component } from 'react'
import { ModuleError } from './ModuleStates'

/**
 * Error isolation for one module.
 *
 * A dashboard is a page made of other people's failures waiting to happen: a
 * chart library throwing on a malformed candle, a module reading a field off a
 * token that turned out to be null. Without a boundary per module, any one of
 * those unmounts the whole canvas and takes the user's layout controls with it,
 * so they cannot even remove the module that broke.
 *
 * Resetting is keyed on the module's configuration, so reconfiguring a module
 * clears a previous failure rather than leaving it stuck until reload.
 */
export class ModuleErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  /**
   * Track the reset key on every render, not only while holding an error.
   *
   * Updating it only in the error branch left it stale: edit a module's
   * settings while it is working and the remembered key stays at the mount
   * value, so the first crash afterwards is compared against a key that has
   * already moved on and is cleared on the very next render. The module then
   * re-renders, throws again, is cleared again - a crash loop where the error
   * state should have been.
   */
  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error, info) {
    // Logged rather than swallowed: a module that throws is a bug to fix, and
    // the boundary is there so it can be fixed without the page going down.
    console.error(`Dashboard module "${this.props.moduleType}" crashed:`, error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <ModuleError
          label="This module stopped working"
          detail={this.state.error?.message}
          onRetry={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}

export default ModuleErrorBoundary
