import { getModuleDefinition } from './moduleRegistry'
import { DAI, HEX, INC, PLS, PLSX, USDC, WPLS, makePair, tokenRefFor } from '../state/tokens'

/**
 * Named, preconfigured modules.
 *
 * The library used to list capabilities: to get a HEX price card you added
 * "Token metric", opened its settings, chose HEX and chose Price. Three steps,
 * two of them abstract. A preset is the concrete thing instead - "HEX Price" -
 * and it lands already configured.
 *
 * A preset is not a new kind of module and the engine knows nothing about it.
 * It resolves to exactly the arguments `addModule(definition, { config, layout, contextMode })`
 * already takes, so this whole file sits in front of the library and touches no
 * grid, reducer or registry code. If that ever stops being true, the design has
 * drifted.
 *
 * @typedef {Object} ModulePreset
 * @property {string} key      Unique across the library.
 * @property {string} name     The thing itself - "Top Gainers", not "Top movers (gainers)".
 * @property {string} description
 * @property {string} category Matches a MODULE_CATEGORIES key.
 * @property {string} type     The registry module this builds on.
 * @property {Record<string, unknown>} config
 * @property {string[]} [keywords] Extra search terms beyond name and description.
 */

/** Assets that are worth a price tile, with the label to show for each. */
const EHEX = tokenRefFor('0x57fde0a71132198BBeC939B98976993d8D89D225')
const HDRN = tokenRefFor('0x3819f64f282bf135d62168C1e513280dAF905e06')

/*
 * Labels are explicit rather than read off the token.
 *
 * Two different contracts on PulseChain both carry the symbol "HEX" - the
 * native one and the bridged Ethereum one - so generating names from
 * `token.symbol` would produce two entries called "HEX Price" with colliding
 * keys, one of which would silently win.
 */
const PRICE_ASSETS = [
  { token: PLS, label: 'PLS' },
  { token: HEX, label: 'HEX' },
  { token: PLSX, label: 'PLSX' },
  { token: INC, label: 'INC' },
  { token: EHEX, label: 'eHEX' },
  { token: HDRN, label: 'HDRN' },
]

/** Market cap only for assets where a supply figure is meaningful. */
const MARKET_CAP_ASSETS = [
  { token: PLS, label: 'PLS' },
  { token: HEX, label: 'HEX' },
  { token: PLSX, label: 'PLSX' },
  { token: INC, label: 'INC' },
]

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/**
 * The generated half.
 *
 * Price and market cap are the same card with one field changed across a short
 * list of assets, so writing each one out by hand would be transcription rather
 * than curation - and would go stale the moment the curated token list moved.
 * The list is deliberately a shortlist, not every token: generating the full
 * cross-product gives fifty-odd near-identical rows and buries everything else
 * in the library.
 */
function generatedPresets() {
  const price = PRICE_ASSETS.filter((a) => a.token).map(({ token, label }) => ({
    key: `price-${slug(label)}`,
    name: `${label} Price`,
    description: `Live ${label} price with its 24-hour change.`,
    category: 'prices',
    type: 'price-card',
    config: { token, metric: 'price' },
    keywords: [label, 'price', token.name].filter(Boolean),
  }))

  const marketCap = MARKET_CAP_ASSETS.filter((a) => a.token).map(({ token, label }) => ({
    key: `mcap-${slug(label)}`,
    name: `${label} Market Cap`,
    description: `${label} market capitalisation, from on-chain supply.`,
    category: 'prices',
    type: 'price-card',
    config: { token, metric: 'marketCap' },
    keywords: [label, 'market cap', 'mcap', 'valuation'],
  }))

  return [...price, ...marketCap]
}

/**
 * The authored half.
 *
 * These are not a cross-product of anything - they are the specific views worth
 * naming. The four movers entries matter most: those modes exist today only
 * inside a settings dropdown, so "Top Gainers" is something the product can
 * already do that nothing in the interface ever says out loud.
 */
