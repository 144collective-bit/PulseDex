import { parseAbi, formatUnits } from 'viem'
import { KNOWN_PULSE_TOKENS, DEFAULT_PAIR_ADDRESS } from '../config/pulsechain'
import { publicClient as client } from './rpc'
import { getPairsByTokens, getNativePlsPrice, getPulsePair } from './dexscreener'
import { fetchWithRetry } from './pulsescan'

const PULSESCAN_BASE_URL = 'https://api.scan.pulsechain.com/api/v2'

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
])

/**
 * Fetch token metadata for a custom address from RPC
 */
export async function fetchTokenMetadata(tokenAddress) {
  try {
    const [symbol, name, decimals] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }),
      client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'name',
      }),
      client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
    ])
    return {
      address: tokenAddress,
      symbol,
      name,
      decimals: Number(decimals),
      logo: `https://dd.dexscreener.com/ds-data/tokens/pulsechain/${tokenAddress.toLowerCase()}.png`,
    }
  } catch (err) {
    console.error('fetchTokenMetadata error:', err)
    return null
  }
}

/**
 * Convert raw token balance string with decimals to float number
 */
function parseTokenBalance(rawValue, decimals = 18) {
  if (!rawValue) return 0
  const dec = Number(decimals || 18)
  const str = String(rawValue).split('.')[0]
  if (!str || str === '0') return 0

  if (str.length <= dec) {
    const padded = str.padStart(dec, '0')
    return parseFloat(`0.${padded}`)
  }

  const whole = str.slice(0, str.length - dec)
  const frac = str.slice(str.length - dec, str.length - dec + 6)
  return parseFloat(`${whole}.${frac}`)
}

/**
 * Detect spam or phishing airdrop tokens by symbol/name patterns
 */
export function isSpamToken(token) {
  const symbol = (token.symbol || '').toLowerCase()
  const name = (token.name || '').toLowerCase()
  const spamKeywords = [
    'claim on',
    'visit to claim',
    '.com',
    '.io',
    '.org',
    '.xyz',
    '-airdrop',
    'airdrop',
    'voucher',
    'bonus',
    'reward',
  ]
  return spamKeywords.some((kw) => symbol.includes(kw) || name.includes(kw))
}

/**
 * Fetch portfolio for a single wallet address with comprehensive on-chain discovery
 * via PulseScan v2 API + RPC fallback + DexScreener live prices
 */
