import { KNOWN_PULSE_TOKENS, DEFAULT_PAIR_ADDRESS } from '../config/pulsechain'

const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex'

// Known stablecoins to exclude from being displayed as the primary / base coin
export const STABLECOIN_SYMBOLS = new Set([
  'DAI',
  'USDC',
  'USDT',
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
  'USDC.E',
  'DAI.E',
  'USDT.E',
  'WPLS/DAI',
  'DAI/USDC',
])

export function isStablecoin(symbol) {
  if (!symbol) return false
  const clean = symbol.toUpperCase().trim()
  return (
    STABLECOIN_SYMBOLS.has(clean) ||
    clean.startsWith('USD') ||
    clean.endsWith('USD') ||
    clean === 'USDC' ||
    clean === 'USDT' ||
    clean === 'DAI'
  )
}

// Cache to prevent hitting rate limits aggressively
const cache = new Map()
const CACHE_TTL = 10000 // 10 seconds

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
 * Search pairs on PulseChain (filtering out stablecoins as main base token)
 * Also parses full URLs (plsx.fun, pulsechain.com, dexscreener) to extract 0x addresses
 */
export async function searchPulsePairs(query) {
  if (!query || query.trim() === '') return []
  try {
    let cleanQuery = query.trim()
    // Extract 0x address if user pasted a full URL (e.g. https://plsx.fun/token/0x...)
    const addressMatch = cleanQuery.match(/0x[a-fA-F0-9]{40}/)
    if (addressMatch) {
      cleanQuery = addressMatch[0]
    }

    const url = `${DEXSCREENER_BASE}/search?q=${encodeURIComponent(cleanQuery)}`
    const data = await fetchWithCache(url)
    if (!data || !data.pairs) return []
    
    // Filter specifically for PulseChain and exclude stable-to-stable pairs
    return data.pairs.filter(
      (p) =>
        p.chainId?.toLowerCase() === 'pulsechain' &&
        !(isStablecoin(p.baseToken?.symbol) && isStablecoin(p.quoteToken?.symbol))
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
}

// Blocked fake or spam tokens masquerading as core assets
export const BLOCKED_FAKE_ADDRESSES = new Set([
  '0x260e5da7ef6e30e0a647d1adf47628198dcb0709', // Fake PLS
])

/**
 * Determine ranking priority strictly by verified official contract address:
 * 1: WPLS (Wrapped Pulse - 0xa1077a294dde1b09bb078844df40758a5d0f9a27)
 * 2: PLSX (PulseX - 0x95b303987a60c71504d99aa1b13b4da07b0790ab / 0x8a810ea8b121d08342e9e7696f4a9915cbe494b7)
 * 3: HEX (HEX on PulseChain - 0x2b591e99afe9f32eaa6214f7b7629768c40eeb39 / eHEX)
 * 4: INC (Incentive Token - 0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d / 0x2fa807748803010e623e789542345de171cac391)
 */
export function getCorePulseRank(pair) {
  if (!pair) return 999
  const baseAddr = pair.baseToken?.address?.toLowerCase() || ''

  if (BLOCKED_FAKE_ADDRESSES.has(baseAddr)) return 999

  // 1. WPLS strictly by contract address (prevents fake tokens)
  if (baseAddr === CORE_PULSE_CONTRACTS.WPLS) return 1
  // 2. PLSX strictly by contract address
  if (baseAddr === CORE_PULSE_CONTRACTS.PLSX_1 || baseAddr === CORE_PULSE_CONTRACTS.PLSX_2) return 2
  // 3. HEX strictly by contract address
  if (baseAddr === CORE_PULSE_CONTRACTS.HEX_PLS || baseAddr === CORE_PULSE_CONTRACTS.HEX_ETH) return 3
  // 4. INC strictly by contract address
  if (baseAddr === CORE_PULSE_CONTRACTS.INC_1 || baseAddr === CORE_PULSE_CONTRACTS.INC_2) return 4

  return 999
}

/**
 * Fetch top pulsechain pairs across known ecosystem tokens & active volume leaders
 * Filters out stablecoins and ensures main PulseX liquidity pools are selected!
 */
export async function getTopPulsePairs() {
  try {
    const pairMap = new Map()

    // 1. Fetch by known non-stable token contract addresses
    const nonStableTokens = KNOWN_PULSE_TOKENS.filter((t) => !isStablecoin(t.symbol))
    const tokenAddrs = nonStableTokens.map((t) => t.address)
    const tokenPairs = await getPairsByTokens(tokenAddrs)
    tokenPairs.forEach((p) => {
      if (p.pairAddress) {
        pairMap.set(p.pairAddress.toLowerCase(), p)
      }
    })

    // 2. Fetch by ecosystem search keywords for high volume tradeable pairs
    // Expanding queries to cast a wide net across all pulsechain DEXes and catch top meme/alt coins
    const searchQueries = [
      'pulsechain', 'pulsex', 'v1', 'v2',
      'WPLS', 'PLSX', 'HEX', 'INC', 'HDRN', 'TEXAN', 'DAI', 'USDC', 'WETH', 'USDT'
    ]
    const searchResults = await Promise.all(
      searchQueries.map((q) => searchPulsePairs(q))
    )

    searchResults.flat().forEach((p) => {
      if (p.pairAddress && !pairMap.has(p.pairAddress.toLowerCase())) {
        pairMap.set(p.pairAddress.toLowerCase(), p)
      }
    })

    // 3. Filter out pairs where baseToken is a stablecoin OR stable-to-stable pairs, or fake/spam tokens
    const filtered = Array.from(pairMap.values()).filter((p) => {
      if (p.chainId && p.chainId !== 'pulsechain') return false
      const baseAddr = p.baseToken?.address?.toLowerCase() || ''
      const quoteAddr = p.quoteToken?.address?.toLowerCase() || ''
      if (BLOCKED_FAKE_ADDRESSES.has(baseAddr) || BLOCKED_FAKE_ADDRESSES.has(quoteAddr)) return false

      const baseSym = p.baseToken?.symbol
      const quoteSym = p.quoteToken?.symbol
      // Disallow stablecoin as baseToken (e.g. USDC/WPLS, DAI/WPLS, DAI/USDC)
      if (isStablecoin(baseSym)) return false
      // Disallow stable-to-stable
      if (isStablecoin(baseSym) && isStablecoin(quoteSym)) return false

      // Filter out spam/dummy pools with artificial metrics
      if (quoteSym === 'MULE' || baseSym === 'MULE') return false

      return true
    })

    // 4. Sort: 4 Core PulseChain Tokens strictly at top (WPLS, PLSX, HEX, INC), then by 24h volume descending
    filtered.sort((a, b) => {
      const rankA = getCorePulseRank(a)
      const rankB = getCorePulseRank(b)
      if (rankA !== rankB) return rankA - rankB
      const volA = Number(a.volume?.h24 || 0)
      const volB = Number(b.volume?.h24 || 0)
      return volB - volA
    })

    return filtered
  } catch (err) {
    console.error('getTopPulsePairs error:', err)
    return []
  }
}

/**
 * Deduplicate pairs by base token address, keeping the pool with the highest score
 * (Prioritizes PulseX and liquidity/volume)
 */
export function deduplicatePairs(pairs) {
  const uniqueTokens = new Map()
  
  pairs.forEach((p) => {
    const baseAddr = p.baseToken?.address?.toLowerCase() || ''
    if (!baseAddr) return
    
    const tokenKey = baseAddr
    const isPulseX = (p.dexId || '').toLowerCase().includes('pulsex')
    const currentLiq = Number(p.liquidity?.usd || 0)
    const currentVol = Number(p.volume?.h24 || 0)
    
    // Calculate pool score (favor PulseX official AMM)
    const score = (isPulseX ? 100000000 : 0) + currentLiq + (currentVol * 0.2)

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
    // Primary WPLS/DAI pair for exact PLS price
    const pair = await getPulsePair('0xE56043671df55dE5CDf8459710433C10324DE0aE')
    if (pair && pair.priceUsd) {
      return parseFloat(pair.priceUsd)
    }
    return 0.00001455 // live estimate
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
