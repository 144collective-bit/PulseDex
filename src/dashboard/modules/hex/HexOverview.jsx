import { useMemo } from 'react'
import { useCoreAssets } from '../../../hooks/useCoreAssets'
import { ModuleEmpty, ModuleError, ModuleLoading } from '../../components/ModuleStates'
import StatGrid from '../../components/StatGrid'
import { formatCryptoPrice, formatUsd, formatCompactCount } from '../../../utils/formatters'

/**
 * HEX, from the data PulseDEX genuinely has.
 *
 * Market figures come from the same core-asset service the Home board uses, so
 * this module costs nothing extra when that board is also open. Supply and
 * burned are read from the chain there, not estimated.
 *
 * What is *not* here is T-Share rate and staking data. Those live in the HEX
 * contract's own stake accounting, which nothing in this codebase reads - there
 * is no ABI for it, no service, and no cached series. Deriving a share rate
 * from a price would produce a number that looks authoritative and is simply
 * wrong, so the module names the gap instead of filling it.
 *
 * The integration point is a `hexStaking` service reading `globalInfo()` from
 * the HEX contract on PulseChain; every field below marked as unavailable comes
 * from that one call.
 */
export default function HexOverview({ config }) {
  const { data, isLoading, isError, refetch } = useCoreAssets()

  // Two HEX contracts exist on PulseChain - the native one and the bridged
  // Ethereum one. They trade at different prices, so which is meant has to be
  // explicit rather than resolved by ticker.
  const asset = useMemo(
    () => data?.find((a) => a.id === (config.variant ?? 'hex')),
    [data, config.variant],
  )

  if (isLoading && !data) return <ModuleLoading />
  if (isError) return <ModuleError onRetry={refetch} />
  if (!asset) return <ModuleEmpty label="No market data for HEX right now" />

  const change = Number(asset.change24h ?? 0)
  const circulating = asset.supply != null && asset.burned != null ? asset.supply - asset.burned : null

  return (
    <>
      <StatGrid
        stats={[
          { label: 'Price', value: `${formatCryptoPrice(asset.priceUsd)}` },
          {
            label: '24h change',
            value: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
            tone: change >= 0 ? 'up' : 'down',
          },
          { label: 'Market cap', value: asset.marketCap ? formatUsd(asset.marketCap, 0) : null },
          { label: '24h volume', value: formatUsd(asset.volume24h, 0) },
          { label: 'Liquidity', value: formatUsd(asset.liquidityUsd, 0) },
          {
            label: 'Total supply',
            value: asset.supply != null ? formatCompactCount(asset.supply, 2) : null,
          },
          {
            label: 'Burned',
            value: asset.burned != null ? formatCompactCount(asset.burned, 2) : null,
          },
          {
            label: 'Circulating',
            value: circulating != null ? formatCompactCount(circulating, 2) : null,
          },
        ]}
      />

      <p className="dash-module-note">
        Market figures from the venue; supply and burned read from the chain. T-Share rate and
        staking totals are not shown &mdash; PulseDEX does not yet read the HEX contract&rsquo;s stake
        accounting, and there is no way to derive them from price.
      </p>
    </>
  )
}
