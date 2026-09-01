import {
  Activity,
  ArrowLeftRight,
  Bell,
  CandlestickChart,
  Coins,
  Droplets,
  Flame,
  Gauge,
  Globe2,
  ListOrdered,
  Receipt,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import { registerModules } from '../registry/moduleRegistry'

import PriceCard from './market/PriceCard'
import PriceChart, { TIMEFRAMES } from './market/PriceChart'
import TopMovers from './market/TopMovers'
import Trending from './market/Trending'
import MarketOverview from './market/MarketOverview'
import NewPairs from './market/NewPairs'

import TradeModule from './trading/TradeModule'

import Portfolio from './portfolio/Portfolio'
import Holdings from './portfolio/Holdings'

import PairExplorer from './pair/PairExplorer'
import RecentTrades from './pair/RecentTrades'
import Liquidity from './pair/Liquidity'
import Volume from './pair/Volume'

import HexOverview from './hex/HexOverview'

import Watchlist from './personal/Watchlist'
import Alerts from './personal/Alerts'

import { HEX, PLS, USDC, DEFAULT_PAIR } from '../state/tokens'

/**
 * Every module, registered.
 *
 * This is the only file that has to change when a module is added, and the only
 * one that imports module components. The engine - grid, renderer, toolbar,
 * reducer, library - reads all of this through the registry and none of it
 * directly.
 *
 * A definition is the module's whole contract: what it is called, how big it
 * wants to be, what it can be configured with, and whether it can follow the
 * dashboard context. The library card, the settings panel and the grid
 * constraints are all generated from it.
 */

/** Sizes for the rank-list style modules, which all want the same shape. */
const LIST_SIZE = { defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 4 } }

const LIMIT_FIELD = {
  key: 'limit',
  label: 'Rows',
  type: 'number',
  min: 3,
  max: 50,
  help: 'How many entries to list.',
}

