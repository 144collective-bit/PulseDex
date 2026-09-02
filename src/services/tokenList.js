import { CURATED_TOKENS, NATIVE_PLS, WPLS } from '../config/dex'
import { isStablecoin } from './dexscreener'

/**
 * The tokens the picker can offer.
 *
 * It used to offer eleven: the curated list, and nothing else. Anything beyond
 * that needed its contract address pasted in, which means the picker could only
 * help someone who already knew exactly what they wanted. Typing "ATROPA" found
 * nothing, on a chain where it trades.
 *
 * So the market is folded in. Every token appearing in the pairs the app
 * already fetches becomes selectable, keeping the curated entries authoritative
 * where they overlap - those carry a checked address, a real logo and the
 * decimals the swap maths needs.
 *
 * Pure, and separate from the picker, because the suite runs in node over
 * `src/**\/*.test.js` and cannot render a component. Ranking a list is exactly
 * the kind of thing that rots silently inside a .jsx.
 */

/** Below this a pool is not a market, it is a leftover. */
const MIN_LIQUIDITY_USD = 500

const lower = (value) => String(value ?? '').toLowerCase()

/**
 * Native PLS stands in for WPLS.
 *
 * Every PulseChain pool quotes WPLS, so without this the picker offers both,
 * and picking the wrapped one produces a trade the panel then has to unwrap
 * back. The curated list already made this choice by excluding WPLS; this keeps
 * the market list agreeing with it.
 */
export function isWrappedNative(address) {
  return lower(address) === lower(WPLS)
}

/**
 * One side of a pair, as a token the picker can list.
 *
 * DexScreener knows a token's symbol, name and market but not its decimals -
 * that is only on chain. Tokens therefore arrive here without decimals, and
 * anything selected has to be resolved before it can be traded. The absence is
 * deliberate rather than an oversight: pre-reading decimals for several hundred
 * tokens to populate a list is hundreds of calls for a question that only
 * matters about the one that gets picked.
 */
function sideToToken(side, pair, isBase) {
  const address = side?.address
  if (!address || isWrappedNative(address)) return null

  const liquidityUsd = Number(pair?.liquidity?.usd) || 0
  // A quote token's price is not this pair's priceUsd, which belongs to the
  // base. Left null rather than guessed at.
  const priceUsd = isBase ? Number(pair?.priceUsd) || null : null

  return {
    address,
    symbol: side.symbol || '???',
    name: side.name || side.symbol || 'Unknown token',
    logo: isBase ? pair?.info?.imageUrl || null : null,
    priceUsd,
    liquidityUsd,
    verified: false,
  }
}

/**
 * Every token in a set of pairs, once each, keeping its deepest appearance.
 *
 * Both sides are read. A token that is only ever a quote asset - the stables
 * mostly - would otherwise be missing from a list built from base tokens alone,
 * and those are among the ones people most want to trade into.
 */
export function tokensFromPairs(pairs) {
  if (!Array.isArray(pairs)) return []

  const byAddress = new Map()

  for (const pair of pairs) {
    for (const [side, isBase] of [
      [pair?.baseToken, true],
      [pair?.quoteToken, false],
    ]) {
      const token = sideToToken(side, pair, isBase)
      if (!token) continue
      if (token.liquidityUsd < MIN_LIQUIDITY_USD) continue

      const key = lower(token.address)
      const existing = byAddress.get(key)

      if (!existing) {
        byAddress.set(key, token)
        continue
      }

      // Deepest pool wins, but a price and a logo are kept from wherever they
      // were found: the deepest pool for a token is often the one where it is
      // the quote asset, which carries neither.
      byAddress.set(key, {
        ...existing,
        liquidityUsd: Math.max(existing.liquidityUsd, token.liquidityUsd),
        priceUsd: existing.priceUsd ?? token.priceUsd,
        logo: existing.logo ?? token.logo,
      })
    }
  }

  return Array.from(byAddress.values())
}

/**
 * The curated list, plus whatever the market adds.
 *
 * Curated entries win outright on the fields that decide a trade - address,
 * decimals, logo - and take the market's price and liquidity, which they have
 * no other source for. A verified token that also trades is one token, and
 * listing it twice would be the picker's own version of the bug the trending
 * bar had.
 */
export function mergeWithCurated(marketTokens, curated = CURATED_TOKENS) {
  const merged = new Map()

  for (const token of curated) {
    merged.set(lower(token.address), { ...token, verified: true, liquidityUsd: 0, priceUsd: null })
  }

  // Native PLS is curated but never appears in a pair under its own address.
  const nativeKey = lower(NATIVE_PLS)

  for (const token of marketTokens) {
    const key = lower(token.address)
    const existing = merged.get(key)

    if (!existing) {
      merged.set(key, token)
      continue
    }

    merged.set(key, {
      ...existing,
      liquidityUsd: Math.max(existing.liquidityUsd || 0, token.liquidityUsd || 0),
      priceUsd: existing.priceUsd ?? token.priceUsd,
    })
  }

  /*
   * PLS is the chain's own asset and the other side of nearly every pool, so it
   * belongs at the top regardless of what the market data says about a token
   * that has no pool of its own.
   */
  const native = merged.get(nativeKey)
  if (native) native.liquidityUsd = Number.POSITIVE_INFINITY

  return Array.from(merged.values())
}

/**
 * How well a token answers what was typed.
 *
 * Higher is better, and null means it does not match at all. The ordering
 * matters more than the numbers: someone typing "HEX" wants HEX first, not a
 * token called "HEXAGON FINANCE" that happens to hold more liquidity.
 */
export function matchScore(token, query) {
  if (!query) return 0

  const q = query.toLowerCase().trim()
  const symbol = lower(token.symbol)
  const name = lower(token.name)
  const address = lower(token.address)

  if (address === q) return 100
  if (symbol === q) return 90
  if (symbol.startsWith(q)) return 70
  if (name === q) return 60
  if (name.startsWith(q)) return 50
  if (symbol.includes(q)) return 40
  if (name.includes(q)) return 30

  return null
}

/**
 * The list as the picker shows it.
 *
 * Sorted by how well it answers the query first, then by whether it is
 * verified, then by depth. Depth last on purpose: a checked token is worth more
 * to someone choosing what to trade than an unchecked one with a bigger pool,
 * and that is the whole reason for keeping a curated list at all.
 */
export function rankTokens(tokens, { query = '', excludeAddress = null, limit = 60 } = {}) {
  if (!Array.isArray(tokens)) return []

  const exclude = excludeAddress ? lower(excludeAddress) : null

  const scored = []
  for (const token of tokens) {
    if (exclude && lower(token.address) === exclude) continue

    const score = matchScore(token, query)
    if (score === null) continue

    scored.push({ token, score })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.token.verified !== b.token.verified) return a.token.verified ? -1 : 1

    // Stablecoins ahead of the rest at equal footing: they are what most people
    // are pricing against, and they all hold deep pools anyway.
    const aStable = isStablecoin(a.token.symbol)
    const bStable = isStablecoin(b.token.symbol)
    if (aStable !== bStable) return aStable ? -1 : 1

    return (b.token.liquidityUsd || 0) - (a.token.liquidityUsd || 0)
  })

  return scored.slice(0, limit).map((entry) => entry.token)
}
