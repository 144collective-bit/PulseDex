import { formatUsd, formatPercent, formatCryptoPrice } from '../../utils/formatters'

/**
 * Minimal analytics for the token the terminal is currently showing.
 *
 * Sits where the page title used to. A title only ever said "Trade", which the
 * user could already see; this space now carries the figures you would
 * otherwise open a second tab to read.
 *
 * Every value comes from the pair already driving the chart, so the strip can
 * never disagree with what is plotted above it.
 */
export default function TokenAnalytics({ pair, poolPair, isLoading }) {
  if (!pair) {
    return (
      <div className="dex-analytics is-empty">
        <span>{isLoading ? 'Loading market data…' : 'No market data for this token.'}</span>
      </div>
    )
  }

  const change = parseFloat(pair.priceChange?.h24 ?? 0)
  const buys = Number(pair.txns?.h24?.buys || 0)
  const sells = Number(pair.txns?.h24?.sells || 0)
  // Market cap is the honest figure where DexScreener has it; FDV is the
  // fallback and is labelled as such rather than passed off as the same thing.
  const cap = parseFloat(pair.marketCap || 0)
  const fdv = parseFloat(pair.fdv || 0)
  const capValue = cap || fdv

  // Token-level figures stay on the token's own reference pool, so they remain
  // comparable as the chart moves between pairs. A market cap read off an
  // INC/HEX pool would change meaning every time the pair changed.
  const stats = [
    { label: 'Price', value: formatCryptoPrice(pair.priceUsd), accent: true },
    {
      label: '24h',
      value: formatPercent(change),
      tone: change >= 0 ? 'up' : 'down',
    },
    { label: cap ? 'Mkt Cap' : 'FDV', value: formatUsd(capValue, 1) },
    { label: '24h Txns', value: (buys + sells).toLocaleString('en-US') },
  ]

  // And these belong to whichever pool is actually plotted above.
  const poolStats = poolPair
    ? [
        { label: 'Pool Liq', value: formatUsd(poolPair.liquidity?.usd, 1) },
        { label: 'Pool Vol', value: formatUsd(poolPair.volume?.h24, 1) },
      ]
    : []

  const render = (stat) => (
    <div className={`dex-stat ${stat.group ? 'is-group-start' : ''}`} key={stat.label}>
      <span className="dex-stat-label">{stat.label}</span>
      <span
        className={`dex-stat-value ${stat.accent ? 'is-accent' : ''} ${
          stat.tone ? `is-${stat.tone}` : ''
        }`}
      >
        {stat.value}
      </span>
    </div>
  )

  return (
    <div className="dex-analytics">
      {stats.map(render)}
      {poolStats.map((stat, index) => render({ ...stat, group: index === 0 }))}
    </div>
  )
}