registerModules([
  /* ------------------------------------------------------------------ market */

  {
    type: 'price-card',
    name: 'Token metric',
    description: 'One figure about one token: price, market cap, liquidity, volume or transactions.',
    category: 'market',
    icon: Tag,
    component: PriceCard,
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 3 },
    maxSize: { w: 12, h: 5 },
    contextAware: true,
    contextKind: 'asset',
    defaultConfig: { token: HEX, metric: 'price' },
    configSchema: [
      { key: 'token', label: 'Token', type: 'token' },
      {
        key: 'metric',
        label: 'Metric',
        type: 'select',
        options: [
          { value: 'price', label: 'Price' },
          { value: 'marketCap', label: 'Market cap' },
          { value: 'liquidity', label: 'Liquidity' },
          { value: 'volume', label: '24h volume' },
          { value: 'transactions', label: '24h transactions' },
        ],
      },
    ],
    getTitle: ({ instance, context }) =>
      (context.following ? context.asset?.symbol : instance.config.token?.symbol) ?? 'Token metric',
  },

  {
    type: 'price-chart',
    name: 'Price chart',
    description: 'Candles, line or area for any pair, on any of the supported timeframes.',
    category: 'market',
    icon: CandlestickChart,
    component: PriceChart,
    defaultSize: { w: 8, h: 8 },
    minSize: { w: 4, h: 5 },
    contextAware: true,
    contextKind: 'pair',
    defaultConfig: { pair: DEFAULT_PAIR, timeframe: '1h', chartType: 'candles' },
    configSchema: [
      { key: 'pair', label: 'Pair', type: 'pair' },
      {
        key: 'timeframe',
        label: 'Timeframe',
        type: 'select',
        options: TIMEFRAMES.map((t) => ({ value: t.value, label: t.label })),
      },
      {
        key: 'chartType',
        label: 'Chart type',
        type: 'select',
        options: [
          { value: 'candles', label: 'Candles' },
          { value: 'line', label: 'Line' },
          { value: 'area', label: 'Area' },
        ],
      },
    ],
    getTitle: ({ instance, context }) => {
      const pair = context.following ? context.pair : instance.config.pair
      return pair?.label ?? 'Price chart'
    },
    getSubtitle: ({ instance }) => instance.config.timeframe?.toUpperCase(),
  },

  {
    type: 'top-movers',
    name: 'Top movers',
    description: 'Gainers, losers, volume or transaction leaders across tracked pairs.',
    category: 'market',
    icon: TrendingUp,
    component: TopMovers,
    ...LIST_SIZE,
    defaultConfig: { mode: 'gainers', limit: 8, minLiquidity: 25_000 },
    configSchema: [
      {
        key: 'mode',
        label: 'Ranking',
        type: 'select',
        options: [
          { value: 'gainers', label: 'Top gainers' },
          { value: 'losers', label: 'Top losers' },
          { value: 'volume', label: 'Highest volume' },
          { value: 'transactions', label: 'Most transactions' },
          { value: 'liquidity', label: 'Deepest liquidity' },
        ],
      },
      LIMIT_FIELD,
      {
        key: 'minLiquidity',
        label: 'Minimum liquidity ($)',
        type: 'number',
        min: 0,
        step: 1000,
        help: 'Filters out dust pools, where a single trade looks like a 90% move.',
      },
    ],
    getTitle: ({ instance }) =>
      ({
        gainers: 'Top gainers',
        losers: 'Top losers',
        volume: 'Highest volume',
        transactions: 'Most transactions',
        liquidity: 'Deepest liquidity',
      })[instance.config.mode] ?? 'Top movers',
  },

  {
    type: 'trending',
    name: 'Trending',
    description: 'Pairs trading well above their own daily average right now.',
    category: 'market',
    icon: Flame,
    component: Trending,
    ...LIST_SIZE,
    defaultConfig: { limit: 10 },
    configSchema: [LIMIT_FIELD],
  },

  {
    type: 'market-overview',
    name: 'Market overview',
    description: 'Volume, liquidity, transactions and gas across the pairs PulseDEX tracks.',
    category: 'pulsechain',
    icon: Globe2,
    component: MarketOverview,
    defaultSize: { w: 12, h: 3 },
    minSize: { w: 4, h: 3 },
  },

  {
    type: 'new-pairs',
    name: 'New pairs',
    description: 'Recently created pairs, filtered by age and liquidity.',
    category: 'market',
    icon: Sparkles,
    component: NewPairs,
    ...LIST_SIZE,
    /*
     * Ninety days and a thousand dollars, measured against the real board
     * rather than guessed. Of the 256 pairs PulseDEX indexes, nothing younger
     * than thirty days holds ten thousand in liquidity - so the obvious-looking
     * defaults shipped a module that was empty on a perfectly healthy market,
     * which reads as broken rather than as accurate.
     */
    defaultConfig: { limit: 12, maxAgeDays: 90, minLiquidity: 1_000 },
    configSchema: [
      LIMIT_FIELD,
      { key: 'maxAgeDays', label: 'Maximum age (days)', type: 'number', min: 1, max: 365 },
      { key: 'minLiquidity', label: 'Minimum liquidity ($)', type: 'number', min: 0, step: 1000 },
    ],
  },

  /* ----------------------------------------------------------------- trading */

  {
    type: 'trade',
    name: 'Trade',
    description: 'Quote a swap between any two tokens, with the route the aggregator would take.',
    category: 'trading',
    icon: ArrowLeftRight,
    component: TradeModule,
    defaultSize: { w: 4, h: 9 },
    minSize: { w: 3, h: 7 },
    // Not context-aware on purpose. A trade has an input and an output, which
    // is not the same thing as a pair - binding it to the dashboard pair would
    // make "HEX to USDC" impossible to express whenever the toolbar was set to
    // something else.
    defaultConfig: { from: PLS, to: USDC, slippage: 0.5, aggregator: 'pulsex' },
    configSchema: [
      { key: 'from', label: 'Sell', type: 'token' },
      { key: 'to', label: 'Buy', type: 'token' },
      {
        key: 'slippage',
        label: 'Slippage tolerance (%)',
        type: 'number',
        min: 0.1,
        max: 50,
        step: 0.1,
        help: 'Used to compute the minimum received.',
      },
    ],
    getTitle: ({ instance }) =>
      instance.config.from && instance.config.to
        ? `${instance.config.from.symbol} → ${instance.config.to.symbol}`
        : 'Trade',
  },

  /* --------------------------------------------------------------- portfolio */

  {
    type: 'portfolio',
    name: 'Portfolio',
    description: 'Total value and weighted 24h change for the connected wallet.',
    category: 'portfolio',
    icon: Wallet,
    component: Portfolio,
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 3, h: 4 },
    defaultConfig: {},
    configSchema: [
      {
        key: 'wallet',
        label: 'Wallet address',
        type: 'text',
        help: 'Leave blank to use the connected wallet.',
      },
    ],
  },

  {
    type: 'holdings',
    name: 'Holdings',
    description: 'Every position in the wallet, with value and share of the total.',
    category: 'portfolio',
    icon: Coins,
    component: Holdings,
    defaultSize: { w: 6, h: 8 },
    minSize: { w: 4, h: 4 },
    defaultConfig: { sortBy: 'value', limit: 25 },
    configSchema: [
      {
        key: 'sortBy',
        label: 'Sort by',
        type: 'select',
        options: [
          { value: 'value', label: 'Value' },
          { value: 'percentage', label: 'Share of portfolio' },
          { value: 'change', label: '24h change' },
        ],
      },
      LIMIT_FIELD,
      {
        key: 'includeSpam',
        label: 'Include suspected spam tokens',
        type: 'toggle',
        help: 'Airdropped junk is hidden by default; it distorts the total.',
      },
      { key: 'wallet', label: 'Wallet address', type: 'text' },
    ],
  },

  /* -------------------------------------------------------------------- pair */

  {
    type: 'pair-explorer',
    name: 'Pair explorer',
    description: 'Price, liquidity, volume, transactions and venue for one pair.',
    category: 'pair',
    icon: ListOrdered,
    component: PairExplorer,
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 4 },
    contextAware: true,
    contextKind: 'pair',
    defaultConfig: { pair: DEFAULT_PAIR },
    configSchema: [{ key: 'pair', label: 'Pair', type: 'pair' }],
    getTitle: ({ instance, context }) =>
      (context.following ? context.pair : instance.config.pair)?.label ?? 'Pair explorer',
  },

  {
    type: 'recent-trades',
    name: 'Recent trades',
    description: 'Swaps through the pool, reconstructed from on-chain transfers.',
    category: 'pair',
    icon: Receipt,
    component: RecentTrades,
    defaultSize: { w: 6, h: 7 },
    minSize: { w: 4, h: 4 },
    contextAware: true,
    contextKind: 'pair',
    defaultConfig: { pair: DEFAULT_PAIR, filter: 'all', limit: 25 },
    configSchema: [
      { key: 'pair', label: 'Pair', type: 'pair' },
      {
        key: 'filter',
        label: 'Show',
        type: 'select',
        options: [
          { value: 'all', label: 'All swaps' },
          { value: 'buy', label: 'Buys only' },
          { value: 'sell', label: 'Sells only' },
        ],
      },
      LIMIT_FIELD,
      {
        key: 'minAmount',
        label: 'Minimum size (base token)',
        type: 'number',
        min: 0,
        help: 'Hides dust trades.',
      },
    ],
    getTitle: ({ instance, context }) => {
      const pair = context.following ? context.pair : instance.config.pair
      return pair?.label ? `${pair.label} swaps` : 'Recent trades'
    },
  },

  {
    type: 'liquidity',
    name: 'Liquidity',
    description: 'Pool depth and how it is split between the two assets.',
    category: 'pair',
    icon: Droplets,
    component: Liquidity,
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 4 },
    contextAware: true,
    contextKind: 'pair',
    defaultConfig: { pair: DEFAULT_PAIR },
    configSchema: [{ key: 'pair', label: 'Pair', type: 'pair' }],
  },

  {
    type: 'volume',
    name: 'Volume and activity',
    description: 'Volume across every window the venue reports, plus the buy/sell split.',
    category: 'pair',
    icon: Activity,
    component: Volume,
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 4 },
    contextAware: true,
    contextKind: 'pair',
    defaultConfig: { pair: DEFAULT_PAIR },
    configSchema: [{ key: 'pair', label: 'Pair', type: 'pair' }],
  },

  /* --------------------------------------------------------------------- HEX */

  {
    type: 'hex-overview',
    name: 'HEX overview',
    description: 'HEX price, market cap, volume, liquidity and on-chain supply.',
    category: 'hex',
    icon: Gauge,
    component: HexOverview,
    defaultSize: { w: 4, h: 7 },
    minSize: { w: 3, h: 5 },
    defaultConfig: { variant: 'hex' },
    configSchema: [
      {
        key: 'variant',
        label: 'Which HEX',
        type: 'select',
        options: [
          { value: 'hex', label: 'HEX (PulseChain)' },
          { value: 'ehex', label: 'HEX from Ethereum' },
        ],
        help: 'Two separate contracts that trade at different prices.',
      },
    ],
  },

  /* ---------------------------------------------------------------- personal */

  {
    type: 'watchlist',
    name: 'Watchlist',
    description: 'The pairs you follow, shared with the rest of PulseDEX.',
    category: 'personal',
    icon: Star,
    component: Watchlist,
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
    defaultConfig: { showVolume: false },
    configSchema: [{ key: 'showVolume', label: 'Show 24h volume column', type: 'toggle' }],
  },

  {
    type: 'alerts',
    name: 'Alerts',
    description: 'Price and volume rules, checked live while the dashboard is open.',
    category: 'personal',
    icon: Bell,
    component: Alerts,
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
])
