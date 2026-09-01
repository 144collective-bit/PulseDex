import { Link2 } from 'lucide-react'
import PairSelector from './PairSelector'
import TokenSelector from './TokenSelector'
import { useDashboardActions, useDashboardState } from '../state/DashboardProvider'

/**
 * The shared selection every "follow global" module reads.
 *
 * This is the half of the context model that makes a dashboard feel like one
 * instrument rather than a wall of unrelated panels: set the pair once here and
 * the chart, the pair statistics and the liquidity panel all move together,
 * while anything set to local stays exactly where it was pointed.
 *
 * The count of following modules is shown deliberately. Without it, changing
 * the pair and watching only some panels change looks like a bug rather than
 * the feature it is.
 */
export default function DashboardContextBar() {
  const { dashboard, globalContext } = useDashboardState()
  const actions = useDashboardActions()

  const following = (dashboard?.modules ?? []).filter(
    (m) => !m.hidden && m.contextMode === 'global',
  ).length

  return (
    <div className="dash-context-bar">
      <div className="dash-context-group">
        <span className="dash-context-label">Pair</span>
        <PairSelector
          value={globalContext.pair}
          onChange={(pair) => actions.setGlobalContext({ pair })}
        />
      </div>

      <div className="dash-context-group">
        <span className="dash-context-label">Asset</span>
        <TokenSelector
          label="Asset"
          value={globalContext.asset}
          onChange={(asset) => actions.setGlobalContext({ asset })}
        />
      </div>

      <p className="dash-context-note">
        <Link2 size={12} aria-hidden="true" />
        <span>
          {following === 0
            ? 'No module is following this selection'
            : `${following} module${following === 1 ? '' : 's'} following`}
        </span>
      </p>
    </div>
  )
}