export async function fetchWalletPortfolio(walletAddress, customTokens = []) {
  if (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length !== 42) {
    return {
      address: walletAddress,
      totalUsd: 0,
      totalPls: 0,
      tokens: [],
      nfts: [],
    }
  }

  const normalizedAddress = walletAddress.trim()

  try {
    // 1. Fetch Native PLS balance and PulseChain price
    const [nativeBalanceBigInt, plsPair] = await Promise.all([
      client.getBalance({ address: normalizedAddress }).catch(() => 0n),
      getPulsePair(DEFAULT_PAIR_ADDRESS).catch(() => null),
    ])

    const plsPriceUsd = plsPair?.priceUsd ? parseFloat(plsPair.priceUsd) : await getNativePlsPrice()
    const plsChange24h = plsPair?.priceChange?.h24 || 0
    const formattedPlsBalance = parseFloat(formatUnits(nativeBalanceBigInt, 18))

    // 2. Fetch all token balances held by the wallet via PulseScan v2 REST API
    let pulseScanTokens = []
    try {
      const scanUrl = `${PULSESCAN_BASE_URL}/addresses/${normalizedAddress}/tokens`
      const scanData = await fetchWithRetry(scanUrl, {}, 2, 800)
      if (scanData && Array.isArray(scanData.items)) {
        pulseScanTokens = scanData.items
      }
    } catch (scanErr) {
      console.warn('[Portfolio] PulseScan address tokens fetch failed, using RPC fallback:', scanErr.message)
    }

    // Map discovered tokens
    const discoveredTokensMap = new Map()

    // Add tokens discovered from PulseScan
    pulseScanTokens.forEach((item) => {
      const token = item.token || {}
      if (!token.address || token.type === 'ERC-721' || token.type === 'ERC-1155') return

      const addrLower = token.address.toLowerCase()
      const decimals = Number(token.decimals || 18)
      const balance = parseTokenBalance(item.value, decimals)

      if (balance > 0) {
        discoveredTokensMap.set(addrLower, {
          address: token.address,
          symbol: token.symbol || 'TOKEN',
          name: token.name || 'Pulse Token',
          decimals,
          balance,
          rawBalance: item.value,
          logo: token.icon_url || `https://dd.dexscreener.com/ds-data/tokens/pulsechain/${addrLower}.png`,
        })
      }
    })

    // Add known top tokens and user custom tokens if missing
    const fallbackList = [...KNOWN_PULSE_TOKENS, ...customTokens]
    const missingTokens = fallbackList.filter((t) => !discoveredTokensMap.has(t.address.toLowerCase()))

    if (missingTokens.length > 0) {
      const rpcPromises = missingTokens.map(async (t) => {
        try {
          const bal = await client.readContract({
            address: t.address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [normalizedAddress],
          })
          const formatted = parseFloat(formatUnits(bal, t.decimals || 18))
          return { ...t, balance: formatted, rawBalance: bal.toString() }
        } catch {
          return { ...t, balance: 0, rawBalance: '0' }
        }
      })

      const rpcResults = await Promise.all(rpcPromises)
      rpcResults.forEach((t) => {
        if (t.balance > 0 || customTokens.some((ct) => ct.address.toLowerCase() === t.address.toLowerCase())) {
          discoveredTokensMap.set(t.address.toLowerCase(), t)
        }
      })
    }

    // 3. Query DexScreener for live pricing across all discovered tokens.
    //
    // One request per token on purpose. The multi-token endpoint caps its
    // response at 30 pairs for the whole request regardless of how many
    // addresses are asked for, so batching starves everything after the first
    // few - which is why holdings further down the list priced at $0.00 while
    // clearly having a market.
    const allAddresses = Array.from(discoveredTokensMap.values()).map((t) => t.address)
    const pairGroups = await Promise.all(
      allAddresses.map((address) => getPairsByTokens([address]).catch(() => []))
    )
    const pairs = pairGroups.flat()

    const priceMap = new Map()
    pairs.forEach((p) => {
      if (p.baseToken?.address) {
        const addr = p.baseToken.address.toLowerCase()
        const currentPrice = parseFloat(p.priceUsd || '0')
        const currentLiq = parseFloat(p.liquidity?.usd || '0')

        if (!priceMap.has(addr) || priceMap.get(addr).liquidity < currentLiq) {
          priceMap.set(addr, {
            priceUsd: currentPrice,
            change24h: p.priceChange?.h24 || 0,
            liquidity: currentLiq,
            pairAddress: p.pairAddress,
          })
        }
      }
    })

    // 4. Build Valuations list
    const portfolioTokens = []

    // Native PLS entry
    const plsValueUsd = formattedPlsBalance * plsPriceUsd
    portfolioTokens.push({
      address: '0xNativePLS',
      symbol: 'PLS',
      name: 'PulseChain Native',
      decimals: 18,
      balance: formattedPlsBalance,
      priceUsd: plsPriceUsd,
      valueUsd: plsValueUsd,
      change24h: plsChange24h,
      logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0xa1077a294dde1b09bb078844df40758a5d0f9a27.png',
      isNative: true,
      isSpam: false,
    })

    // Discovered ERC-20 / PRC-20 entries
    discoveredTokensMap.forEach((tb) => {
      const priceInfo = priceMap.get(tb.address.toLowerCase()) || { priceUsd: 0, change24h: 0, liquidity: 0 }
      const valueUsd = (tb.balance || 0) * (priceInfo.priceUsd || 0)

      portfolioTokens.push({
        ...tb,
        priceUsd: priceInfo.priceUsd,
        valueUsd,
        change24h: priceInfo.change24h,
        liquidity: priceInfo.liquidity,
        pairAddress: priceInfo.pairAddress,
        isSpam: isSpamToken(tb),
      })
    })

    // Sort by USD Value descending (tokens with value first, then non-zero balances)
    portfolioTokens.sort((a, b) => {
      if (b.valueUsd !== a.valueUsd) return b.valueUsd - a.valueUsd
      return (b.balance || 0) - (a.balance || 0)
    })

    const totalUsd = portfolioTokens.reduce((acc, t) => acc + (t.valueUsd || 0), 0)
    const totalPls = plsPriceUsd > 0 ? totalUsd / plsPriceUsd : 0

    // Assign portfolio percentage
    const tokensWithPct = portfolioTokens.map((t) => ({
      ...t,
      portfolioPct: totalUsd > 0 ? (t.valueUsd / totalUsd) * 100 : 0,
    }))

    return {
      address: normalizedAddress,
      totalUsd,
      totalPls,
      tokens: tokensWithPct,
    }
  } catch (err) {
    console.error('fetchWalletPortfolio fatal error:', err)
    return {
      address: normalizedAddress,
      totalUsd: 0,
      totalPls: 0,
      tokens: [],
    }
  }
}
