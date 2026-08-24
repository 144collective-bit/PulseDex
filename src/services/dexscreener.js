import { KNOWN_PULSE_TOKENS, DEFAULT_PAIR_ADDRESS } from '../config/pulsechain'
import { calculateTokenMarketScore } from '../utils/formatters'

const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex'

// Known stablecoins to exclude from being displayed as the primary / base coin
export const STABLECOIN_SYMBOLS = new Set([
  'DAI.E',
  'USDC.E',
  'USDT.E',
  'USDL',
  'CST',
  'BUSD',
  'TUSD',
  'FRAX',
  'LUSD',
  'MIM',
  'USDD',
  'USDE',
  'GUSD',
  'USD',
  'EUR',
  'EURC',
])

export function isStablecoin(symbol) {
  if (!symbol) return false
  const clean = symbol.toUpperCase().trim()
  return (
    STABLECOIN_SYMBOLS.has(clean) ||
    clean === 'USDL' ||
    clean === 'CST' ||
    clean === 'BUSD' ||
    clean === 'TUSD' ||
    clean === 'FRAX' ||
    clean === 'LUSD'
  )
}

// Cache to prevent hitting rate limits aggressively
const cache = new Map()
const CACHE_TTL = 8000 // 8 seconds

async function fetchWithCache(url) {
  const now = Date.now()
  if (cache.has(url)) {
    const { timestamp, data } = cache.get(url)
    if (now - timestamp < CACHE_TTL) {
      return data
    }
  }

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    cache.set(url, { timestamp: now, data })
    return data
  } catch (err) {
    console.warn(`DexScreener fetch failed for ${url}:`, err)
    if (cache.has(url)) {
      return cache.get(url).data
    }
    throw err
  }
}

/**
 * Search pairs on PulseChain (filtering out dead test pools)
 */
export async function searchPulsePairs(query) {
  if (!query || query.trim() === '') return []
  try {
    let cleanQuery = query.trim()
    const addressMatch = cleanQuery.match(/0x[a-fA-F0-9]{40}/)
    if (addressMatch) {
      cleanQuery = addressMatch[0]
    }

    const url = `${DEXSCREENER_BASE}/search?q=${encodeURIComponent(cleanQuery)}`
    const data = await fetchWithCache(url)
    if (!data || !data.pairs) return []

    return data.pairs.filter(
      (p) =>
        p.chainId?.toLowerCase() === 'pulsechain' &&
        (parseFloat(p.liquidity?.usd || 0) > 20 || parseFloat(p.volume?.h24 || 0) > 20)
    )
  } catch (err) {
    console.error('searchPulsePairs error:', err)
    return []
  }
}

/**
 * Fetch a specific pair by contract address on PulseChain
 */
export async function getPulsePair(pairAddress = DEFAULT_PAIR_ADDRESS) {
  if (!pairAddress) return null
  try {
    const cleanAddr = pairAddress.trim()
    const url = `${DEXSCREENER_BASE}/pairs/pulsechain/${cleanAddr}`
    const data = await fetchWithCache(url)
    if (data && data.pairs && data.pairs.length > 0) {
      return data.pairs[0]
    }
    if (data && data.pair) {
      return data.pair
    }

    // Fallback: search by address
    const searchResults = await searchPulsePairs(cleanAddr)
    if (searchResults.length > 0) {
      return searchResults[0]
    }

    return null
  } catch (err) {
    console.error('getPulsePair error:', err)
    return null
  }
}

/**
 * Fetch pairs for multiple tokens on PulseChain (chunked into batches of 25 to respect API limits)
 */
export async function getPairsByTokens(tokenAddresses = []) {
  if (!tokenAddresses.length) return []
  try {
    const CHUNK_SIZE = 25
    const chunks = []
    for (let i = 0; i < tokenAddresses.length; i += CHUNK_SIZE) {
      chunks.push(tokenAddresses.slice(i, i + CHUNK_SIZE))
    }

    const chunkPromises = chunks.map(async (chunk) => {
      try {
        const addrString = chunk.join(',')
        const url = `${DEXSCREENER_BASE}/tokens/${addrString}`
        const data = await fetchWithCache(url)
        if (!data || !data.pairs) return []
        return data.pairs.filter(
          (p) => p.chainId?.toLowerCase() === 'pulsechain'
        )
      } catch (chunkErr) {
        console.warn('DexScreener chunk fetch failed:', chunkErr.message)
        return []
      }
    })

    const results = await Promise.all(chunkPromises)
    return results.flat()
  } catch (err) {
    console.error('getPairsByTokens error:', err)
    return []
  }
}

