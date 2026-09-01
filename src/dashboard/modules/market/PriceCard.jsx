import TokenLogo from '../../../components/TokenLogo'
import { useTokenMarket } from '../../services/marketData'
import { ModuleEmpty, ModuleError, ModuleLoading } from '../../components/ModuleStates'
import { formatCryptoPrice, formatUsd, formatCompactCount } from '../../../utils/formatters'

/**
 * One metric about one token.
 *
 * Deliberately generic. Price, market cap, liquidity, volume and transactions
 * are the same card reading a different field, so there is one module with a
 * Metric setting rather than five near-identical components - which is also why
 * adding "fully diluted value" later is a line in a table, not a new module.
 */

/**
 * How to read and render each metric.
 *
 * `value` returns null when the source has nothing for that field, which the
 * card renders as "no data" rather than as zero. A market cap of $0 and an
 * unknown market cap look identical on screen and mean very different things.
 */
const METRICS = {
  price: {
    label: 'Price',
    value: (p) => (p.priceUsd ? Number(p.priceUsd) : null),
    format: (v) => `${formatCryptoPrice(v)}`,
  },
  marketCap: {
    label: 'Market cap',
    value: (p) => (p.marketCap ? Number(p.marketCap) : null),
    format: (v) => formatUsd(v, 0),
  },
  liquidity: {
    label: 'Liquidity',
    value: (p) => (p.liquidity?.usd ? Number(p.liquidity.usd) : null),
    format: (v) => formatUsd(v, 0),
  },
  volume: {
    label: '24h volume',
    value: (p) => (p.volume?.h24 != null ? Number(p.volume.h24) : null),
    format: (v) => formatUsd(v, 0),
  },
  transactions: {
    label: '24h transactions',
    value: (p) => {
      const buys = Number(p.txns?.h24?.buys ?? 0)
      const sells = Number(p.txns?.h24?.sells ?? 0)
      return buys + sells || null
    },
    format: (v) => formatCompactCount(v, 0),
  },
}

export default function PriceCard({ config, context }) {
  const token = context.following ? context.asset : config.token
  const { pair, isLoading, isError, refetch } = useTokenMarket(token)

  if (!token) return <ModuleEmpty label="No token selected" hint="Choose one in this module's settings." />
  if (isLoading && !pair) return <ModuleLoading />
  if (isError) return <ModuleError onRetry={refetch} />
  if (!pair) return <ModuleEmpty label={`No market found for ${token.symbol}`} />

  const spec = METRICS[config.metric] ?? METRICS.price
  const value = spec.value(pair)
  const change = Number(pair.priceChange?.h24 ?? 0)
  const positive = change >= 0

  return (
    <div className="dash-price-card">
      <div className="dash-price-card-head">
        <TokenLogo symbol={token.symbol} address={token.address} size={22} />
        <div>
          <span className="dash-price-card-symbol">{token.symbol}</span>
          <span className="dash-price-card-metric">{spec.label}</span>
        </div>
      </div>

      <p className="dash-price-card-value">
        {value == null ? <span className="dash-muted">No data</span> : spec.format(value)}
      </p>

      {/* The change is always the price change, whatever metric is displayed.
          A "market cap change" would have to be derived from supply history
          that no source here provides, and inferring it from price would be a
          made-up number wearing a real one's label. */}
      <p className={`dash-price-card-change ${positive ? 'is-up' : 'is-down'}`}>
        {positive ? '+' : ''}
        {change.toFixed(2)}% <span className="dash-muted">24h price</span>
      </p>
    </div>
  )
}
