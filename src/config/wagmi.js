import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { pulsechain } from './pulsechain'

export const wagmiConfig = createConfig({
  chains: [pulsechain],
  connectors: [
    injected({
      target: 'metaMask',
      shimDisconnect: true,
    }),
    injected({
      target: 'rabby',
      shimDisconnect: true,
    }),
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [pulsechain.id]: http('https://rpc.pulsechain.com'),
  },
})
