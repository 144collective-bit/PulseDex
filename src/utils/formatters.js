/**
 * Comprehensive Crypto Number & Price Formatting Utility
 * Handles extreme sub-penny / sub-satoshi micro-prices without ever showing false zeros ($0.00)
 */

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉'

/** Render a run length as subscript digits, e.g. 4 -> "₄". */
function toSubscript(count) {
  return String(count)
    .split('')
    .map((d) => SUBSCRIPT_DIGITS[Number(d)])
    .join('')
}

/**
 * Threshold at which a run of leading zeros is collapsed into a subscript
 * count. Three zeros still read fine inline ($0.0001128); four or more turn
 * into an unreadable smear, so those become $0.0₄1227.
 */
const SUBSCRIPT_MIN_ZEROS = 4

/**
 * Format any USD price with dynamic precision based on magnitude.
 *
 * Sub-penny prices keep four significant digits and collapse long zero runs
 * into a subscript count - the notation screeners use so a micro-price fits a
 * table cell without becoming a wall of zeros. NEVER returns $0.00 for a
 * non-zero price.
 */
export function formatCryptoPrice(val) {
  if (val === null || val === undefined || val === '') return '$0.00'
  const num = typeof val === 'number' ? val : parseFloat(val)

  if (isNaN(num) || num === 0) return '$0.00'

  const sign = num < 0 ? '-' : ''
  const abs = Math.abs(num)

  // Large prices ($1,000+)
  if (abs >= 1000) {
    return `${sign}$${abs.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  // Standard prices ($1.00 - $999.99)
  if (abs >= 1) {
    return `${sign}$${abs.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })}`
  }

  // Below $1: four significant digits, with the leading zero run measured from
  // the exponent so float noise can't miscount it.
  const [mantissa, exponent] = abs.toExponential(3).split('e')
  const exp = parseInt(exponent, 10)
  const digits = mantissa.replace('.', '')
  const zeros = -exp - 1

  if (zeros >= SUBSCRIPT_MIN_ZEROS) {
    return `${sign}$0.0${toSubscript(zeros)}${digits}`
  }

  return `${sign}$0.${'0'.repeat(Math.max(0, zeros))}${digits}`
}

/**
 * Format Compact USD values ($1.25B, $45.2M, $120.5K, $450)
 */
export function formatUsd(num, digits = 2) {
  const val = parseFloat(num || '0')
  if (isNaN(val) || val === 0) return '$0'
  if (val >= 1e12) return `$${(val / 1e12).toFixed(digits)}T`
  if (val >= 1e9) return `$${(val / 1e9).toFixed(digits)}B`
  if (val >= 1e6) return `$${(val / 1e6).toFixed(digits)}M`
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`
  if (val >= 1) return `$${val.toFixed(2)}`
  return `$${val.toFixed(4)}`
}

/**
 * Format Compact count or number (e.g. transactions, tokens)
 */
export function formatCompactCount(num, digits = 2) {
  const val = parseFloat(num || '0')
  if (isNaN(val) || val === 0) return '0'
  if (val >= 1e12) return `${(val / 1e12).toFixed(digits)}T`
  if (val >= 1e9) return `${(val / 1e9).toFixed(digits)}B`
  if (val >= 1e6) return `${(val / 1e6).toFixed(digits)}M`
  if (val >= 1e3) return `${(val / 1e3).toFixed(digits)}K`
  // Sub-thousand values are capped at two decimals so a raw token balance
  // doesn't print as 320.967.
  return val.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * Calculate multi-factor composite ranking score for PulseChain tokens
 * Considers 24h Volume, Liquidity Depth, Market Cap / FDV, and 24h Swap Count
 */
export function calculateTokenMarketScore(pair) {
  if (!pair) return 0
  const vol24 = parseFloat(pair.volume?.h24 || 0)
  const liq = parseFloat(pair.liquidity?.usd || 0)
  const fdv = parseFloat(pair.fdv || pair.marketCap || 0)
  const buys = pair.txns?.h24?.buys || 0
  const sells = pair.txns?.h24?.sells || 0
  const txns = buys + sells

  // Score formula: volume is primary driver for live trading, backed by liquidity depth
  const volumeScore = vol24 * 1.5
  const liquidityScore = liq * 0.9
  const mcapScore = Math.min(fdv * 0.15, 2000000) // cap mcap influence to avoid artificial meme FDVs
  const txnScore = txns * 25

  return volumeScore + liquidityScore + mcapScore + txnScore
}

/**
 * Allow-lists external URLs before they reach an href.
 * Token socials and websites come straight from the DexScreener API, which means
 * a token deployer controls the string — a `javascript:` URL there would execute
 * in our origin. Anything that isn't http(s) is dropped for the fallback.
 */
export function safeExternalUrl(url, fallback = null) {
  if (!url || typeof url !== 'string') return fallback
  try {
    const parsed = new URL(url.trim(), window.location.origin)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.href
      : fallback
  } catch {
    return fallback
  }
}

/**
 * Builds a PulseX swap deep-link with both contract addresses escaped, so an
 * odd address from the API can't inject extra query parameters.
 */
export function buildPulseXSwapUrl(inputAddress, outputAddress) {
  const input = encodeURIComponent(inputAddress || 'PLS')
  const output = encodeURIComponent(outputAddress || '')
  return `https://app.pulsex.com/swap?inputCurrency=${input}&outputCurrency=${output}`
}

/**
 * Compact "time since" label for launch and trade timestamps.
 * Accepts a unix timestamp in seconds, as returned by the launchpad API.
 */
export function formatTimeAgo(unixSeconds) {
  const ts = Number(unixSeconds || 0)
  if (!ts) return '—'

  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 0) return 'now'
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`
  return `${Math.floor(diff / 2592000)}mo`
}

/**
 * Shorten a 0x address for display: 0x1234...abcd
 */
export function formatAddress(address, lead = 4, tail = 4) {
  if (!address || typeof address !== 'string') return ''
  const clean = address.trim()
  if (clean.length <= lead + tail + 2) return clean
  return `${clean.slice(0, lead + 2)}...${clean.slice(-tail)}`
}

/**
 * Signed percentage label, e.g. +12.4% / -3.1%. Returns null for missing data
 * so callers can render a placeholder instead of a misleading 0%.
 */
export function formatPercent(value, digits = 1) {
  if (value === null || value === undefined) return null
  const num = parseFloat(value)
  if (!isFinite(num)) return null

  const rounded = num.toFixed(digits)
  // A move too small to survive rounding has no direction worth showing;
  // without this a -0.04% tick prints as the nonsensical "-0.0%".
  if (parseFloat(rounded) === 0) return `${Math.abs(Number(rounded)).toFixed(digits)}%`

  return `${num >= 0 ? '+' : ''}${rounded}%`
}
