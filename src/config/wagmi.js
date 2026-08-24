import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { mainnet, base, bsc, polygon, arbitrum } from 'viem/chains'
import { pulsechain } from './pulsechain'

export const wagmiConfig = createConfig({
  chains: [pulsechain, mainnet, base, bsc, arbitrum, polygon],
  connectors: [
    // 1. Rabby Wallet (EIP-6963 & window.rabby)
    injected({
      target() {
        return {
          id: 'rabby',
          name: 'Rabby Wallet',
          provider:
            typeof window !== 'undefined'
              ? window.rabby || (window.ethereum?.isRabby ? window.ethereum : undefined)
              : undefined,
        }
      },
      shimDisconnect: true,
    }),

    // 2. MetaMask
    injected({
      target: 'metaMask',
      shimDisconnect: true,
    }),

    // 3. Internet Money Wallet (Native PulseChain Multi-Chain Wallet)
    injected({
      target() {
        return {
          id: 'internetMoney',
          name: 'Internet Money Wallet',
          provider:
            typeof window !== 'undefined'
              ? window.internetmoney ||
                (window.ethereum?.isInternetMoney ? window.ethereum : undefined)
              : undefined,
        }
      },
      shimDisconnect: true,
    }),

    // 4. ZKX Wallet (Web3 Smart Wallet on PulseChain)
    injected({
      target() {
        return {
          id: 'zkxWallet',
          name: 'ZKX Wallet',
          provider:
            typeof window !== 'undefined'
              ? window.zkx || (window.ethereum?.isZKX ? window.ethereum : undefined)
              : undefined,
        }
      },
      shimDisconnect: true,
    }),

    // 5. Standard Injected & EIP-6963 Multi-Injected Discovery
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [pulsechain.id]: http('https://rpc.pulsechain.com'),
    [mainnet.id]: http('https://eth.llamarpc.com'),
    [base.id]: http('https://mainnet.base.org'),
    [bsc.id]: http('https://binance.llamarpc.com'),
    [arbitrum.id]: http('https://arb1.arbitrum.io/rpc'),
    [polygon.id]: http('https://polygon-rpc.com'),
  },
})