/**
 * Verified Official Contract Addresses for Core PulseChain Ecosystem Assets
 */
export const CORE_PULSE_CONTRACTS = {
  WPLS: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
  PLSX_1: '0x95b303987a60c71504d99aa1b13b4da07b0790ab',
  PLSX_2: '0x8a810ea8b121d08342e9e7696f4a9915cbe494b7',
  HEX_PLS: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',
  HEX_ETH: '0x57fde0a71132198bbec939bb98976993d8d89d225',
  INC_1: '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d',
  INC_2: '0x2fa807748803010e623e789542345de171cac391',
  DAI: '0xefd766ccb38eaf1dfd701853bfce31359239f305',
  WETH: '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c',
  USDC: '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07',
  USDT: '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f',
  HDRN: '0x3819f64f282bf135d62168c1e513280daf905e06',
}

// Blocked fake or spam tokens masquerading as core assets
export const BLOCKED_FAKE_ADDRESSES = new Set([
  '0x260e5da7ef6e30e0a647d1adf47628198dcb0709', // Fake PLS
])

/**
 * Determine ranking priority strictly by verified official contract address:
 * 1: WPLS (Wrapped Pulse)
 * 2: PLSX (PulseX)
 * 3: HEX (PulseChain HEX / eHEX)
 * 4: INC (Incentive Token)
 * 5: DAI
 * 6: WETH
 * 7: USDC / USDT
 * 8: HDRN
 */
export function getCorePulseRank(pair) {
  if (!pair) return 999
  const baseAddr = pair.baseToken?.address?.toLowerCase() || ''
  const quoteAddr = pair.quoteToken?.address?.toLowerCase() || ''

  if (BLOCKED_FAKE_ADDRESSES.has(baseAddr) || BLOCKED_FAKE_ADDRESSES.has(quoteAddr)) return 999

  // 1. WPLS strictly by contract address
  if (baseAddr === CORE_PULSE_CONTRACTS.WPLS) return 1
  // 2. PLSX strictly by contract address
  if (baseAddr === CORE_PULSE_CONTRACTS.PLSX_1 || baseAddr === CORE_PULSE_CONTRACTS.PLSX_2) return 2
  // 3. HEX strictly by contract address
  if (baseAddr === CORE_PULSE_CONTRACTS.HEX_PLS || baseAddr === CORE_PULSE_CONTRACTS.HEX_ETH) return 3
  // 4. INC strictly by contract address
  if (baseAddr === CORE_PULSE_CONTRACTS.INC_1 || baseAddr === CORE_PULSE_CONTRACTS.INC_2) return 4
  // 5. DAI
  if (baseAddr === CORE_PULSE_CONTRACTS.DAI) return 5
  // 6. WETH
  if (baseAddr === CORE_PULSE_CONTRACTS.WETH) return 6
  // 7. USDC / USDT
  if (baseAddr === CORE_PULSE_CONTRACTS.USDC || baseAddr === CORE_PULSE_CONTRACTS.USDT) return 7
  // 8. HDRN
  if (baseAddr === CORE_PULSE_CONTRACTS.HDRN) return 8

  return 999
}

/**
 * Fetch top pulsechain pairs across known ecosystem tokens & active volume leaders
 * Filters out dead tokens with $0 prices or 0 liquidity
 * Ranks by composite score (Volume, Liquidity, Market Cap, Trades)
 */
