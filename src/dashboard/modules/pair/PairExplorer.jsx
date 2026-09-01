import { usePairMarket } from '../../services/marketData'
import { ModuleEmpty, ModuleError, ModuleLoading } from '../../components/ModuleStates'
import StatGrid from '../../components/StatGrid'
import { formatCryptoPrice, formatUsd, formatCompactCount } from '../../../utils/formatters'

/**
 * Everything known about one pair, in one panel.
 *
 * The default consumer of the global context: point the toolbar at a pair and
 * this describes it. Market cap is the base token's, which is a property of the
 * token rather than of this pool - labelled accordingly, because a "pair market
 * cap" is not a thing.
 */
export default function PairExplorer({ config, context }) {
  const pair = context.following ? context.pair : config.pair
  const { data: market, isLoading, isError, refetch } = usePairMarket(pair)

  if (!pair?.base || !pair?.quote) return <ModuleEmpty label="No pair selected" />
  if (isLoading && !market) return <ModuleLoading />
  if (isError) return <ModuleError onRetry={refetch} />
  if (!market) {
    return (
      <ModuleEmpty
        label={`No pool for ${pair.base.symbol} / ${pair.quote.symbol}`}
        hint="These two assets may not trade directly against each other."
      />
    )
  }

  const change = Number(market.priceChange?.h24 ?? 0)
  const buys = Number(market.txns?.h24?.buys ?? 0)
  const sells = Number(market.txns?.h24?.sells ?? 0)

  return (
    <StatGrid
      stats={[
        { label: 'Price', value: `${formatCryptoPrice(Number(market.priceUsd ?? 0))}` },
        {
          label: '24h change',
          value: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
          tone: change >= 0 ? 'up' : 'down',
        },
        { label: 'Liquidity', value: formatUsd(Number(market.liquidity?.usd ?? 0), 0) },
        { label: '24h volume', value: formatUsd(Number(market.volume?.h24 ?? 0), 0) },
        {
          label: '24h transactions',
          value: buys + sells ? formatCompactCount(buys + sells, 0) : null,
        },
        { label: 'Buys / sells', value: buys + sells ? `${buys} / ${sells}` : null },
        {
          label: `${market.baseToken?.symbol ?? 'Base'} market cap`,
          value: market.marketCap ? formatUsd(Number(market.marketCap), 0) : null,
        },
        { label: 'Venue', value: market.dexId ?? null },
      ]}
    />
  )
}