const AUTHORED_PRESETS = [
  /* ---------------------------------------------------------------- movers */
  {
    key: 'top-gainers',
    name: 'Top Gainers',
    description: 'The biggest 24-hour risers among tracked pairs.',
    category: 'rankings',
    type: 'top-movers',
    config: { mode: 'gainers', limit: 8, minLiquidity: 25_000 },
    keywords: ['gainers', 'risers', 'winners', 'up'],
  },
  {
    key: 'top-losers',
    name: 'Top Losers',
    description: 'The biggest 24-hour fallers among tracked pairs.',
    category: 'rankings',
    type: 'top-movers',
    config: { mode: 'losers', limit: 8, minLiquidity: 25_000 },
    keywords: ['losers', 'fallers', 'down'],
  },
  {
    key: 'highest-volume',
    name: 'Highest Volume',
    description: 'Pairs trading the most over the last 24 hours.',
    category: 'rankings',
    type: 'top-movers',
    config: { mode: 'volume', limit: 8, minLiquidity: 25_000 },
    keywords: ['volume', 'busiest', 'traded'],
  },
  {
    key: 'most-transactions',
    name: 'Most Transactions',
    description: 'Pairs with the most swaps over the last 24 hours.',
    category: 'rankings',
    type: 'top-movers',
    config: { mode: 'transactions', limit: 8, minLiquidity: 25_000 },
    keywords: ['transactions', 'txns', 'trades', 'activity'],
  },

  /* ---------------------------------------------------------------- charts */
  {
    key: 'chart-hex-wpls',
    name: 'HEX / WPLS Chart',
    description: 'Daily candles for HEX against WPLS.',
    category: 'charts',
    type: 'price-chart',
    config: { pair: makePair(HEX, WPLS), timeframe: '1d', chartType: 'candles' },
    keywords: ['hex', 'chart', 'candles'],
  },
  {
    key: 'chart-plsx-wpls',
    name: 'PLSX / WPLS Chart',
    description: 'Daily candles for PLSX against WPLS.',
    category: 'charts',
    type: 'price-chart',
    config: { pair: makePair(PLSX, WPLS), timeframe: '1d', chartType: 'candles' },
    keywords: ['plsx', 'chart', 'candles'],
  },
  {
    key: 'chart-wpls-dai',
    name: 'PLS / DAI Chart',
    description: 'Daily candles for PLS priced in DAI.',
    category: 'charts',
    type: 'price-chart',
    config: { pair: makePair(WPLS, DAI), timeframe: '1d', chartType: 'candles' },
    keywords: ['pls', 'wpls', 'dai', 'chart', 'usd'],
  },

  /* --------------------------------------------------------------- trading */
  {
    key: 'trade-pls-usdc',
    name: 'PLS → USDC',
    description: 'Quote a swap from PLS into USDC.',
    category: 'trading',
    type: 'trade',
    config: { from: PLS, to: USDC, slippage: 0.5, aggregator: 'pulsex' },
    keywords: ['swap', 'trade', 'pls', 'usdc', 'sell'],
  },
  {
    key: 'trade-hex-usdc',
    name: 'HEX → USDC',
    description: 'Quote a swap from HEX into USDC.',
    category: 'trading',
    type: 'trade',
    config: { from: HEX, to: USDC, slippage: 0.5, aggregator: 'pulsex' },
    keywords: ['swap', 'trade', 'hex', 'usdc', 'sell'],
  },

  /* ------------------------------------------------------------------ pair */
  {
    key: 'pair-hex-wpls',
    name: 'HEX / WPLS Stats',
    description: 'Price, liquidity, volume and transactions for the HEX/WPLS pool.',
    category: 'pairs',
    type: 'pair-explorer',
    config: { pair: makePair(HEX, WPLS) },
    keywords: ['hex', 'pair', 'stats', 'pool'],
  },
  {
    key: 'liquidity-hex-wpls',
    name: 'HEX / WPLS Liquidity',
    description: 'Pool depth and reserve split for HEX against WPLS.',
    category: 'pairs',
    type: 'liquidity',
    config: { pair: makePair(HEX, WPLS) },
    keywords: ['hex', 'liquidity', 'depth', 'pool'],
  },
  {
    key: 'trades-hex-wpls',
    name: 'HEX / WPLS Swaps',
    description: 'Recent swaps through the HEX/WPLS pool, read from the chain.',
    category: 'pairs',
    type: 'recent-trades',
    config: { pair: makePair(HEX, WPLS), filter: 'all', limit: 25 },
    keywords: ['hex', 'swaps', 'trades', 'tape'],
  },

  /* ------------------------------------------------------------- discovery */
  {
    key: 'new-pairs-week',
    name: 'New Pairs This Week',
    description: 'Pairs created in the last seven days that hold real liquidity.',
    category: 'discovery',
    type: 'new-pairs',
    config: { limit: 12, maxAgeDays: 7, minLiquidity: 1_000 },
    keywords: ['new', 'recent', 'launches', 'discovery'],
  },

  /* -------------------------------------------------------------- personal */
  {
    key: 'my-portfolio',
    name: 'My Portfolio',
    description: 'Total value and 24-hour change for the connected wallet.',
    category: 'wallet',
    type: 'portfolio',
    config: {},
    keywords: ['portfolio', 'wallet', 'value', 'balance'],
  },
  {
    key: 'my-holdings',
    name: 'My Holdings',
    description: 'Every position in the connected wallet, largest first.',
    category: 'wallet',
    type: 'holdings',
    config: { sortBy: 'value', limit: 25 },
    keywords: ['holdings', 'positions', 'wallet', 'tokens'],
  },
  {
    key: 'my-watchlist',
    name: 'My Watchlist',
    description: 'The pairs you follow, shared with the rest of PulseDEX.',
    category: 'personal',
    type: 'watchlist',
    config: { showVolume: false },
    keywords: ['watchlist', 'starred', 'following'],
  },
]

