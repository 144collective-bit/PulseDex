import { defineChain } from 'viem'

export const pulsechain = defineChain({
  id: 369,
  name: 'PulseChain',
  nativeCurrency: {
    name: 'Pulse',
    symbol: 'PLS',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.pulsechain.com', 'https://pulsechain-rpc.publicnode.com'],
      webSocket: ['wss://rpc.pulsechain.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'PulseScan',
      url: 'https://scan.pulsechain.com',
    },
    otterscan: {
      name: 'Otterscan',
      url: 'https://otter.pulsechain.com',
    },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 14353601,
    },
  },
})

// Top PulseChain Tokens with metadata & standard contract addresses
export const KNOWN_PULSE_TOKENS = [
  {
    address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
    symbol: 'WPLS',
    name: 'Wrapped Pulse',
    decimals: 18,
    isNative: true,
    logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0xa1077a294dde1b09bb078844df40758a5d0f9a27.png',
  },
  {
    address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab',
    symbol: 'PLSX',
    name: 'PulseX',
    decimals: 18,
    logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x95b303987a60c71504d99aa1b13b4da07b0790ab.png',
  },
  {
    address: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39',
    symbol: 'HEX',
    name: 'HEX (PulseChain)',
    decimals: 8,
    logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x2b591e99afe9f32eaa6214f7b7629768c40eeb39.png',
  },
  {
    address: '0x57fde0a71132198BBeC939B98976993d8D89D225',
    // Bridged HEX, distinct from PulseChain's own at 0x2b59... and holding
    // separate pools. Both report "HEX" on chain and through the explorer, so
    // the picker would otherwise offer two identical rows for two different
    // tokens - and choosing the wrong one is a trade into the wrong pool.
    // eHEX is what the chain's own users call it.
    symbol: 'eHEX',
    name: 'HEX from Ethereum',
    decimals: 8,
    logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x57fde0a71132198bbec939b98976993d8d89d225.png',
  },
  {
    address: '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d',
    symbol: 'INC',
    name: 'Incentive Token',
    decimals: 18,
    logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d.png',
  },
  {
    address: '0xefD766cCb38EaF1dfd701853BFCe31359239F305',
    symbol: 'DAI',
    name: 'DAI from Ethereum',
    decimals: 18,
    logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0xefd766ccb38eaf1dfd701853bfce31359239f305.png',
  },
  {
    address: '0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C',
    symbol: 'WETH',
    name: 'ETH from Ethereum',
    decimals: 18,
    logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c.png',
  },
  {
    address: '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07',
    symbol: 'USDC',
    name: 'USDC from Ethereum',
    decimals: 6,
    logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07.png',
  },
  {
    address: '0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f',
    symbol: 'USDT',
    name: 'USDT from Ethereum',
    decimals: 6,
    logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f.png',
  },
  {
    address: '0x3819f64f282bf135d62168C1e513280dAF905e06',
    symbol: 'HDRN',
    name: 'Hedron',
    decimals: 9,
    logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x3819f64f282bf135d62168c1e513280daf905e06.png',
  },
  {
    address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab',
    symbol: 'PLSD',
    name: 'Pulse Bitcoin',
    decimals: 8,
    logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x95b303987a60c71504d99aa1b13b4da07b0790ab.png',
  },
  {
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    symbol: 'LINK',
    name: 'Chainlink from Ethereum',
    decimals: 18,
    logo: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x514910771af9ca656af840dff83e8264ecf986ca.png',
  }
]

// Default featured pair: PLSX / WPLS (PulseX v2 primary liquidity pool)
export const DEFAULT_PAIR_ADDRESS = '0x1b45b9148791d3a104184Cd5DFE5CE57193a3ee9'
export const PULSEX_ROUTER_V2 = '0x165C3410fC91EF562C50559f7d2289fEbed552d9'
export const PULSEX_ROUTER_V1 = '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02'
