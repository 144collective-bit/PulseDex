import TokenLogo from '../../components/TokenLogo'
import { useDashboardActions } from '../state/DashboardProvider'
import { makePair, toTokenRef } from '../state/tokens'
import { formatCryptoPrice, formatUsd, formatCompactCount } from '../../utils/formatters'

/**
 * A ranked list of pairs, shared by every module that shows one.
 *
 * Movers, trending, new pairs and the watchlist are all this list with a
 * different source and a different right-hand column, so they share the row
 * rather than each drawing their own.
 *
 * Clicking a row is how modules talk to each other. It does not reach into any
 * other module - it sets the dashboard context, and whichever modules are
 * following that context react. A watchlist that called a chart directly would
 * work for exactly one pairing and then need rewriting for the next.
 */

const COLUMNS = {
  change: {
    header: '24h',
    render: (p) => {
      const v = Number(p.priceChange?.h24 ?? 0)
      return (
        <span className={v >= 0 ? 'is-up' : 'is-down'}>
          {v >= 0 ? '+' : ''}
          {v.toFixed(1)}%
        </span>
      )
    },
  },
  volume: { header: 'Vol 24h', render: (p) => formatUsd(Number(p.volume?.h24 ?? 0), 0) },
  liquidity: { header: 'Liquidity', render: (p) => formatUsd(Number(p.liquidity?.usd ?? 0), 0) },
  transactions: {
    header: 'Txns 24h',
    render: (p) =>
      formatCompactCount(Number(p.txns?.h24?.buys ?? 0) + Number(p.txns?.h24?.sells ?? 0), 0),
  },
  age: {
    header: 'Age',
    render: (p) => {
      if (!p.pairCreatedAt) return <span className="dash-muted">—</span>
      const hours = (Date.now() - Number(p.pairCreatedAt)) / 3_600_000
      if (hours < 1) return `${Math.round(hours * 60)}m`
      if (hours < 48) return `${Math.round(hours)}h`
      return `${Math.round(hours / 24)}d`
    },
  },
}

export default function PairRowList({ pairs, column = 'change', onSelect, emptyLabel }) {
  const actions = useDashboardActions()
  const spec = COLUMNS[column] ?? COLUMNS.change

  const select = (p) => {
    if (onSelect) return onSelect(p)
    const base = toTokenRef(p.baseToken)
    const quote = toTokenRef(p.quoteToken)
    actions.setGlobalContext({
      asset: base,
      pair: makePair(base, quote, p.pairAddress),
    })
  }

  if (!pairs?.length) {
    return <div className="dash-module-state">{emptyLabel ?? 'Nothing to show'}</div>
  }

  return (
    <table className="dash-table">
      <thead>
        <tr>
          <th scope="col">Pair</th>
          <th scope="col">Price</th>
          <th scope="col">{spec.header}</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((p) => (
          <tr key={p.pairAddress}>
            <th scope="row">
              <button type="button" className="dash-table-link" onClick={() => select(p)}>
                <TokenLogo
                  symbol={p.baseToken?.symbol}
                  address={p.baseToken?.address}
                  size={18}
                />
                <span className="dash-table-symbol">{p.baseToken?.symbol}</span>
                <span className="dash-muted">/ {p.quoteToken?.symbol}</span>
              </button>
            </th>
            <td>{formatCryptoPrice(Number(p.priceUsd ?? 0))}</td>
            <td>{spec.render(p)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
