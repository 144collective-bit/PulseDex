import { ChevronRight } from 'lucide-react'
import { KNOWN_PULSE_TOKENS } from '../../../config/pulsechain'
import { formatAddress } from '../../../utils/formatters'
import { NATIVE_PLS } from '../../../config/dex'

/**
 * The path a swap would take.
 *
 * Shown because a two-hop route is not a detail: it means the trade touches a
 * second pool, pays a second fee and carries a second pool's slippage. A user
 * looking at a quote for HEX to USDC should be able to see that it is going
 * through WPLS on the way.
 */
function label(address) {
  if (address === NATIVE_PLS) return 'PLS'
  const known = KNOWN_PULSE_TOKENS.find(
    (t) => t.address.toLowerCase() === String(address).toLowerCase(),
  )
  return known?.symbol ?? formatAddress(address, 4, 3)
}

export default function RouteDisplay({ route }) {
  if (!route?.path?.length) return null

  return (
    <div className="dash-route" aria-label="Swap route">
      <ol className="dash-route-path">
        {route.path.map((address, i) => (
          <li key={`${address}-${i}`}>
            <span className="dash-route-node">{label(address)}</span>
            {i < route.path.length - 1 ? (
              <ChevronRight size={12} aria-hidden="true" className="dash-route-arrow" />
            ) : null}
          </li>
        ))}
      </ol>
      <span className="dash-route-venue">
        {route.venue} &middot; {route.hops} hop{route.hops === 1 ? '' : 's'}
      </span>
    </div>
  )
}
