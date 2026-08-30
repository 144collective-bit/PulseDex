import { useEffect, useRef } from 'react'
import { Check, GitBranch, Layers } from 'lucide-react'
import { formatUsd, formatAddress } from '../../utils/formatters'
import { DIRECT_POOL_MIN_LIQUIDITY } from '../../config/dex'

/**
 * Venue label for a pool.
 *
 * DexScreener returns the router's contract address as `dexId` for venues it
 * has no name for, which renders as a 42-character string across the row. An
 * address is not a venue name, so it is shortened and marked unknown.
 */
function venueLabel(pair) {
  const id = pair?.dexId || ''
  const version = pair?.labels?.[0] ? ` ${pair.labels[0]}` : ''
  if (/^0x[a-fA-F0-9]{40}$/.test(id)) return `Unknown ${formatAddress(id)}`
  return `${id}${version}`
}

/**
 * Pool menu for the two tokens currently in the swap box.
 *
 * Direct pools first, then the legs a trade routes through when the two tokens
 * have no usable pool of their own. Both are offered because both are real
 * markets the user may want to look at before trading - the same two tokens
 * routinely hold pools on PulseX V1, PulseX V2 and 9mm at once, and which is
 * deepest is not predictable.
 */
export default function PoolSelect({ open, onClose, pools, activeAddress, onSelect, fromSymbol, toSymbol }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    const onDown = (event) => {
      // The trigger handles its own toggle; closing here too would reopen it.
      if (!ref.current || ref.current.contains(event.target)) return
      if (event.target.closest?.('.dex-subject')) return
      onClose()
    }
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const { direct = [], route = [] } = pools || {}
  const total = direct.length + route.length

  const row = (pair, viaRoute) => {
    const liquidity = parseFloat(pair.liquidity?.usd || 0)
    const isActive = pair.pairAddress?.toLowerCase() === activeAddress?.toLowerCase()

    return (
      <button
        key={pair.pairAddress}
        type="button"
        className={`dex-pool-row ${isActive ? 'active' : ''}`}
        onClick={() => onSelect(pair)}
      >
        <span className="dex-pool-main">
          <span className="dex-pool-pair">
            {pair.baseToken?.symbol}/{pair.quoteToken?.symbol}
          </span>
          <span className="dex-pool-venue">{venueLabel(pair)}</span>
          {/* Flagged rather than hidden: a pool this thin is still selectable,
              but its chart is a few trades wide. */}
          {!viaRoute && liquidity < DIRECT_POOL_MIN_LIQUIDITY && (
            <span className="dex-pool-thin">thin</span>
          )}
        </span>

        <span className="dex-pool-figures">
          <span className="dex-pool-liq">{formatUsd(liquidity, 1)}</span>
          <span className="dex-pool-vol">{formatUsd(pair.volume?.h24, 1)} 24h</span>
        </span>

        {isActive && <Check size={14} className="dex-pool-check" />}
      </button>
    )
  }

  return (
    <div className="dex-pool-menu" ref={ref} role="listbox" aria-label="Liquidity pools">
      {!total && (
        <p className="dex-pool-empty">
          No pools found for {fromSymbol}/{toSymbol}.
        </p>
      )}

      {direct.length > 0 && (
        <>
          <div className="dex-pool-group">
            <Layers size={11} />
            <span>
              {fromSymbol}/{toSymbol} pools
            </span>
            <span className="dex-pool-count">{direct.length}</span>
          </div>
          {direct.map((pair) => row(pair, false))}
        </>
      )}

      {route.length > 0 && (
        <>
          <div className="dex-pool-group">
            <GitBranch size={11} />
            <span>Route via PLS</span>
            <span className="dex-pool-count">{route.length}</span>
          </div>
          {route.map((pair) => row(pair, true))}
        </>
      )}
    </div>
  )
}
