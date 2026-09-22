import { createPublicClient, http } from 'viem'
import { BALANCE_TTL_MS, asAmount, isFresh } from '../../src/utils/gate.js'

/**
 * Reading an ERC-20 balance, with a short memory.
 *
 * Sits in the posting path for a gated room, which is the whole reason it is
 * careful: every message written in a holders-only room waits on this, so it
 * has to be fast when it can be and give up quickly when it cannot.
 *
 * The cache is per serverless instance and deliberately so. A shared cache
 * would mean a round trip to something else before the round trip this is
 * meant to avoid, and the thing being cached is worth sixty seconds. An
 * instance that has never seen an address simply reads the chain.
 */

const RPC_URL = process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'

/** Short, because a posting path is not a place to wait. Shorter than the
 *  deployer lookup's: that one runs once in a token's life, this runs on
 *  every message. */
const TIMEOUT_MS = 3500

const client = createPublicClient({
  chain: {
    id: 369,
    name: 'PulseChain',
    nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  },
  transport: http(RPC_URL, { timeout: TIMEOUT_MS }),
})

const BALANCE_OF = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
]

const METADATA = [
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
]

/**
 * What was read, and when.
 *
 * A plain Map, bounded below, keyed by token and holder together. Unbounded
 * it would be a memory leak with a public write path in front of it - anybody
 * posting in a gated room adds an entry - so it is cleared wholesale once it
 * gets big rather than carrying an eviction policy nobody will tune.
 * Wholesale because the cost of a cleared cache is one extra chain read per
 * poster, which is the ordinary path anyway.
 */
const cache = new Map()
const MAX_ENTRIES = 5000

const keyFor = (token, holder) => `${token}:${holder}`

/** What is remembered about this pair, or null. */
export function cachedBalance(token, holder) {
  return cache.get(keyFor(token, holder)) || null
}

function remember(token, holder, balance) {
  if (cache.size >= MAX_ENTRIES) cache.clear()
  cache.set(keyFor(token, holder), { balance, at: Date.now() })
}

/**
 * This holder's balance of this token, or null when the chain did not answer.
 *
 * Null is not zero and the difference is the whole of the gating decision -
 * see `gateDecision` in src/utils/gate.js. Zero means "checked, holds
 * nothing"; null means "not checked", and those two must never be collapsed
 * into a falsy test.
 *
 * A fresh cache entry is returned without touching the network. A stale one
 * is left in place when the read fails, so the caller can decide whether it
 * is still worth something.
 *
 * @param {string} token lowercased contract address
 * @param {string} holder lowercased wallet address
 * @returns {Promise<bigint|null>}
 */
export async function readBalance(token, holder) {
  const known = cachedBalance(token, holder)
  if (isFresh(known)) return known.balance

  try {
    const balance = await client.readContract({
      address: token,
      abi: BALANCE_OF,
      functionName: 'balanceOf',
      args: [holder],
    })

    const amount = asAmount(balance)
    // A node answering with something that is not a uint256 is a node that
    // has not answered. Treated as a failure rather than coerced.
    if (amount === null) return null

    remember(token, holder, amount)
    return amount
  } catch (err) {
    console.error('gate: reading a balance failed:', err.message)
    return null
  }
}

/**
 * A token's decimals and symbol, read once when a gate is created.
 *
 * Both are stored on the room afterwards, so this never runs in a posting
 * path. Decimals is the one that matters: without it there is no way to turn
 * "1000 tokens" into base units, and a gate stored in the wrong scale is a
 * gate that is wrong by a factor of 10^18.
 *
 * The symbol is decoration and is allowed to fail on its own - a token with a
 * non-standard `symbol()` should not stop a gate being set.
 *
 * @param {string} token
 * @returns {Promise<{decimals: number, symbol: string|null}|null>}
 */
export async function readTokenMetadata(token) {
  let decimals
  try {
    decimals = await client.readContract({
      address: token,
      abi: METADATA,
      functionName: 'decimals',
    })
  } catch (err) {
    console.error('gate: reading decimals failed:', err.message)
    return null
  }

  const places = Number(decimals)
  if (!Number.isInteger(places) || places < 0 || places > 36) return null

  let symbol = null
  try {
    const read = await client.readContract({ address: token, abi: METADATA, functionName: 'symbol' })
    if (typeof read === 'string' && read.trim()) symbol = read.trim().slice(0, 16)
  } catch {
    // Decoration. A token whose symbol() reverts still has a decimals().
  }

  return { decimals: places, symbol }
}

/** Exported for the health check, which reports whether the cache is sane
 *  rather than reaching a node from a request nobody asked to be slow. */
export const balanceCacheSize = () => cache.size

export { BALANCE_TTL_MS }
