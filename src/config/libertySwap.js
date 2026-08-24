/**
 * Liberty Swap v1 Configuration & Security Metadata
 * Supported Chains: Ethereum (1), PulseChain (369), Base (8453), BSC (56), Polygon (137), Arbitrum (42161)
 */

export const LIBERTY_API_BASE = 'https://api.libertyswap.finance'

// Standard EVM Chain Configurations
export const SUPPORTED_CHAINS = [
  {
    id: 369,
    name: 'PulseChain',
    shortName: 'PLS',
    symbol: 'PLS',
    nativeDecimals: 18,
    explorer: 'https://scan.pulsechain.com',
    explorerName: 'PulseScan',
    rpcUrl: 'https://rpc.pulsechain.com',
    color: '#00ff9d',
    bgGlow: 'rgba(0, 255, 157, 0.15)',
    icon: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0xa1077a294dde1b09bb078844df40758a5d0f9a27.png',
  },
  {
    id: 1,
    name: 'Ethereum',
    shortName: 'ETH',
    symbol: 'ETH',
    nativeDecimals: 18,
    explorer: 'https://etherscan.io',
    explorerName: 'Etherscan',
    rpcUrl: 'https://eth.llamarpc.com',
    color: '#627eea',
    bgGlow: 'rgba(98, 126, 234, 0.15)',
    icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },
  {
    id: 8453,
    name: 'Base',
    shortName: 'Base',
    symbol: 'ETH',
    nativeDecimals: 18,
    explorer: 'https://basescan.org',
    explorerName: 'BaseScan',
    rpcUrl: 'https://mainnet.base.org',
    color: '#0052ff',
    bgGlow: 'rgba(0, 82, 255, 0.15)',
    icon: 'https://raw.githubusercontent.com/base-org/brand-kit/master/logo/symbol/Base_Symbol_Blue.png',
  },
  {
    id: 56,
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    symbol: 'BNB',
    nativeDecimals: 18,
    explorer: 'https://bscscan.com',
    explorerName: 'BscScan',
    rpcUrl: 'https://binance.llamarpc.com',
    color: '#f3ba2f',
    bgGlow: 'rgba(243, 186, 47, 0.15)',
    icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
  },
  {
    id: 42161,
    name: 'Arbitrum One',
    shortName: 'Arbitrum',
    symbol: 'ETH',
    nativeDecimals: 18,
    explorer: 'https://arbiscan.io',
    explorerName: 'Arbiscan',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    color: '#28a0f0',
    bgGlow: 'rgba(40, 160, 240, 0.15)',
    icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  },
  {
    id: 137,
    name: 'Polygon',
    shortName: 'Polygon',
    symbol: 'POL',
    nativeDecimals: 18,
    explorer: 'https://polygonscan.com',
    explorerName: 'PolygonScan',
    rpcUrl: 'https://polygon-rpc.com',
    color: '#8247e5',
    bgGlow: 'rgba(130, 71, 229, 0.15)',
    icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
  },
]

