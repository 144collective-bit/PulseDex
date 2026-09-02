import { formatUnits, parseAbiItem } from 'viem'
import { publicClient as client } from './rpc'

/**
 * Candles built from the pool's own Swap events.
 *
 * The chart is drawn from GeckoTerminal, which is a copy. A Uniswap-V2 pair
 * emits every trade it makes, with exact amounts in and out, so the candles can
 * be built from the original instead - and the original has no rate limit, no
 * outage that is somebody else's, and no gap for a pair too new to have been
 * indexed, which is most of what the Trenches board is looking at.
 *
 * What it is not good at is depth of history. A year of candles is thousands of
 * log queries, and pre-computing that is the thing aggregators are genuinely
 * for. So this is built to serve the live tail - the most recent stretch, fresh
 * to the block - and to be merged onto a history fetched the existing way.
 *
 * The arithmetic is separated from the fetching, because what a candle claims a
 * price was is worth being able to check without a network.
 */

export const SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)'
)

export const PAIR_ABI = [
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'token1', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
]

const DECIMALS_ABI = [
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
]

/**
 * PulseChain's block time, near enough for sizing a lookback window.
 *
 * Only ever used to decide how far back to ask - never to date a candle, which
 * always uses the block's own timestamp. An estimate is fine for "roughly an
 * hour of blocks" and would be a lie on a chart axis.
 */
export const BLOCK_SECONDS = 10

/**
 * One swap's execution price, in token1 per token0.
 *
 * A V2 swap moves one token in and the other out, so exactly one of each pair
 * of amounts is non-zero and adding them picks whichever it was without
 * branching on direction.
 *
 * Returns null when either side is zero. That happens on malformed or
 * zero-value events, and a price computed from them would be either a division
 * by zero or a spike to infinity - on a chart, a candle that erases the axis.
 */
export function priceFromSwap(log, decimals0, decimals1) {
  const a = log?.args
  if (!a) return null

  const in0 = a.amount0In ?? 0n
  const in1 = a.amount1In ?? 0n
  const out0 = a.amount0Out ?? 0n
  const out1 = a.amount1Out ?? 0n

  const total0 = in0 + out0
  const total1 = in1 + out1
  if (total0 <= 0n || total1 <= 0n) return null

  const amount0 = Number(formatUnits(total0, decimals0))
  const amount1 = Number(formatUnits(total1, decimals1))
  if (!(amount0 > 0) || !(amount1 > 0)) return null

  return {
    price: amount1 / amount0,
    amount0,
    amount1,
    // Which way the trade went, for anything that wants to colour it: token0
    // arriving at the pool means token0 was sold.
    isSell: in0 > 0n,
  }
}

/**
 * Swaps into OHLCV candles.
 *
 * `swaps` are {time, price, volume} already priced, in any order. Buckets are
 * aligned to the interval so a candle's timestamp is the same figure any other
 * source would produce for it - which is what lets these be merged with a
 * history fetched elsewhere.
 *
 * A bucket with no trades produces no candle rather than a flat one carried
 * forward. On a chain where a pool can be untouched for an hour, drawing that
 * hour as a run of identical candles states activity that did not happen.
 */
export function bucketSwaps(swaps, intervalSeconds) {
  if (!Array.isArray(swaps) || !(intervalSeconds > 0)) return []

  const ordered = swaps
    .filter((s) => s && Number.isFinite(s.time) && Number.isFinite(s.price) && s.price > 0)
    .sort((a, b) => a.time - b.time)

  const byBucket = new Map()

  for (const swap of ordered) {
    const key = Math.floor(swap.time / intervalSeconds) * intervalSeconds
    const candle = byBucket.get(key)
    const volume = Number.isFinite(swap.volume) ? swap.volume : 0

    if (!candle) {
      byBucket.set(key, {
        time: key,
        open: swap.price,
        high: swap.price,
        low: swap.price,
        close: swap.price,
        volume,
        trades: 1,
      })
      continue
    }

    // Open is the first by time and stays; close is whatever came last. The
    // sort above is what makes both true.
    candle.high = Math.max(candle.high, swap.price)
    candle.low = Math.min(candle.low, swap.price)
    candle.close = swap.price
    candle.volume += volume
    candle.trades += 1
  }

  return Array.from(byBucket.values()).sort((a, b) => a.time - b.time)
}

/**
 * A history from elsewhere, with fresh candles laid over its end.
 *
 * The seam is the earliest live candle: history is kept strictly before it, and
 * everything from there on is the on-chain version. Overlapping rather than
 * appending matters because the aggregator's most recent candle is usually
 * still forming and minutes stale - keeping both would draw the same minute
 * twice, at two different prices.
 *
 * With no live candles this returns the history untouched, which is what makes
 * it safe to switch on: the worst case is the chart it already draws.
 */