export async function getTopPulsePairs() {
  try {
    const pairMap = new Map()

    // 1. Fetch by known token contract addresses
    const tokenAddrs = KNOWN_PULSE_TOKENS.map((t) => t.address)
    const tokenPairs = await getPairsByTokens(tokenAddrs)
    tokenPairs.forEach((p) => {
      if (p.pairAddress) {
        pairMap.set(p.pairAddress.toLowerCase(), p)
      }
    })

    // 2. Fetch by ecosystem search keywords for high volume tradeable pairs
    const searchQueries = [
      'pulsechain', 'pulsex', 'v1', 'v2',
      'WPLS', 'PLSX', 'HEX', 'INC', 'HDRN', 'TEXAN', 'DAI', 'USDC', 'WETH', 'USDT',
      'TONI', 'LOAN', '9MM', 'ATROPA', 'PRVX', 'PTIRE'
    ]
    const searchResults = await Promise.all(
      searchQueries.map((q) => searchPulsePairs(q))
    )

    searchResults.flat().forEach((p) => {
      if (p.pairAddress && !pairMap.has(p.pairAddress.toLowerCase())) {
        pairMap.set(p.pairAddress.toLowerCase(), p)
      }
    })

    // 3. Filter out spam, dead test pools with $0 price & $0 liquidity
    const filtered = Array.from(pairMap.values()).filter((p) => {
      if (p.chainId && p.chainId !== 'pulsechain') return false
      const baseAddr = p.baseToken?.address?.toLowerCase() || ''
      const quoteAddr = p.quoteToken?.address?.toLowerCase() || ''
      if (BLOCKED_FAKE_ADDRESSES.has(baseAddr) || BLOCKED_FAKE_ADDRESSES.has(quoteAddr)) return false

      const baseSym = p.baseToken?.symbol || ''
      const quoteSym = p.quoteToken?.symbol || ''
      if (quoteSym === 'MULE' || baseSym === 'MULE') return false

      const price = parseFloat(p.priceUsd || 0)
      const liq = parseFloat(p.liquidity?.usd || 0)
      const vol = parseFloat(p.volume?.h24 || 0)

      // Hide dead pairs that have zero price AND zero liquidity
      if (price === 0 && liq < 50 && vol < 50) return false

      return true
    })

    // 4. Sort: Core PulseChain Tokens strictly at top (WPLS, PLSX, HEX, INC, DAI, WETH, etc.),
    // then rank remaining tokens by algorithmic multi-factor market score
    filtered.sort((a, b) => {
      const rankA = getCorePulseRank(a)
      const rankB = getCorePulseRank(b)
      if (rankA !== rankB) return rankA - rankB

      const scoreA = calculateTokenMarketScore(a)
      const scoreB = calculateTokenMarketScore(b)
      return scoreB - scoreA
    })

    return filtered
  } catch (err) {
    console.error('getTopPulsePairs error:', err)
    return []
  }
}

/**
 * Deduplicate pairs by canonical token symbol and address, keeping the pool with the highest market score
 * (Prioritizes PulseX and deepest liquidity & volume)
 */
export function deduplicatePairs(pairs) {
  const uniqueTokens = new Map()

  pairs.forEach((p) => {
    const baseAddr = p.baseToken?.address?.toLowerCase() || ''
    const baseSym = (p.baseToken?.symbol || '').toUpperCase().trim()
    if (!baseAddr && !baseSym) return

    const isCanonicalToken = ['WPLS', 'PLS', 'PLSX', 'HEX', 'INC', 'DAI', 'USDC', 'USDT', 'WETH', 'WBTC', 'HDRN'].includes(baseSym)
    const tokenKey = isCanonicalToken ? baseSym : baseAddr

    const isPulseX = (p.dexId || '').toLowerCase().includes('pulsex')
    const currentLiq = Number(p.liquidity?.usd || 0)
    const currentVol = Number(p.volume?.h24 || 0)

    // Calculate pool score (favor PulseX official AMM and deep liquidity)
    const score = (isPulseX ? 100000000 : 0) + currentLiq + (currentVol * 0.5)

    if (!uniqueTokens.has(tokenKey)) {
      uniqueTokens.set(tokenKey, { pair: p, score })
    } else {
      const existing = uniqueTokens.get(tokenKey)
      if (score > existing.score) {
        uniqueTokens.set(tokenKey, { pair: p, score })
      }
    }
  })

  return Array.from(uniqueTokens.values()).map((item) => item.pair)
}

/**
 * Get PLS price in USD
 */
export async function getNativePlsPrice() {
  try {
    const pair = await getPulsePair('0xE56043671df55dE5CDf8459710433C10324DE0aE')
    if (pair && pair.priceUsd) {
      return parseFloat(pair.priceUsd)
    }
    return 0.00001455
  } catch (err) {
    return 0.00001455
  }
}

/**
 * PulseChain Gas Price estimator via RPC
 */
export async function getPulseGasPrice() {
  try {
    const res = await fetch('https://rpc.pulsechain.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_gasPrice',
        params: [],
        id: 1,
      }),
    })
    const data = await res.json()
    if (data && data.result) {
      const gwei = parseInt(data.result, 16) / 1e9
      return gwei.toFixed(0)
    }
    return '150'
  } catch (err) {
    return '150'
  }
}
