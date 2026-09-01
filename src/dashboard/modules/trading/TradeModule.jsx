import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownUp, Info } from 'lucide-react'
import TokenSelector from '../../components/TokenSelector'
import RouteDisplay from './RouteDisplay'
import { getAggregator } from '../../services/aggregator'
import { useDashboardActions } from '../../state/DashboardProvider'
import { formatAmount } from '../../services/formatAmount'

/**
 * Quote a swap between any two assets.
 *
 * The two selectors are independent inputs, not a pair. The user says what they
 * hold and what they want; the aggregator works out whether that is one pool or
 * three. Nothing here requires the two tokens to trade against each other
 * directly, which is why this does not reuse the pair selector.
 *
 * Execution is not wired. PulseDEX has no signing path - no wallet client, no
 * approvals, no swap call - so the action below is disabled and says so. A
 * button that looked live and quietly did nothing would be worse than no button
 * on a screen about moving money.
 */
export default function TradeModule({ instance, config }) {
  const actions = useDashboardActions()
  const aggregator = getAggregator(config.aggregator)

  const from = config.from ?? null
  const to = config.to ?? null
  const slippage = Number(config.slippage ?? 0.5)

  const [amount, setAmount] = useState(config.amount ?? '')
  const [debounced, setDebounced] = useState(amount)

  /*
   * The amount is local state, not config. Persisting every keystroke would
   * write to storage on each character and put an amount someone typed days ago
   * back in the box on their next visit.
   */
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(amount), 350)
    return () => window.clearTimeout(id)
  }, [amount])

  const numeric = Number(debounced)
  const valid = from && to && isFinite(numeric) && numeric > 0

  const {
    data: quote,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: [
      'dashboard',
      'quote',
      aggregator.id,
      from?.address,
      to?.address,
      debounced,
      slippage,
    ],
    queryFn: () => aggregator.getQuote({ from, to, amount: debounced, slippage }),
    enabled: Boolean(valid),
    // A pool moves under a user who is still deciding, so the quote refreshes -
    // but keeps the previous one on screen so the panel does not flash empty.
    refetchInterval: 12_000,
    staleTime: 6_000,
    placeholderData: (prev) => prev,
    retry: 1,
  })

  const flip = () =>
    actions.updateModuleConfig(instance.id, { from: to, to: from })

  const impactTone = useMemo(() => {
    if (quote?.priceImpact == null) return null
    if (quote.priceImpact >= 5) return 'down'
    if (quote.priceImpact >= 1) return 'warn'
    return null
  }, [quote?.priceImpact])

  return (
    <div className="dash-trade">
      <div className="dash-trade-side">
        <label className="dash-trade-label" htmlFor={`amount-${instance.id}`}>
          Sell
        </label>
        <div className="dash-trade-row">
          <input
            id={`amount-${instance.id}`}
            className="dash-trade-amount"
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            aria-label="Amount to sell"
          />
          <TokenSelector
            label="Sell"
            value={from}
            excludeAddress={to?.address}
            onChange={(t) => actions.updateModuleConfig(instance.id, { from: t })}
          />
        </div>
      </div>

      <button
        type="button"
        className="dash-trade-flip"
        onClick={flip}
        disabled={!from || !to}
        aria-label="Swap the sell and buy tokens"
        title="Swap direction"
      >
        <ArrowDownUp size={14} />
      </button>

      <div className="dash-trade-side">
        <span className="dash-trade-label">Buy</span>
        <div className="dash-trade-row">
          <output className="dash-trade-amount dash-trade-output" aria-live="polite">
            {quote ? formatAmount(quote.amountOut) : '0.0'}
          </output>
          <TokenSelector
            label="Buy"
            value={to}
            excludeAddress={from?.address}
            onChange={(t) => actions.updateModuleConfig(instance.id, { to: t })}
          />
        </div>
      </div>

      {isError ? (
        <p className="dash-trade-error">{error?.message ?? 'Could not quote this swap'}</p>
      ) : null}

      {valid && !quote && !isFetching && !isError ? (
        <p className="dash-trade-error">
          No route found between {from.symbol} and {to.symbol}.
        </p>
      ) : null}

      {quote ? (
        <dl className="dash-trade-detail">
          <div>
            <dt>Rate</dt>
            <dd>
              1 {from.symbol} = {formatAmount(quote.rate)} {to.symbol}
            </dd>
          </div>
          <div>
            <dt>Price impact</dt>
            <dd className={impactTone ? `is-${impactTone}` : undefined}>
              {quote.priceImpact == null ? '—' : `${quote.priceImpact.toFixed(2)}%`}
            </dd>
          </div>
          <div>
            <dt>Minimum received</dt>
            <dd>
              {formatAmount(quote.minimumReceived)} {to.symbol}
            </dd>
          </div>
          <div>
            <dt>Slippage</dt>
            <dd>{slippage}%</dd>
          </div>
        </dl>
      ) : null}

      {quote ? <RouteDisplay route={quote.route} /> : null}

      <button type="button" className="dash-btn dash-btn-primary dash-trade-action" disabled>
        Swap unavailable
      </button>

      <p className="dash-trade-note">
        <Info size={12} aria-hidden="true" />
        <span>
          Quotes are live from {aggregator.name}. PulseDEX cannot sign transactions yet, so swaps
          have to be executed in your own wallet or on the DEX directly.
        </span>
      </p>
    </div>
  )
}
