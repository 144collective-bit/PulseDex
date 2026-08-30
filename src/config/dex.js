import { KNOWN_PULSE_TOKENS } from './pulsechain'

/**
 * DEX configuration.
 *
 * Quotes go straight to PulseX's own router - no contract of ours sits in the
 * path, so there is nothing of ours to audit or exploit. Both V1 and V2 return
 * identical quotes today; V2 is primary and V1 is the fallback if a call fails.
 */

export const PULSEX_ROUTER_V2 = '0x165C3410fC91EF562C50559f7d2289fEbed552d9'
export const PULSEX_ROUTER_V1 = '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02'

export const PULSEX_FACTORY_V2 = '0x29eA7545DEf87022BAdc76323F373EA1e707C523'

/** Wrapped native. PLS is quoted through WPLS; the UI still says PLS. */
export const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'

/** The sentinel the UI uses for native PLS, which has no contract. */
export const NATIVE_PLS = 'PLS'

export const ROUTER_ABI = [
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
]

/**
 * Curated tokens, shown first in the picker. Anything else can still be traded
 * by pasting an address, but it is flagged as unverified - three separate
 * tokens on this chain answer to "PRVX", and only one of them is real.
 */
export const CURATED_TOKENS = [
  {
    symbol: 'PLS',
    name: 'Pulse',
    address: NATIVE_PLS,
    decimals: 18,
    isNative: true,
    verified: true,
    logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0xa1077a294dde1b09bb078844df40758a5d0f9a27.png',
  },
  ...KNOWN_PULSE_TOKENS.filter((t) => t.symbol !== 'WPLS').map((t) => ({
    ...t,
    verified: true,
  })),
]

/** Opening pair: the two core assets, deepest liquidity, meaningful chart. */
export const DEFAULT_FROM = 'PLS'
export const DEFAULT_TO = '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab'

/** Slippage presets, in percent. */
export const SLIPPAGE_PRESETS = [0.1, 0.5, 1]
export const DEFAULT_SLIPPAGE = 0.5

/** Transaction deadline in minutes. */
export const DEFAULT_DEADLINE = 20

/**
 * Price impact thresholds. PulseChain pairs can be thin, so a trade that moves
 * the pool this far is worth stopping to read.
 */
export const IMPACT_WARN = 3
export const IMPACT_DANGER = 10
