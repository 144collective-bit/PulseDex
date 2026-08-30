import { AlertTriangle, GitBranch } from 'lucide-react'
import { formatUsd } from '../../utils/formatters'
import { DIRECT_POOL_MIN_LIQUIDITY } from '../../config/dex'

const liq = (pair) => formatUsd(pair?.liquidity?.usd, 1)

/**
 * Caution notice for the pool currently on the chart.
 *
 * The pair the user selected is always what gets charted, however thin its
 * pool, so the caution has to travel with it rather than the chart quietly
 * showing something safer. Three things are worth saying:
 *
 *   thin      - the pool is real but shallow enough that its price is only a
 *               few trades wide
 *   route leg - what is plotted is one hop of the trade, not an A/B market
 *   none      - the two tokens have no pool at all
 *
 * Silent otherwise. A healthy direct pool needs no explanation, and a notice
 * that appears on every pair stops being read.
 *
 * Explanation only. Switching pools belongs to the menu above it; offering the
 * same choice in two controls is how they end up disagreeing.
 */
export default function RouteBar({ route, activePair, fromSymbol, toSymbol }) {
  if (!route) return null

  if (!activePair) {
    if (route.kind !== 'none') return null
    return (
      <div className="dex-route is-empty">
        <AlertTriangle size={13} />
        <span>
          No pool found for {fromSymbol}/{toSymbol}.
        </span>
      </div>
    )
  }

  const activeAddress = activePair.pairAddress?.toLowerCase()
  const isDirect = (route.direct || []).some(
    (p) => p.pairAddress?.toLowerCase() === activeAddress
  )
  const isThin =
    parseFloat(activePair.liquidity?.usd || 0) < DIRECT_POOL_MIN_LIQUIDITY

  if (isDirect && !isThin) return null

  if (!isDirect) {
    return (
      <div className="dex-route">
        <div className="dex-route-note">
          <GitBranch size={13} />
          <span>
            This is {activePair.baseToken?.symbol}/{activePair.quoteToken?.symbol},
            one leg of the route between {fromSymbol} and {toSymbol} — not a
            direct market between them.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="dex-route is-warning">
      <div className="dex-route-note">
        <AlertTriangle size={13} />
        <span>
          {/* The pool's own symbols, not the picker's: two curated tokens both
              answer to "HEX", so naming the pool is the unambiguous form. */}
          Thin pool — {activePair.baseToken?.symbol}/{activePair.quoteToken?.symbol}{' '}
          holds only {liq(activePair)} in liquidity. A single trade can move this
          price sharply and the chart reflects that, so treat the ratio with
          caution. Deeper pools and the route via PLS are in the menu above.
        </span>
      </div>
    </div>
  )
}
