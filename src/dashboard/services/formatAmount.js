/**
 * Token amounts, as opposed to USD prices.
 *
 * `formatCryptoPrice` in the shared utils prefixes a dollar sign, because
 * everything it was written for is a USD figure. A swap output of 4,182 HEX is
 * not dollars, and rendering it as "$4,182" states a value the quote never
 * gave.
 *
 * Small amounts keep significant digits rather than rounding to zero: a quote
 * of 0.0000042 WBTC has to read as that and not as "0.00".
 */
export function formatAmount(value) {
  const n = Number(value)
  if (!isFinite(n) || n === 0) return '0'

  const abs = Math.abs(n)

  if (abs >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (abs >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 })

  // Below 1, keep four significant figures however small the number is.
  return n.toLocaleString('en-US', { maximumSignificantDigits: 4 })
}
