/**
 * Comprehensive Crypto Number & Price Formatting Utility
 * Handles extreme sub-penny / sub-satoshi micro-prices without ever showing false zeros ($0.00)
 */

/**
 * Format any USD price with dynamic precision based on magnitude
 * NEVER returns $0.00 for non-zero prices!
 */
export function formatCryptoPrice(val) {
  if (val === null || val === undefined || val === '') return '$0.00'
  const num = typeof val === 'number' ? val : parseFloat(val)

  if (isNaN(num) || num === 0) return '$0.00'

  // Large prices ($1,000+)
  if (num >= 1000) {
    return `$${num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  // Standard prices ($1.00 - $999.99)
  if (num >= 1) {
    return `$${num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })}`
  }

  // Cent prices ($0.01 - $0.9999)
  if (num >= 0.01) {
    return `$${num.toFixed(4)}`
  }

  // Sub-cent prices ($0.0001 - $0.009999)
  if (num >= 0.0001) {
    return `$${num.toFixed(6)}`
  }

  // Micro prices ($0.000001 - $0.00009999)
  if (num >= 0.000001) {
    return `$${num.toFixed(8)}`
  }

  // Ultra-micro prices ($0.0000000001 - $0.0000009999)
  if (num >= 0.0000000001) {
    return `$${num.toFixed(10)}`
  }

  // Extreme micro prices (e.g. 1.25e-12) - convert scientific notation to readable fixed string
  const str = num.toFixed(14)
  const trimmed = str.replace(/0+$/, '')
  return `$${trimmed}`
}

/**
 * Format Compact USD values ($1.25B, $45.2M, $120.5K, $450)
 */
export function formatUsd(num) {
  const val = parseFloat(num || '0')
  if (isNaN(val) || val === 0) return '$0'
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`
  if (val >= 1) return `$${val.toFixed(2)}`
  return `$${val.toFixed(4)}`
}

/**
 * Format Compact count or number (e.g. transactions, tokens)
 */
export function formatCompactCount(num) {
  const val = parseFloat(num || '0')
  if (isNaN(val) || val === 0) return '0'
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`
  return val.toLocaleString()
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
