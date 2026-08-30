import { buildPulseXSwapUrl } from '../utils/formatters'

/**
 * Trading venues we can hand a user off to.
 *
 * This is a lookup, not a list to render: a venue only earns a card when it
 * actually holds a pool for the token on screen, so what gets shown is driven
 * by the pair data rather than by this file.
 *
 * `deepLinks` records whether the venue can be opened on a specific pair. It
 * matters for what we promise on the card - a venue that ignores token
 * parameters drops the user on its own default screen, and saying "trade
 * PLSX here" would then be a lie.
 */

export const VENUES = [
  {
    id: 'pulsex',
    // DexScreener reports both PulseX deployments as `pulsex`; V1 and V2 are
    // separated by the pair's `labels`, not by dexId.
    match: (dexId) => dexId.includes('pulsex'),
    name: 'PulseX',
    logo: '/apps/pulsex.png',
    // Protocol-wide fixed rate: 0.29% per swap, of which LPs receive 0.22%.
    feeLabel: '0.29% fee',
    deepLinks: true,
    url: (baseAddress, quoteAddress) => buildPulseXSwapUrl(quoteAddress, baseAddress),
  },
  {
    id: 'libertyswap',
    match: (dexId) => dexId.includes('liberty'),
    name: 'LibertySwap',
    logo: '/apps/libertyswap.png',
    // Fee is set per pool rather than protocol-wide - their own pool list shows
    // 0.25% and 1% tiers side by side - so there is no single rate to quote and
    // the card falls back to 24h volume.
    feeLabel: null,
    // Their swap UI takes no token parameters. Passing PulseX's
    // inputCurrency/outputCurrency pair is ignored and the page still opens on
    // its default cross-chain route, so this lands on the app, not the pair.
    deepLinks: false,
    url: () => 'https://libertyswap.finance',
  },
  {
    id: 'nine-mm',
    match: (dexId) => dexId.includes('9mm') || dexId.includes('ninemm'),
    name: '9mm',
    logo: '/apps/nine-mm.png',
    feeLabel: null,
    deepLinks: false,
    url: () => 'https://9mm.pro',
  },
  {
    id: 'nine-inch',
    match: (dexId) => dexId.includes('9inch') || dexId.includes('nineinch'),
    name: '9inch',
    // No mark of theirs in the app; the card falls back to a lettered tile
    // rather than rendering a broken image.
    logo: null,
    feeLabel: null,
    deepLinks: false,
    url: () => 'https://9inch.io',
  },
]

/** Resolve a DexScreener `dexId` to a venue, or null if we don't know it. */
export function venueForDexId(dexId) {
  const id = String(dexId || '').toLowerCase()
  if (!id) return null
  return VENUES.find((venue) => venue.match(id)) || null
}
