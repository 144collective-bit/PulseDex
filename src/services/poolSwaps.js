import { useQuery } from '@tanstack/react-query'
import { fetchWithRetry } from './pulsescan'

/**
 * Real swaps for a pool, read from PulseScan.
 *
 * The one source of swap history in the app, shared by the screener's tape and
 * the dashboard's Recent trades module. It exists because there was no source:
 * the screener used to generate its rows with Math.random(), complete with
 * invented transaction hashes that linked to nothing.
 *
 * This reads the chain instead. On a Uniswap-V2-style pool every swap moves
 * two ERC20 transfers through the pool address in one transaction: the token
 * going in and the token coming out. Grouping the pool's token transfers by
 * transaction hash reconstructs the swaps exactly, with no estimation.
 *
 * Direction is read from the base token's leg:
 *   base token INTO the pool  -> someone sold the base asset
 *   base token OUT of the pool -> someone bought it
 */

const PULSESCAN_BASE_URL = 'https://api.scan.pulsechain.com/api/v2'

/**
 * Field names, read defensively.
 *
 * Blockscout has renamed both of these between releases - `transaction_hash`
 * became `tx_hash`, `token.address_hash` became `token.address` - and PulseScan
 * currently serves the newer pair. Reading both means an explorer upgrade on
 * either side does not silently empty the tape: every row was being dropped for
 * a missing hash, and an empty list looks exactly like a quiet pool.
 */
function txHashOf(item) {
  return item?.tx_hash ?? item?.transaction_hash ?? null
}

function tokenAddressOf(leg) {
  const address = leg?.token?.address ?? leg?.token?.address_hash
  return address ? String(address).toLowerCase() : null
}

/** Blockscout returns transfer amounts as raw integer strings. */
function toDecimal(value, decimals) {
  const n = Number(value)
  if (!isFinite(n)) return 0
  return n / 10 ** Number(decimals ?? 18)
}

/**
 * Reconstruct swaps for one pool.
 *
 * @param {string} poolAddress
 * @param {string} baseAddress  Which side of the pool counts as the asset being traded.
 * @param {number} limit
 */
export async function fetchPoolSwaps(poolAddress, baseAddress, limit = 30) {
  if (!poolAddress) return []

  const url = `${PULSESCAN_BASE_URL}/addresses/${poolAddress}/token-transfers?type=ERC-20`
  const res = await fetchWithRetry(url)
  const items = res?.items
  if (!Array.isArray(items)) return []

  const pool = poolAddress.toLowerCase()
  const base = baseAddress?.toLowerCase()

  /** @type {Map<string, {hash:string, timestamp:string, legs:any[]}>} */
  const byTx = new Map()

  for (const item of items) {
    const hash = txHashOf(item)
    if (!hash) continue
    if (!byTx.has(hash)) {
      byTx.set(hash, { hash, timestamp: item.timestamp, legs: [] })
    }
    byTx.get(hash).legs.push(item)
  }

  const swaps = []

  for (const tx of byTx.values()) {
    // A single transfer touching the pool is a liquidity move or a plain
    // transfer, not a swap. Both legs have to be present to call it one.
    if (tx.legs.length < 2) continue

    const baseLeg = base ? tx.legs.find((l) => tokenAddressOf(l) === base) : tx.legs[0]
    if (!baseLeg) continue

    const counterLeg = tx.legs.find((l) => tokenAddressOf(l) !== tokenAddressOf(baseLeg))
    if (!counterLeg) continue

    const intoPool = baseLeg.to?.hash?.toLowerCase() === pool
    const baseAmount = toDecimal(baseLeg.total?.value, baseLeg.total?.decimals)
    const counterAmount = toDecimal(counterLeg.total?.value, counterLeg.total?.decimals)

    if (!baseAmount || !counterAmount) continue

    swaps.push({
      hash: tx.hash,
      timestamp: tx.timestamp,
      // Into the pool means the pool received the base asset, so the trader
      // was selling it.
      side: intoPool ? 'sell' : 'buy',
      baseAmount,
      baseSymbol: baseLeg.token?.symbol,
      counterAmount,
      counterSymbol: counterLeg.token?.symbol,
      // Price in the counter asset. Left un-converted to USD on purpose: the
      // conversion needs the counter asset's USD price at that block, which
      // this endpoint does not carry, and using the current price would label
      // an hour-old trade with a price it did not happen at.
      price: counterAmount / baseAmount,
      /*
       * Whoever paid into the pool, which is the router's address whenever the
       * swap was routed rather than sent to the pool directly. The transaction
       * originator would be the truer answer and costs one request per swap to
       * find, so the column is labelled for what this actually is.
       */
      trader: intoPool ? baseLeg.from?.hash : counterLeg.from?.hash,
    })
  }

  return swaps.slice(0, limit)
}

export function usePoolSwaps(poolAddress, baseAddress, limit = 30) {
  return useQuery({
    queryKey: [
      'dashboard',
      'poolSwaps',
      poolAddress?.toLowerCase() ?? null,
      baseAddress?.toLowerCase() ?? null,
    ],
    queryFn: () => fetchPoolSwaps(poolAddress, baseAddress, limit),
    enabled: Boolean(poolAddress),
    // Slower than the price polls. This is several hundred rows of JSON per
    // call against a public explorer that rate-limits, and a tape that updates
    // every twenty seconds reads the same as one that updates every forty.
    refetchInterval: 40_000,
    staleTime: 20_000,
    placeholderData: (prev) => prev,
    retry: 1,
  })
}
