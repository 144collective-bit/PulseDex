import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
import { pulsechain } from '../config/pulsechain'
import { CORE_ASSETS, BURN_ADDRESSES, WPLS_ADDRESS } from '../config/coreAssets'
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

  // One totalSupply plus one balanceOf per burn sink, for every asset.
  const perAsset = 1 + BURN_ADDRESSES.length

  const contracts = erc20s.flatMap((asset) => [
    { address: asset.address, abi: ERC20_ABI, functionName: 'totalSupply' },
    ...BURN_ADDRESSES.map((sink) => ({
      address: asset.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [sink],
    })),
  ])

  const byId = {}

  try {
    // allowFailure keeps one unresponsive contract from voiding the whole batch.
    const results = await client.multicall({ contracts, allowFailure: true })

    erc20s.forEach((asset, i) => {
      const base = i * perAsset
      const supplyRes = results[base]

      const rawSupply =
        supplyRes?.status === 'success' ? supplyRes.result : null
      const total =
        rawSupply === null ? null : parseFloat(formatUnits(rawSupply, asset.decimals))

      // Sum every sink. A sink that fails contributes nothing rather than
      // voiding the figure.
      let burned = null
      BURN_ADDRESSES.forEach((_, s) => {
        const res = results[base + 1 + s]
        if (res?.status !== 'success') return
        const amt = parseFloat(formatUnits(res.result, asset.decimals))
        burned = (burned || 0) + amt
      })

      // Burned tokens still count in totalSupply, so subtract them out to get
      // what is actually live.
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
 * Native PLS held at the burn sinks. It has no ERC20 contract, so these are
 * account balances rather than token balances.
 */
async function fetchNativeBurned() {
  try {
    const balances = await Promise.all(
      BURN_ADDRESSES.map((address) => client.getBalance({ address }))
    )
    return balances.reduce(
      (sum, wei) => sum + parseFloat(formatUnits(wei, 18)),
      0
    )
  } catch (err) {
    console.warn('native burn read failed:', err.message)
    return null
  }
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

/** Trades in the last day before a pool's price is treated as a real one. */
const LIVE_TXNS_24H = 25

/** And a dollar figure with it, so a handful of dust trades does not qualify. */
const LIVE_VOLUME_24H = 1_000

/** DexScreener's id for PulseX, across its versions. */
const isPulseX = (pair) => String(pair?.dexId || '').toLowerCase().startsWith('pulsex')

const liquidityOf = (pair) => parseFloat(pair?.liquidity?.usd || 0)
const volumeOf = (pair) => parseFloat(pair?.volume?.h24 || 0)
const txnsOf = (pair) => (pair?.txns?.h24?.buys || 0) + (pair?.txns?.h24?.sells || 0)

/** A pool that actually traded today, rather than one merely holding money. */
const isLive = (pair) => txnsOf(pair) >= LIVE_TXNS_24H && volumeOf(pair) >= LIVE_VOLUME_24H

/**
 * Pick the pool a token's price should be read from.
 *
 * Depth alone is the wrong test, and quietly produced wrong prices on this
 * board. PulseChain carries a set of pools - eHEX/NananaX, WPLS/NananaX,
 * WPLS/MULE and others on 9mm - holding one to two million dollars of paired
 * liquidity and trading once a day, at prices that drift far from the market:
 * eHEX read $0.001327 against a real $0.001215, and PLS would have read
 * $0.0000126 against $0.00001126. Both were the deepest pool for their token
 * and both were nine to twelve per cent wrong. The pinned pair on PLS in the
 * config was a hand-patch over this same fault.
 *
 * So depth is the tiebreak, not the test. PulseX comes first because it is the
 * chain's primary venue and the one these assets are quoted against; a pool
 * that traded today comes before one that did not; and only then does size
 * decide. Each rule is a fallback rather than a filter, so a token with no
 * PulseX market, or no market at all today, still resolves to something.
 */
function selectPair(pairs, tokenAddress) {
  const target = tokenAddress.toLowerCase()
  const candidates = pairs.filter(
    (p) => p.baseToken?.address?.toLowerCase() === target
  )
  if (!candidates.length) return undefined

  // Higher is better, and the gaps are wide enough that depth can never
  // promote a tier - the point of the ordering is that it outranks size.
  const tier = (pair) => {
    const pulsex = isPulseX(pair)
    const live = isLive(pair)
    if (pulsex && live) return 3
    if (pulsex) return 2
    if (live) return 1
    return 0
  }

  return candidates.sort((a, b) => tier(b) - tier(a) || liquidityOf(b) - liquidityOf(a))[0]
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

  const [pairGroups, pinnedPairs, supplyById, nativeBurned] = await Promise.all([
    Promise.all(addresses.map((address) => getPairsByTokens([address]))),
    Promise.all(pinned.map((a) => getPulsePair(a.pairAddress))),
    fetchSupplyData(),
    fetchNativeBurned(),
  ])

  const pairs = pairGroups.flat()
  const pinnedById = {}
  pinned.forEach((asset, i) => {
    if (pinnedPairs[i]) pinnedById[asset.id] = pinnedPairs[i]
  })

  return CORE_ASSETS.map((asset) => {
    /*
     * A pin is a preference, not an instruction.
     *
     * Pinning names one pool forever, and pools do not last forever - the ones
     * this board had to be protected from are themselves pools that were
     * healthy once and now trade once a day. A pin that outlived its pool
     * would reintroduce exactly the fault it was added to avoid, silently. So
     * it is honoured only while it still trades, and otherwise the ranking
     * decides, which is now able to.
     */
    const pinned = pinnedById[asset.id]
    const pair = (pinned && isLive(pinned) ? pinned : null) || selectPair(pairs, asset.address)
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
      /*
       * Four windows of momentum, reported directly by the market API.
       *
       * These used to be all the card had, for want of any free price history
       * for these pairs. There is history now - GeckoTerminal covers them by
       * pool address - and the card draws it behind its header, but these stay
       * the figures of record: they are the venue's own numbers, while the
       * line is a shape read off hourly closes.
       */
      change5m: pair?.priceChange?.m5 ?? null,
      change1h: pair?.priceChange?.h1 ?? null,
      change6h: pair?.priceChange?.h6 ?? null,
      change24h: pair?.priceChange?.h24 ?? null,

      volume24h: parseFloat(pair?.volume?.h24 || 0),
      liquidityUsd: parseFloat(pair?.liquidity?.usd || 0),
      marketCap,
      supply,
      // Native PLS is read from account balances, not an ERC20 contract.
      burned: asset.isNative ? nativeBurned : onChain.burned ?? null,

      // Order flow over the last day, used for the buy/sell pressure bar.
      buys24h: pair?.txns?.h24?.buys ?? 0,
      sells24h: pair?.txns?.h24?.sells ?? 0,
      venue: pair?.dexId || null,
    }
  })
}

export { WPLS_ADDRESS }
