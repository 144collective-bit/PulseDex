import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/*
 * The connector list, which was wrong in a way nobody could see from a build.
 *
 * Every entry used to be `injected` - a provider the page can already find on
 * `window`. Extensions put one there; phone browsers do not. So on mobile the
 * wallet modal detected nothing and offered to install browser add-ons that
 * cannot exist on a phone: no path to connect at all, and no error either.
 *
 * The list is now decided at load time from what the page can see, so these
 * tests build it twice - once as a phone browser, once as a desktop with an
 * extension - and check both answers.
 */

/**
 * Load a fresh copy of the config against a given window.
 *
 * Enough of a window for wagmi's EIP-6963 discovery to run: it listens for
 * wallets announcing themselves, so the event methods have to exist even
 * though nothing here will announce.
 */
async function loadConfig({ ethereum }) {
  vi.resetModules()
  globalThis.window = {
    ethereum,
    location: { origin: 'https://www.pulsedex.net', href: 'https://www.pulsedex.net/' },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }
  const mod = await import('./wagmi')
  return mod
}

const idsOf = (config) => config.connectors.map((c) => c.id)

let savedWindow

beforeEach(() => {
  savedWindow = globalThis.window
})

afterEach(() => {
  globalThis.window = savedWindow
  vi.resetModules()
})

describe('a browser with no wallet extension', () => {
  it('offers a connector that does not need an injected provider', async () => {
    // The regression guard. Without one of these a phone has no way to reach a
    // wallet at all, which is exactly what shipped.
    const { wagmiConfig } = await loadConfig({ ethereum: undefined })
    const bridged = idsOf(wagmiConfig).filter((id) => id === 'metaMaskSDK' || id === 'walletConnect')

    expect(bridged.length).toBeGreaterThan(0)
  })

  it('puts the bridged connector last, so a late-announcing extension still wins', async () => {
    // Sign-in walks the list and takes the first connector that resolves a
    // provider. The SDK always resolves one, so ahead of the extensions it
    // would take over every connection.
    const { wagmiConfig } = await loadConfig({ ethereum: undefined })
    const ids = idsOf(wagmiConfig)

    expect(ids.indexOf('metaMaskSDK')).toBeGreaterThan(ids.indexOf('injected'))
  })
})

describe('a browser that already has a wallet', () => {
  it('leaves the SDK out, because the injected connectors reach that wallet already', async () => {
    // Not tidiness: wagmi reconnects on mount by asking every connector for
    // its provider, and this one answers by loading a 106 kB SDK. Listing it
    // costs every visitor that download before they have asked for a wallet.
    const { wagmiConfig } = await loadConfig({ ethereum: { isMetaMask: true } })

    expect(idsOf(wagmiConfig)).not.toContain('metaMaskSDK')
  })

  it('still lists every injected wallet', async () => {
    const { wagmiConfig } = await loadConfig({ ethereum: { isMetaMask: true } })
    const ids = idsOf(wagmiConfig)

    expect(ids).toContain('rabby')
    expect(ids).toContain('internetMoney')
    expect(ids).toContain('zkxWallet')
    expect(ids).toContain('injected')
  })
})

describe('either way', () => {
  it('gives every connector a distinct id', async () => {
    for (const ethereum of [undefined, { isMetaMask: true }]) {
      const { wagmiConfig } = await loadConfig({ ethereum })
      const ids = idsOf(wagmiConfig)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('leaves WalletConnect out until a project id exists', async () => {
    // A connector with no project id fails the moment someone taps it, which
    // is worse than not offering it.
    const { wagmiConfig, hasWalletConnect } = await loadConfig({ ethereum: undefined })

    expect(idsOf(wagmiConfig).includes('walletConnect')).toBe(hasWalletConnect)
  })

  it('leads with PulseChain', async () => {
    const { wagmiConfig } = await loadConfig({ ethereum: undefined })
    const { pulsechain } = await import('./pulsechain')

    expect(wagmiConfig.chains[0].id).toBe(pulsechain.id)
  })

  it('has a transport for every chain it declares', async () => {
    // A chain with no transport throws only when someone switches to it, a
    // long way from where the mistake was made.
    const { wagmiConfig } = await loadConfig({ ethereum: undefined })

    for (const chain of wagmiConfig.chains) {
      expect(wagmiConfig._internal.transports[chain.id]).toBeDefined()
    }
  })
})
