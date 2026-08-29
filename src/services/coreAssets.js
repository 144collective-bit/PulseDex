import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
import { pulsechain } from '../config/pulsechain'
import { CORE_ASSETS, BURN_ADDRESS, WPLS_ADDRESS } from '../config/coreAssets'
import { getPairsByTokens, getPulsePair } from './dexscreener'

/**
 * Data layer for the Home board's core assets.
 *
 * Market figures (price, change, volume, liquidity, market cap) come from
 * DexScreener. Supply and burned come from the chain itself, because no market
 * API reports them - they're read in a single multicall against the ERC20s.
 */

const client = createPublicClient({
  chain: pulsechain,
  transport: http('https://rpc.pulsechain.com'),
})

const ERC20_ABI = parseAbi([
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
])

/**
 * Read totalSupply and the burn-address balance for every ERC20 core asset.
 *
 * Batched through multicall3 (configured on the chain) so this is one RPC
 * round-trip rather than two per token. A failure here degrades the cards to
 * market-only data rather than emptying the board.
 */
async function fetchSupplyData() {
  const erc20s = CORE_ASSETS.filter((a) => !a.isNative)

  const contracts = erc20s.flatMap((asset) => [
    { address: asset.address, abi: ERC20_ABI, functionName: 'totalSupply' },
    {
      address: asset.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [BURN_ADDRESS],
    },
  ])

  const byId = {}

  try {
    // allowFailure keeps one unresponsive contract from voiding the whole batch.
    const results = await client.multicall({ contracts, allowFailure: true })

    erc20s.forEach((asset, i) => {
      const supplyRes = results[i * 2]
      const burnedRes = results[i * 2 + 1]

      const rawSupply =
        supplyRes?.status === 'success' ? supplyRes.result : null
      const rawBurned =
        burnedRes?.status === 'success' ? burnedRes.result : null

      // Burned tokens still count in totalSupply, so subtract them out to get
      // what is actually live.
      const total =
        rawSupply === null ? null : parseFloat(formatUnits(rawSupply, asset.decimals))
      const burned =
        rawBurned === null ? null : parseFloat(formatUnits(rawBurned, asset.decimals))

      byId[asset.id] = {
        supply: total === null ? null : Math.max(0, total - (burned || 0)),
        burned,
      }
    })
  } catch (err) {
    console.warn('core asset supply multicall failed:', err.message)
  }

  return byId
}

/**
 * PLS is the native coin, so there is no contract to query. DexScreener does
 * track its circulating supply for the WPLS market, which we recover from the
 * market cap it reports against the live price.
 */
function derivePlsSupply(pair) {
  const price = parseFloat(pair?.priceUsd || 0)
  const cap = parseFloat(pair?.marketCap || pair?.fdv || 0)
  if (!(price > 0) || !(cap > 0)) return null
  return cap / price
}

/**
 * Pick the deepest pool for a token - the shallow ones carry unreliable prices.
 */
function deepestPair(pairs, tokenAddress) {
  const target = tokenAddress.toLowerCase()
  return pairs
    .filter((p) => p.baseToken?.address?.toLowerCase() === target)
    .sort(
      (a, b) =>
        parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0)
    )[0]
}

/**
 * Assemble the Home board: market data joined to on-chain supply, in the fixed
 * order the assets are declared.
 */
export async function getCoreAssets() {
  const addresses = [...new Set(CORE_ASSETS.map((a) => a.address))]

  // Queried one address at a time on purpose. DexScreener's multi-token
  // endpoint caps its response at 30 pairs across the whole request, so a
  // batch of six starves the later tokens - WPLS and eHEX came back with no
  // pair at all. One call per token guarantees each its own result set.
  // Assets that name an explicit pool are fetched by pair address instead.
  const pinned = CORE_ASSETS.filter((a) => a.pairAddress)

  const [pairGroups, pinnedPairs, supplyById] = await Promise.all([
    Promise.all(addresses.map((address) => getPairsByTokens([address]))),
    Promise.all(pinned.map((a) => getPulsePair(a.pairAddress))),
    fetchSupplyData(),
  ])

  const pairs = pairGroups.flat()
  const pinnedById = {}
  pinned.forEach((asset, i) => {
    if (pinnedPairs[i]) pinnedById[asset.id] = pinnedPairs[i]
  })

  return CORE_ASSETS.map((asset) => {
    const pair = pinnedById[asset.id] || deepestPair(pairs, asset.address)
    const onChain = supplyById[asset.id] || {}

    const priceUsd = parseFloat(pair?.priceUsd || 0)
    const supply = asset.isNative ? derivePlsSupply(pair) : onChain.supply ?? null

    // Recompute market cap from the supply actually shown, so the two figures
    // on the card can never contradict each other.
    const marketCap =
      supply !== null && priceUsd > 0
        ? supply * priceUsd
        : parseFloat(pair?.marketCap || pair?.fdv || 0)

    return {
      ...asset,
      pair: pair || null,
      pairAddress: pair?.pairAddress || null,
      logoUrl: pair?.info?.imageUrl || null,
      priceUsd,
      // Four windows of momentum, which is what the card charts instead of a
      // sparkline - there is no free price history endpoint for these pairs,
      // and these values are reported directly.
      change5m: pair?.priceChange?.m5 ?? null,
      change1h: pair?.priceChange?.h1 ?? null,
      change6h: pair?.priceChange?.h6 ?? null,
      change24h: pair?.priceChange?.h24 ?? null,

      volume24h: parseFloat(pair?.volume?.h24 || 0),
      liquidityUsd: parseFloat(pair?.liquidity?.usd || 0),
      marketCap,
      supply,
      // Native PLS has no ERC20 burn balance to read.
      burned: asset.isNative ? null : onChain.burned ?? null,

      // Order flow over the last day, used for the buy/sell pressure bar.
      buys24h: pair?.txns?.h24?.buys ?? 0,
      sells24h: pair?.txns?.h24?.sells ?? 0,
      venue: pair?.dexId || null,
    }
  })
}

export { WPLS_ADDRESS }
