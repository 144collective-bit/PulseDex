import logoMap from '../data/plsfolioLogos.json'

/**
 * Curated PulseChain token artwork, by contract address.
 *
 * DexScreener's CDN has no image for a large share of PulseChain tokens - in a
 * 41-token sample of what the screener actually lists, 15 had no logo, and the
 * gaps included DAI, USDC, USDT, WBTC and WETH. plsfolio carries artwork for
 * most of them, generally at 200-256px against DexScreener's 64px.
 *
 * The map is generated, not fetched: see scripts/build-token-logos.mjs for why,
 * and re-run it to refresh.
 */

const BASE = 'https://plsfolio.com/coins/'

/** Artwork URL for an address, or null when there is none. */
export function plsfolioLogoUrl(address) {
  if (!address) return null

  const file = logoMap[String(address).toLowerCase().trim()]
  if (!file) return null

  return `${BASE}${file}`
}

/** How many tokens the map covers. Used by the audit script. */
export const PLSFOLIO_LOGO_COUNT = Object.keys(logoMap).length
