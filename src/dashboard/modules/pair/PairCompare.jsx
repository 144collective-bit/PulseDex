import { useMemo } from 'react'
import TokenLogo from '../../../components/TokenLogo'
import { usePairMarket } from '../../services/marketData'
import { ModuleEmpty } from '../../components/ModuleStates'
import { useDashboardActions } from '../../state/DashboardProvider'
import { makePair, toTokenRef } from '../../state/tokens'
import { formatCryptoPrice, formatUsd, formatCompactCount } from '../../../utils/formatters'

/**
 * Several markets on the same measures.
 *
 * Laid out as a row per pair rather than a column per pair. Columns read better
 * as "side by side" in the abstract, but a module four grid units wide can hold
 * three narrow columns of eight-decimal prices or it can be legible, and the
 * comparison being made here is between rows of the same measure anyway.
 *
 * The change column is the point: everything else is context for it.
 */

/** One row, with its own market lookup - the same reason MultiChart uses a tile component. */
function CompareRow({ pair, onSelect }) {
  const { data: market, isLoading } = usePairMarket(pair)

  if (isLoading && !market) {
    return (
      <tr>
        <th scope="row">{pair?.label ?? '—'}</th>
        <td colSpan={4} className="dash-muted">
          Loading
        </td>
      </tr>
    )
  }

  if (!market) {
    return (
      <tr>
        <th scope="row">{pair?.label ?? '—'}</th>
        <td colSpan={4} className="dash-muted">
          No pool found
        </td>
      </tr>
    )
  }

  const change = Number(market.priceChange?.h24 ?? 0)

  return (
    <tr>
      <th scope="row">
        <button type="button" className="dash-table-link" onClick={() => onSelect(market)}>
          <TokenLogo symbol={market.baseToken?.symbol} address={market.baseToken?.address} size={16} />
          <span className="dash-table-symbol">{market.baseToken?.symbol}</span>
          <span className="dash-muted">/ {market.quoteToken?.symbol}</span>
        </button>
      </th>
      <td>{formatCryptoPrice(Number(market.priceUsd ?? 0))}</td>
      <td className={change >= 0 ? 'is-up' : 'is-down'}>
        {change >= 0 ? '+' : ''}
        {change.toFixed(2)}%
      </td>
      <td>{formatUsd(Number(market.volume?.h24 ?? 0), 0)}</td>
      <td>{formatUsd(Number(market.liquidity?.usd ?? 0), 0)}</td>
    </tr>
  )
}

export default function PairCompare({ config }) {
  const actions = useDashboardActions()

  const pairs = useMemo(
    () => (Array.isArray(config.pairs) ? config.pairs.filter(Boolean) : []),
    [config.pairs],
  )

  const select = (market) =>
    actions.setGlobalContext({
      asset: toTokenRef(market.baseToken),
      pair: makePair(toTokenRef(market.baseToken), toTokenRef(market.quoteToken), market.pairAddress),
    })

  if (pairs.length === 0) {
    return (
      <ModuleEmpty
        label="No pairs to compare"
        hint="Add two or more markets in this module's settings."
      />
    )
  }

  return (
    <table className="dash-table">
      <thead>
        <tr>
          <th scope="col">Pair</th>
          <th scope="col">Price</th>
          <th scope="col">24h</th>
          <th scope="col">Volume</th>
          <th scope="col">Liquidity</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((pair, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <CompareRow key={`${pair?.label ?? 'pair'}-${index}`} pair={pair} onSelect={select} />
        ))}
      </tbody>
    </table>
  )
}
