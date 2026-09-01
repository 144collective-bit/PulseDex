/**
 * The dashboard a new account starts on, and the presets built from the same
 * machinery.
 *
 * A preset is nothing more than a saved set of module instances. There is no
 * per-preset code and no per-preset component - "Trader" and "Investor" differ
 * only in which modules they place and where, which is the whole point of
 * having a registry.
 *
 * Only module *type strings* appear here. Importing the module components would
 * make this file depend on every module in the app, and the storage layer
 * imports it.
 */

import { PLS, HEX, PLSX, INC, USDC, DEFAULT_PAIR } from './tokens'

/** Grid columns at the widest breakpoint. Every x/w below is in these units. */
export const GRID_COLS = 12

let seq = 0

/**
 * Instance ids.
 *
 * crypto.randomUUID is not available on every browser PulseDEX supports, and a
 * collision here would mean two modules sharing a grid key - so there is a
 * counter behind it rather than a bare fallback to Math.random.
 */
export function newModuleId(type = 'module') {
  seq += 1
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${type}-${rand}-${seq}`
}

/** @returns {import('../types/dashboard.js').DashboardModuleInstance} */
function instance(type, layout, config = {}, contextMode = 'local') {
  return {
    id: newModuleId(type),
    type,
    layout,
    config,
    contextMode,
    locked: false,
    hidden: false,
  }
}

/**
 * The default layout.
 *
 * Chosen so a new user sees something worth keeping rather than an empty
 * canvas: the chain overview across the top, the four core assets as a price
 * row, then a chart with movers beside it, and watchlist plus liquidity below.
 * The chart and liquidity follow the global pair, so changing the pair in the
 * toolbar visibly does something on the very first visit.
 */
export function buildDefaultDashboard() {
  return {
    id: newModuleId('dashboard'),
    name: 'Main',
    preset: 'default',
    globalContext: { asset: HEX, pair: DEFAULT_PAIR },
    updatedAt: Date.now(),
    modules: [
      instance('market-overview', { x: 0, y: 0, w: 12, h: 3 }),

      instance('price-card', { x: 0, y: 3, w: 3, h: 3 }, { token: PLS, metric: 'price' }),
      instance('price-card', { x: 3, y: 3, w: 3, h: 3 }, { token: HEX, metric: 'price' }),
      instance('price-card', { x: 6, y: 3, w: 3, h: 3 }, { token: PLSX, metric: 'price' }),
      instance('price-card', { x: 9, y: 3, w: 3, h: 3 }, { token: INC, metric: 'price' }),

      instance('price-chart', { x: 0, y: 6, w: 8, h: 8 }, { timeframe: '1D' }, 'global'),
      instance('top-movers', { x: 8, y: 6, w: 4, h: 8 }, { mode: 'gainers', limit: 8 }),

      instance('watchlist', { x: 0, y: 14, w: 8, h: 6 }),
      instance('liquidity', { x: 8, y: 14, w: 4, h: 6 }, {}, 'global'),
    ],
  }
}

/**
 * Presets, keyed the way the toolbar lists them.
 *
 * Each builder returns the module set only; the caller wraps it in a dashboard
 * so that applying a preset can keep the current name and context if it wants.
 */
export const DASHBOARD_PRESETS = [
  {
    key: 'default',
    name: 'Main',
    description: 'Chain overview, core asset prices, chart, movers and watchlist.',
    build: () => buildDefaultDashboard().modules,
  },
  {
    key: 'trader',
    name: 'Trader',
    description: 'Chart, trade panel, recent trades and the pair book side by side.',
    build: () => [
      instance('price-chart', { x: 0, y: 0, w: 8, h: 9 }, { timeframe: '4H' }, 'global'),
      instance(
        'trade',
        { x: 8, y: 0, w: 4, h: 9 },
        { from: PLS, to: USDC, amount: '', slippage: 0.5 },
      ),
      instance('pair-explorer', { x: 0, y: 9, w: 4, h: 6 }, {}, 'global'),
      instance('recent-trades', { x: 4, y: 9, w: 4, h: 6 }, { filter: 'all', limit: 25 }, 'global'),
      instance('top-movers', { x: 8, y: 9, w: 4, h: 6 }, { mode: 'volume', limit: 8 }),
    ],
  },
  {
    key: 'investor',
    name: 'Investor',
    description: 'Portfolio, holdings and watchlist over a market overview.',
    build: () => [
      instance('portfolio', { x: 0, y: 0, w: 6, h: 5 }),
      instance('market-overview', { x: 6, y: 0, w: 6, h: 5 }),
      instance('holdings', { x: 0, y: 5, w: 6, h: 8 }, { sortBy: 'value' }),
      instance('watchlist', { x: 6, y: 5, w: 6, h: 8 }),
    ],
  },
  {
    key: 'hex',
    name: 'HEX',
    description: 'HEX overview with its chart, liquidity and pair statistics.',
    build: () => [
      instance('hex-overview', { x: 0, y: 0, w: 4, h: 7 }),
      instance(
        'price-chart',
        { x: 4, y: 0, w: 8, h: 7 },
        { pair: DEFAULT_PAIR, timeframe: '1D' },
      ),
      instance('price-card', { x: 0, y: 7, w: 4, h: 3 }, { token: HEX, metric: 'marketCap' }),
      instance('liquidity', { x: 4, y: 7, w: 4, h: 6 }, { pair: DEFAULT_PAIR }),
      instance('volume', { x: 8, y: 7, w: 4, h: 6 }, { pair: DEFAULT_PAIR }),
    ],
  },
  {
    key: 'discovery',
    name: 'Discovery',
    description: 'New pairs, trending activity and the movers board.',
    build: () => [
      instance('trending', { x: 0, y: 0, w: 6, h: 8 }, { limit: 12 }),
      instance('new-pairs', { x: 6, y: 0, w: 6, h: 8 }, { limit: 12 }),
      instance('top-movers', { x: 0, y: 8, w: 6, h: 6 }, { mode: 'gainers', limit: 10 }),
      instance('top-movers', { x: 6, y: 8, w: 6, h: 6 }, { mode: 'losers', limit: 10 }),
    ],
  },
]

export function getPreset(key) {
  return DASHBOARD_PRESETS.find((p) => p.key === key)
}
