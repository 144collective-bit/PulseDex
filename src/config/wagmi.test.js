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
  it('offers a connector that does not need an injected provider', () => {
    // The regression guard. Without one of these a phone has no way to reach a
    // wallet at all, which is exactly what shipped.
    expect(ids.filter((id) => id === 'metaMaskSDK' || id === 'walletConnect').length).toBeGreaterThan(0)
  })

  it('puts the bridged connector last, so a late-announcing extension still wins', () => {
    // Sign-in walks the list and takes the first connector that resolves a
    // provider. The SDK always resolves one, so ahead of the extensions it
    // would take over every connection.
    expect(ids.indexOf('metaMaskSDK')).toBeGreaterThan(ids.indexOf('injected'))
  })

  it('still lists every injected wallet', () => {
    expect(ids).toContain('rabby')
    expect(ids).toContain('internetMoney')
    expect(ids).toContain('zkxWallet')
    expect(ids).toContain('injected')
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
