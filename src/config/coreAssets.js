/**
 * The core PulseChain assets shown on the Home board.
 *
 * Pinned by contract address, never by ticker: a DexScreener search for "PRVX"
 * returns three different tokens, only one of which is ProveX. Symbol matching
 * would happily show an impostor.
 */

/**
 * Burn sinks. Tokens held at any of these are treated as removed from supply.
 *
 * The dead address alone is not enough on PulseChain: the chain's own 0x…0369
 * address holds far more than it does for several assets (163B of the 166B of
 * burned PLS, and 32B of PLSX). Summing all four reproduces the burn totals
 * published by plsfolio exactly for HEX, eHEX, INC, PLS and PRVX.
 */
export const BURN_ADDRESSES = [
  '0x0000000000000000000000000000000000000369',
  '0x000000000000000000000000000000000000dEaD',
  '0x0000000000000000000000000000000000000000',
  '0x0000000000000000000000000000000000005555',
]

/** Kept for callers that only need the conventional sink. */
export const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD'

/**
 * Wrapped Pulse. PLS itself is the chain's native coin with no ERC20 contract,
 * so its price and supply are read from the WPLS market instead.
 */
export const WPLS_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'

export const CORE_ASSETS = [
  {
    id: 'pls',
    symbol: 'PLS',
    name: 'Pulse',
    // Native coin: priced through the WPLS pair, no totalSupply() to call.
    isNative: true,
    address: WPLS_ADDRESS,
    decimals: 18,
    verified: true,
    /*
     * The canonical WPLS/DAI pool on PulseX, preferred rather than pinned.
     *
     * This was a hand-patch over a fault in pool selection, which used to take
     * the deepest pool and so landed PLS on a 9mm pool holding $2M and trading
     * once a day, twelve per cent above the market. Selection weighs venue and
     * activity ahead of depth now and would find a sound pool on its own; a
     * stablecoin-quoted market is still the better reference for a USD price,
     * so the preference stays - and is dropped automatically if this pool ever
     * stops trading.
     */
    pairAddress: '0xE56043671df55dE5CDf8459710433C10324DE0aE',
  },
  {
    id: 'plsx',
    symbol: 'PLSX',
    name: 'PulseX',
    address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab',
    decimals: 18,
  },
  {
    id: 'hex',
    symbol: 'HEX',
    name: 'HEX',
    address: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39',
    decimals: 8,
    verified: true,
  },
  {
    id: 'ehex',
    symbol: 'eHEX',
    name: 'HEX from Ethereum',
    address: '0x57fde0a71132198BBeC939B98976993d8D89D225',
    decimals: 8,
  },
  {
    id: 'inc',
    symbol: 'INC',
    name: 'Incentive',
    address: '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d',
    decimals: 18,
  },
  {
    id: 'prvx',
    symbol: 'PRVX',
    name: 'ProveX',
    address: '0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11',
    decimals: 18,
  },
]

/** Home board refresh cadence, matching the screener's ticker. */
export const CORE_POLL_INTERVAL = 30_000
