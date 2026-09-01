import { ArrowLeftRight } from 'lucide-react'
import TokenSelector from './TokenSelector'
import { makePair } from '../state/tokens'

/**
 * Two assets, and a control to swap which is which.
 *
 * A pair is not a trade route. This says what is being looked at - HEX against
 * WPLS - and carries no opinion about whether a direct pool exists between
 * them or how a swap would be executed. The Trade module answers that question
 * separately, which is why it does not reuse this component.
 */
export default function PairSelector({ value, onChange, className = '' }) {
  const base = value?.base ?? null
  const quote = value?.quote ?? null

  /*
   * Changing either side drops any remembered pool address. The old one
   * belonged to the old pair, and carrying it forward would point every module
   * following this pair at the wrong pool while still displaying the new label.
   */
  const setSide = (side, token) => {
    const next = side === 'base' ? makePair(token, quote) : makePair(base, token)
    onChange?.(next)
  }

  const flip = () => onChange?.(makePair(quote, base))

  return (
    <div className={`dash-pair-select ${className}`}>
      <TokenSelector
        label="Base"
        value={base}
        onChange={(t) => setSide('base', t)}
        excludeAddress={quote?.address}
      />

      <button
        type="button"
        className="dash-icon-btn dash-pair-flip"
        onClick={flip}
        disabled={!base || !quote}
        aria-label="Swap base and quote"
        title="Swap base and quote"
      >
        <ArrowLeftRight size={13} />
      </button>

      <TokenSelector
        label="Quote"
        value={quote}
        onChange={(t) => setSide('quote', t)}
        excludeAddress={base?.address}
      />
    </div>
  )
}
