import { useEffect, useMemo } from 'react'
import { LineSeries } from 'lightweight-charts'
import { ArrowLeftRight } from 'lucide-react'
import { useRatioSeries } from '../../services/marketData'
import { useDashboardActions } from '../../state/DashboardProvider'
import { ModuleEmpty, ModuleError, ModuleLoading } from '../../components/ModuleStates'
import { useChartSurface } from '../../components/useChartSurface'
import { formatAmount } from '../../services/formatAmount'

/**
 * How many of one token another is worth, over time.
 *
 * A rotation instrument rather than a price chart. "Is HEX cheap against PLSX
 * right now" is not answerable from two price charts side by side - both move
 * with the whole market, and the thing being asked about is the difference
 * between them. Dividing one by the other cancels that common movement out, so
 * the line only moves when the two assets actually diverge.
 *
 * Both legs are priced in USD before dividing, which is what makes the result a
 * pure ratio: the dollar cancels, leaving "units of B per unit of A".
 */
const ACCENT = '#00e5ff'

export default function RatioChart({ instance, config }) {
  const actions = useDashboardActions()
  const base = config.tokenA ?? null
  const quote = config.tokenB ?? null
  const interval = config.timeframe ?? '1h'

  const { data, isLoading, isFetching, isError, error, refetch, missing } = useRatioSeries(
    base,
    quote,
    interval,
  )

  const { containerRef, chart, series } = useChartSurface({
    seriesType: LineSeries,
    seriesOptions: { color: ACCENT, lineWidth: 2 },
    chartOptions: {
      // A ratio is a plain number, not a currency, and can run from 0.0001 to
      // thousands depending on which two assets are chosen.
      localization: { priceFormatter: (v) => formatAmount(v) },
    },
  })

  useEffect(() => {
    if (!series || !data.length) return
    series.setData(data)
    chart?.timeScale().fitContent()
  }, [series, chart, data])

  /** Current level and how far it has moved across the window on screen. */
  const summary = useMemo(() => {
    if (data.length < 2) return null
    const first = data[0].value
    const last = data[data.length - 1].value
    if (!first) return { last, change: null }
    return { last, change: ((last - first) / first) * 100 }
  }, [data])

  const swap = () =>
    actions.updateModuleConfig(instance.id, { tokenA: quote, tokenB: base })

  let state = null
  if (!base || !quote) {
    state = (
      <ModuleEmpty
        label="Pick two tokens"
        hint="Choose the pair to compare in this module's settings."
      />
    )
  } else if (base.address === quote.address) {
    state = <ModuleEmpty label="Choose two different tokens" />
  } else if (isError) {
    state = <ModuleError onRetry={refetch} detail={error?.message} />
  } else if (!data.length) {
    state = isFetching ? (
      <ModuleLoading label="Building ratio" />
    ) : (
      <ModuleEmpty
        label={missing ? 'No overlapping history for these two' : 'No ratio history available'}
        hint={
          missing
            ? 'Their markets have not traded in the same hours recently.'
            : undefined
        }
      />
    )
  }

  return (
    <div className="dash-ratio">
      <div className="dash-ratio-head">
        <div className="dash-ratio-legend">
          <span className="dash-ratio-pair">
            {base?.symbol ?? '—'} / {quote?.symbol ?? '—'}
          </span>
          {summary ? (
            <>
              <span className="dash-ratio-value">{formatAmount(summary.last)}</span>
              {summary.change != null ? (
                <span className={summary.change >= 0 ? 'is-up' : 'is-down'}>
                  {summary.change >= 0 ? '+' : ''}
                  {summary.change.toFixed(2)}%
                </span>
              ) : null}
            </>
          ) : null}
        </div>
        <button
          type="button"
          className="dash-icon-btn"
          onClick={swap}
          disabled={!base || !quote}
          aria-label="Invert the ratio"
          title="Invert the ratio"
        >
          <ArrowLeftRight size={13} />
        </button>
      </div>

      <p className="dash-ratio-note">
        {base && quote
          ? `1 ${base.symbol} buys this many ${quote.symbol}.`
          : 'Select two tokens to compare.'}
      </p>

      {/* The container is always mounted; states are drawn over it, because a
          chart whose container never rendered never gets built. */}
      <div className="dash-ratio-surface">
        <div className="dash-chart" ref={containerRef} aria-hidden={state ? 'true' : undefined} />
        {state ? <div className="dash-chart-state">{state}</div> : null}
      </div>
    </div>
  )
}
