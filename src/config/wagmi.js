import { http, createConfig, fallback } from 'wagmi'
import { injected, metaMask, walletConnect } from 'wagmi/connectors'
import { mainnet, base, bsc, polygon, arbitrum } from 'viem/chains'
import { pulsechain } from './pulsechain'

/**
 * How a phone connects at all.
 *
 * Every connector here used to be `injected`, which means a provider the page
 * can already see on `window`. A browser extension puts one there; a phone
 * browser does not. So on any normal mobile browser the wallet modal listed
 * four extensions, detected none of them, and offered to install browser
 * add-ons that cannot exist on a phone - there was no path to connect at all.
 *
 * Two are added, and they cover different ground:
 *
 * - `metaMask` speaks to the MetaMask app directly, deep-linking out and back.
 *   It needs no account or key of ours, so it works the moment this ships.
 * - `walletConnect` is the universal one - Trust, Rainbow, Rabby mobile and
 *   the rest all speak it - but it needs a free project id from reown.com.
 *   Until that exists it is left out entirely rather than added broken, since
 *   a connector with no id fails at the moment someone taps it.
 *
 * Both SDKs are loaded lazily by the connector, so a visitor who never opens
 * the wallet modal never downloads them.
 */
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

const dappMetadata = {
  name: 'PulseDEX',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://pulsedex.net',
}

export const hasWalletConnect = Boolean(walletConnectProjectId)

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

    /*
     * 6. MetaMask, over its own SDK rather than through the window.
     *
     * On a desktop with the extension this behaves like the injected entry
     * above. On a phone it opens the MetaMask app, asks there, and returns -
     * the only route that needs nothing from us to start working.
     */
    metaMask({ dappMetadata }),

    // 7. WalletConnect, when a project id has been configured. Reaches every
    //    other mobile wallet: a QR on desktop, a deep link on a phone.
    ...(walletConnectProjectId
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            showQrModal: true,
            metadata: {
              ...dappMetadata,
              description: 'PulseChain DEX screener and portfolio tracker',
              icons: [`${dappMetadata.url}/favicon.ico`],
            },
          }),
        ]
      : []),
  ],
  transports: {
    /*
     * PulseChain gets a fallback list, the other chains do not.
     *
     * This is the chain the app is actually for - every balance, quote and
     * supply read goes through it - so a single endpoint having a bad minute
     * takes the product down. The others are here so a wallet already pointed
     * at Ethereum or Base can still connect and be told to switch, which one
     * endpoint is enough for.
     *
     * The same three nodes as `services/rpc.js`, in the same order.
     */
    [pulsechain.id]: fallback(
      [
        http('https://rpc.pulsechain.com', { timeout: 15_000 }),
        http('https://pulsechain.publicnode.com', { timeout: 15_000 }),
        http('https://rpc-pulsechain.g4mm4.io', { timeout: 15_000 }),
      ],
      { rank: { interval: 60_000, sampleCount: 3 } },
    ),
    [mainnet.id]: http('https://eth.llamarpc.com'),
    [base.id]: http('https://mainnet.base.org'),
    [bsc.id]: http('https://binance.llamarpc.com'),
    [arbitrum.id]: http('https://arb1.arbitrum.io/rpc'),
    [polygon.id]: http('https://polygon-rpc.com'),
  },
})