/** @type {ModulePreset[]} */
export const MODULE_PRESETS = [...generatedPresets(), ...AUTHORED_PRESETS]

/**
 * Presets whose underlying module actually exists.
 *
 * A preset naming a retired module type would render as an "unknown module"
 * placeholder the moment someone added it, with nothing to explain why. Since
 * the catalogue is code rather than user data, that is a mistake worth catching
 * at the door instead of on the canvas.
 */
export function listPresets() {
  return MODULE_PRESETS.filter((preset) => Boolean(getModuleDefinition(preset.type)))
}

/**
 * Development-time check that the catalogue matches the registry.
 *
 * Presets are hand-maintained against modules that change independently, so the
 * failure mode is a config key that quietly stopped meaning anything - the
 * preset still adds, still looks right in the library, and produces a module
 * configured with a field nothing reads. Loud in development, absent in
 * production.
 */
export function auditPresets() {
  const problems = []
  const seen = new Set()

  for (const preset of MODULE_PRESETS) {
    if (seen.has(preset.key)) problems.push(`duplicate preset key "${preset.key}"`)
    seen.add(preset.key)

    const def = getModuleDefinition(preset.type)
    if (!def) {
      problems.push(`preset "${preset.key}" builds on unknown module "${preset.type}"`)
      continue
    }

    const known = new Set(def.configSchema.map((f) => f.key))
    for (const key of Object.keys(preset.config ?? {})) {
      // `aggregator` is read by the trade module directly rather than being an
      // editable field, so it is legitimately absent from the schema.
      if (!known.has(key) && key !== 'aggregator') {
        problems.push(`preset "${preset.key}" sets "${key}", which ${preset.type} does not define`)
      }
    }
  }

  return problems
}
