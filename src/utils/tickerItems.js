import { isStablecoin } from '../services/dexscreener'

/**
 * What the trending bar shows, and what it calls each entry.
 *
 * The bar used to render the first fourteen pairs straight off the feed. On
 * PulseChain almost every deep pool is a WPLS pool - WPLS/DAI, WPLS/USDC,
 * WPLS/USDT and so on - so "TRENDING PULSE" scrolled the word WPLS fourteen
 * times, each with the same price to within a pool's spread. The data was
 * right; it was fourteen views of one token.
 *
 * So the unit here is the token, not the pool: one entry per base token
 * address, then the cut to fourteen. The label is the base symbol on its own,
 * because after the dedupe a symbol names exactly one row and the price beside
 * it is in USD rather than in the quote asset - BASE/QUOTE on every row would
 * be noise. Two cases earn the longer form, both below.
 *
 * Pure, and separate from the component, because this project's tests run in
 * a node environment over `src/**\/*.test.js` and cannot render a .jsx at all.
 * Logic that lives in the component is logic nothing can check.
 */

/** Entries in the bar. Fourteen fits the marquee without repeating too soon. */
export const TICKER_LIMIT = 14

/**
 * The pool a token is represented by is the caller's decision, not ours.
 *
 * `getTopPulsePairs` sorts by core rank and then by market score - volume,
 * liquidity, market cap and transaction count. Every pool of one token shares
 * a core rank, so within a token that sort is purely market score, and the
 * first one seen is already the deepest and most traded of them. Re-scoring
 * here would let the bar disagree with the sidebar and the board about which
 * pool is a token's real market, for no gain.
 */
function tokenKey(pair) {
  const address = pair?.baseToken?.address?.toLowerCase().trim() || ''
  if (address) return address

  // No address is unusual but survivable: fall back to the ticker rather than
  // letting every address-less pair collapse into one shared empty key.
  const symbol = pair?.baseToken?.symbol?.toUpperCase().trim() || ''
  return symbol ? `symbol:${symbol}` : ''
}

/**
 * When the base symbol alone would misrepresent the row.
 *
 * Two cases, both real in this feed:
 *
 * - A stablecoin base. DAI/WPLS is a pool that is interesting because of WPLS;
 *   labelled "DAI" it reads as a $1.00 row with no movement, and the app
 *   already holds the position that a stablecoin is not the primary side of a
 *   pair (see `STABLECOIN_SYMBOLS`). Naming both sides says what it is.
 * - A ticker two different contracts share. The dedupe is by address, on
 *   purpose - two unrelated tokens both called PEPE are two tokens - but that
 *   leaves two rows reading "PEPE", which is the same complaint the dedupe
 *   was meant to answer. The quote tells them apart.
 */
function needsQuote(pair, symbol, symbolCounts) {
  if (isStablecoin(symbol)) return true
  return (symbolCounts.get(symbol) || 0) > 1
}

/**
 * One entry per token, highest-ranked pool each, capped at `limit`.
 *
 * Returns view models rather than pairs so the component stays a renderer:
 * `pair` is carried through for the click handler, the logo and the numbers.
 */
export function selectTickerItems(pairs, limit = TICKER_LIMIT) {
  if (!Array.isArray(pairs) || limit <= 0) return []

  const seen = new Map()
  for (const pair of pairs) {
    const key = tokenKey(pair)
    // Nothing identifies this token, so it cannot be deduplicated against
    // anything and would render as a bare "TOKEN". Drop it.
    if (!key || seen.has(key)) continue
    seen.set(key, pair)
    if (seen.size >= limit) break
  }

  const selected = Array.from(seen.values())

  // Counted over the fourteen that actually appear: a clash further down the
  // feed is not a clash the reader can see.
  const symbolCounts = new Map()
  for (const pair of selected) {
    const symbol = baseSymbol(pair)
    symbolCounts.set(symbol, (symbolCounts.get(symbol) || 0) + 1)
  }

  return selected.map((pair) => {
    const symbol = baseSymbol(pair)
    const quote = quoteSymbol(pair)

    return {
      pair,
      key: tokenKey(pair),
      symbol,
      quote,
      address: pair?.baseToken?.address || '',
      label: needsQuote(pair, symbol, symbolCounts) ? `${symbol}/${quote}` : symbol,
    }
  })
}

function baseSymbol(pair) {
  return pair?.baseToken?.symbol || 'TOKEN'
}

function quoteSymbol(pair) {
  return pair?.quoteToken?.symbol || 'PLS'
}