export function mergeCandleSeries(history, live) {
  const past = Array.isArray(history) ? history : []
  const fresh = Array.isArray(live) ? live : []

  if (fresh.length === 0) return past.slice().sort((a, b) => a.time - b.time)

  const seam = fresh[0].time
  const kept = past.filter((c) => Number.isFinite(c?.time) && c.time < seam)

  return [...kept, ...fresh].sort((a, b) => a.time - b.time)
}

/**
 * How many blocks back to ask for, for a given stretch of time.
 *
 * Capped, because a public RPC will refuse a wide `getLogs` range and refusing
 * is the good case - the bad one is a node that accepts it and takes twenty
 * seconds.
 */
export function lookbackBlocks(seconds, { max = 5000 } = {}) {
  if (!(seconds > 0)) return 0
  return Math.min(max, Math.ceil(seconds / BLOCK_SECONDS))
}

/*
 * Block timestamps, cached for the life of the page.
 *
 * A mined block's timestamp cannot change, so this is the rare case where a
 * cache needs no expiry at all. It matters: the timestamps are the expensive
 * part of building candles this way - one read per block that had a swap - and
 * a chart that refreshes every few seconds would otherwise re-ask for the same
 * answers indefinitely.
 */
const blockTimes = new Map()

export function __clearBlockTimeCache() {
  blockTimes.clear()
}

async function timestampsFor(blockNumbers) {
  const unknown = blockNumbers.filter((n) => !blockTimes.has(n))

  // In parallel rather than in sequence: these are independent reads, and the
  // difference over a busy hour is seconds of staring at a blank chart.
  await Promise.all(
    unknown.map(async (number) => {
      const block = await client.getBlock({ blockNumber: number })
      blockTimes.set(number, Number(block.timestamp))
    })
  )

  return blockTimes
}

/** token0, token1 and their decimals. Fixed for the life of a pair. */
const pairMeta = new Map()

export async function getPairMeta(pair) {
  const key = String(pair).toLowerCase()
  if (pairMeta.has(key)) return pairMeta.get(key)

  const [token0, token1] = await Promise.all([
    client.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token0' }),
    client.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token1' }),
  ])

  const [decimals0, decimals1] = await Promise.all([
    client.readContract({ address: token0, abi: DECIMALS_ABI, functionName: 'decimals' }),
    client.readContract({ address: token1, abi: DECIMALS_ABI, functionName: 'decimals' }),
  ])

  const meta = {
    token0,
    token1,
    decimals0: Number(decimals0),
    decimals1: Number(decimals1),
  }
  pairMeta.set(key, meta)
  return meta
}

/**
 * Recent candles for one pool, straight from its Swap events.
 *
 * `invert` flips the quote to token0 per token1. Which way round a pool is
 * numbered is an accident of the token addresses, so the caller has to say
 * which side it is pricing - getting it upside down produces a chart that looks
 * entirely plausible and is the reciprocal of the truth.
 *
 * @returns {Promise<{candles: Array, fromBlock: bigint, toBlock: bigint, swaps: number}>}
 */
export async function getOnchainCandles({
  pair,
  intervalSeconds = 60,
  seconds = 3600,
  invert = false,
}) {
  if (!pair) return { candles: [], fromBlock: 0n, toBlock: 0n, swaps: 0 }

  const head = await client.getBlockNumber()
  const span = BigInt(lookbackBlocks(seconds))
  const fromBlock = head > span ? head - span : 0n

  const logs = await client.getLogs({ address: pair, event: SWAP_EVENT, fromBlock, toBlock: head })
  if (logs.length === 0) return { candles: [], fromBlock, toBlock: head, swaps: 0 }

  const meta = await getPairMeta(pair)
  const times = await timestampsFor([...new Set(logs.map((l) => l.blockNumber))])

  const priced = []
  for (const log of logs) {
    const point = priceFromSwap(log, meta.decimals0, meta.decimals1)
    if (!point) continue

    const time = times.get(log.blockNumber)
    if (!Number.isFinite(time)) continue

    priced.push({
      time,
      price: invert ? 1 / point.price : point.price,
      // Volume in the quote asset, matching the side being priced.
      volume: invert ? point.amount0 : point.amount1,
    })
  }

  return {
    candles: bucketSwaps(priced, intervalSeconds),
    fromBlock,
    toBlock: head,
    swaps: priced.length,
  }
}