// Common Tokens per Chain for Liberty Swap
export const CHAIN_TOKENS = {
  // PulseChain (369)
  369: [
    {
      symbol: 'USDC',
      name: 'USD Coin (from Ethereum)',
      decimals: 6,
      address: '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07',
      isStable: true,
      icon: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07.png',
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether (from Ethereum)',
      decimals: 18,
      address: '0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C',
      isStable: false,
      icon: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c.png',
    },
    {
      symbol: 'USDT',
      name: 'Tether USD (from Ethereum)',
      decimals: 6,
      address: '0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f',
      isStable: true,
      icon: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f.png',
    },
    {
      symbol: 'DAI',
      name: 'Dai Stablecoin (from Ethereum)',
      decimals: 18,
      address: '0xefD766cCb38EaF1dfd701853BFCe31359239F305',
      isStable: true,
      icon: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0xefd766ccb38eaf1dfd701853bfce31359239f305.png',
    },
    {
      symbol: 'USD1',
      name: 'USD1 Stablecoin',
      decimals: 18,
      address: '0x0000000000000000000000000000000000000000',
      isStable: true,
      icon: 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0xefd766ccb38eaf1dfd701853bfce31359239f305.png',
    },
  ],

  // Ethereum (1)
  1: [
    {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      isStable: true,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    },
    {
      symbol: 'ETH',
      name: 'Ethereum (Native)',
      decimals: 18,
      address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      isNative: true,
      isStable: false,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      isStable: false,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      isStable: true,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
    },
    {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      isStable: true,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
    },
  ],

  // Base (8453)
  8453: [
    {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      isStable: true,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913/logo.png',
    },
    {
      symbol: 'ETH',
      name: 'Ethereum (Native)',
      decimals: 18,
      address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      isNative: true,
      isStable: false,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      address: '0x4200000000000000000000000000000000000006',
      isStable: false,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
      isStable: true,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
    },
  ],

  // BSC (56)
  56: [
    {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 18,
      address: '0x55d398326f99059fF775485246999027B3197955',
      isStable: true,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/assets/0x55d398326f99059fF775485246999027B3197955/logo.png',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 18,
      address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      isStable: true,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/assets/0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d/logo.png',
    },
    {
      symbol: 'ETH',
      name: 'Binance-Peg Ethereum',
      decimals: 18,
      address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
      isStable: false,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    },
    {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
      isStable: true,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
    },
  ],

  // Arbitrum (42161)
  42161: [
    {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      isStable: true,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0xaf88d065e77c8cC2239327C5EDb3A432268e5831/logo.png',
    },
    {
      symbol: 'ETH',
      name: 'Ethereum (Native)',
      decimals: 18,
      address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      isNative: true,
      isStable: false,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      isStable: false,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      isStable: true,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
    },
  ],

  // Polygon (137)
  137: [
    {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      isStable: true,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/assets/0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359/logo.png',
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      isStable: true,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      isStable: false,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    },
    {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      isStable: true,
      icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
    },
  ],
}

// Volume Validation Constraints
export const VOLUME_LIMITS = {
  STABLE: {
    min: 10,
    max: 25000,
    unit: 'USD',
    label: '10 - 25,000 USD',
  },
  ETH: {
    min: 0.01,
    max: 20,
    unit: 'ETH',
    label: '0.01 - 20 ETH',
  },
}

// Router Whitelist Security Registry
export const ROUTER_WHITELIST = [
  '0xe7ee706a6708b691a232452c9cb267d186942f09', // PulseChain USDC
  '0x80c2c603d72ea17a0d85b670d4489eb3012035cd', // PulseChain WETH
  '0x60fdaf9198efcd6faf27d50e955e1a42905f2eeb', // Ethereum Router 1
  '0x06291eee038e94e8dec2b3bfb6e030c0b5615506', // Ethereum Router 2
  '0xefb11856c4be75c276a5c9e286f8032d3e16ced2', // Base USDC
  '0x43f403972080406e3e6602793a5072dbc4389bab', // BSC Router 1
  '0xc438d51f296ff3e53d061293d2bc4bb9fb2f7f19', // BSC Router 2
  '0x05216280d45bb8e8dcb863186e4762090bab7b6f', // Arbitrum USDC
  '0xcb2b2a70f29a8b7467fa930a09f9271d1ef0e5a9', // Polygon USDC
]

/**
 * Validates whether an address is within the verified Liberty Swap Router Whitelist
 */
export function isRouterWhitelisted(address) {
  if (!address || typeof address !== 'string') return false
  return ROUTER_WHITELIST.includes(address.toLowerCase().trim())
}

/**
 * Validates volume limit constraints
 * @returns { error: string | null }
 */
export function validateVolumeLimit(tokenSymbol, amount) {
  const num = parseFloat(amount)
  if (isNaN(num) || num <= 0) return null

  const isEth = ['ETH', 'WETH'].includes(tokenSymbol?.toUpperCase())
  const limits = isEth ? VOLUME_LIMITS.ETH : VOLUME_LIMITS.STABLE

  if (num < limits.min) {
    return `Minimum cross-chain swap amount is ${limits.min} ${limits.unit}`
  }
  if (num > limits.max) {
    return `Maximum cross-chain swap amount is ${limits.max.toLocaleString()} ${limits.unit}`
  }
  return null
}

// Standard ERC-20 Minimal ABI for Allowances & Approvals
export const ERC20_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
]
