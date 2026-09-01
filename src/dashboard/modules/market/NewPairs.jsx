import { useMemo } from 'react'
import { useTopPairs } from '../../services/marketData'
import { ModuleEmpty, ModuleError, ModuleLoading } from '../../components/ModuleStates'
import PairRowList from '../../components/PairRowList'

/**
 * Recently created pairs.
 *
 * Sourced from `pairCreatedAt`, which DexScreener returns for pairs it has
 * indexed - so this is "new among the pairs PulseDEX tracks", not a live feed
 * of every pool created on PulseChain. A genuine new-pool feed would mean
 * watching factory events, which is a backend job rather than something a
 * browser module can do honestly.
 *
 * The liquidity floor is what makes it useful. Without one the list is almost
 * entirely empty pools created minutes ago and abandoned.
 */
export default function NewPairs({ config }) {
  const { data: pairs, isLoading, isError, refetch } = useTopPairs()

  const fresh = useMemo(() => {
    if (!pairs?.length) return []
    const maxAgeMs = (config.maxAgeDays ?? 30) * 86_400_000
    const minLiquidity = config.minLiquidity ?? 10_000
    const now = Date.now()

    return pairs
      .filter((p) => {
        if (!p.pairCreatedAt) return false
        if (now - Number(p.pairCreatedAt) > maxAgeMs) return false
        return Number(p.liquidity?.usd ?? 0) >= minLiquidity
      })
      .sort((a, b) => Number(b.pairCreatedAt) - Number(a.pairCreatedAt))
      .slice(0, config.limit ?? 12)
  }, [pairs, config.maxAgeDays, config.minLiquidity, config.limit])

  if (isLoading && !pairs) return <ModuleLoading />
  if (isError) return <ModuleError onRetry={refetch} />
  if (fresh.length === 0) {
    return (
      <ModuleEmpty
        label="No new pairs match these filters"
        hint="Widen the age window or lower the liquidity floor in settings."
      />
    )
  }

  return (
    <>
      <p className="dash-module-note">New among the pairs PulseDEX indexes.</p>
      <PairRowList pairs={fresh} column="age" />
    </>
  )
}
