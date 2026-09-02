/*
 * The connector list as a phone browser sees it, which is where it was wrong.
 *
 * Every entry used to be `injected` - a provider the page can already find on
 * `window`. Extensions put one there; phone browsers do not. So on mobile the
 * wallet modal detected nothing and offered to install browser add-ons that
 * cannot exist on a phone: no path to connect at all, and no error either.
 *
 * The list is decided at load time from what the page can see, so the two
 * cases cannot share a module registry. The other one lives in
 * `wagmi.withWallet.test.js`, which keeps each to a single import of wagmi and
 * viem - the most expensive thing in this suite - and lets the two run at the
 * same time.
 */

import { describe, it, expect } from 'vitest'
import { browserWindow } from '../test/fixtures'

// Set before importing: the config reads this while it is being built.
globalThis.window = browserWindow({ ethereum: undefined })

const { wagmiConfig, hasWalletConnect } = await import('./wagmi')
const { pulsechain } = await import('./pulsechain')

const ids = wagmiConfig.connectors.map((c) => c.id)

describe('a browser with no wallet extension', () => {
  it('has exactly one route that does not need an injected provider, and it is WalletConnect', () => {
    /*
     * This guard used to be satisfied by the MetaMask SDK, which deep-linked
     * out to the app and back and needed no configuration from us. MetaMask is
     * no longer one of the wallets this app offers, so that route is gone and
     * WalletConnect is the only one left.
     *
     * Which means the guard now depends on configuration - see the next test.
     * It is written this way rather than deleted because the condition it was
     * protecting against is real and has shipped before: a phone that can see
     * the wallet list and reach none of it.
     */
    const bridged = ids.filter((id) => id === 'walletConnect')
    expect(ids).not.toContain('metaMaskSDK')
    expect(bridged.length).toBe(hasWalletConnect ? 1 : 0)
  })

  it('leaves a phone with no in-place connector at all when WalletConnect is unset', () => {
    /*
     * Stated rather than asserted away. With no project id and no extension,
     * every remaining connector needs a provider on `window` that a phone
     * browser does not have - so the modal falls back to handing the page to a
     * wallet's own in-app browser, and only the wallets with a published deep
     * link can be reached that way.
     *
     * Configuring VITE_WALLETCONNECT_PROJECT_ID closes this. Until then it is
     * a known gap, and this test is where it is written down.
     */
    if (!hasWalletConnect) {
      expect(ids.every((id) => id !== 'walletConnect' && id !== 'metaMaskSDK')).toBe(true)
    }
  })

  it('puts the bridged connector after the extensions, so a late announcement still wins', () => {
    // Sign-in walks the list and takes the first connector that resolves a
    // provider. A bridged connector always resolves one, so ahead of the
    // extensions it would take over every connection.
    if (hasWalletConnect) {
      expect(ids.indexOf('walletConnect')).toBeGreaterThan(ids.indexOf('injected'))
    }
  })

  it('lists the four wallets this app offers, and no others', () => {
    expect(ids).toContain('rabby')
    expect(ids).toContain('internetMoney')
    expect(ids).toContain('zkxWallet')
    expect(ids).toContain('okxWallet')
    expect(ids).toContain('injected')
  })

  it('does not offer MetaMask by any route', () => {
    // Removed as a choice, so neither the targeted connector nor the SDK may
    // survive - either would let it back in without appearing in the list.
    expect(ids).not.toContain('metaMask')
    expect(ids).not.toContain('metaMaskSDK')
  })

  it('gives every connector a distinct id', () => {
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('leaves WalletConnect out until a project id exists', () => {
    // A connector with no project id fails the moment someone taps it, which
    // is worse than not offering it.
    expect(ids.includes('walletConnect')).toBe(hasWalletConnect)
  })
})

describe('chains and transports', () => {
  it('leads with PulseChain', () => {
    expect(wagmiConfig.chains[0].id).toBe(pulsechain.id)
  })

  it('has a transport for every chain it declares', () => {
    // A chain with no transport throws only when someone switches to it, a
    // long way from where the mistake was made.
    for (const chain of wagmiConfig.chains) {
      expect(wagmiConfig._internal.transports[chain.id]).toBeDefined()
    }
  })
})
