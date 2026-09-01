import { describe, it, expect } from 'vitest'
import { wagmiConfig, hasWalletConnect } from './wagmi'
import { pulsechain } from './pulsechain'

/*
 * The connector list, which was wrong in a way nobody could see from a build.
 *
 * Every entry used to be `injected` - a provider the page can already find on
 * `window`. Extensions put one there; phone browsers do not. So on mobile the
 * wallet modal detected nothing and offered to install browser add-ons that
 * cannot exist on a phone: no path to connect at all, and no error either.
 *
 * The check that matters is the last one in this file. It fails if the list
 * ever goes back to being extensions only.
 */

const connectorIds = () => wagmiConfig.connectors.map((c) => c.id)

describe('connectors', () => {
  it('keeps the injected wallets desktop users already have', () => {
    const ids = connectorIds()

    expect(ids).toContain('rabby')
    expect(ids).toContain('internetMoney')
    expect(ids).toContain('zkxWallet')
    expect(ids).toContain('injected')
  })

  it('includes at least one connector that does not need an injected provider', () => {
    // The regression guard. Without one of these, a phone browser has no way
    // to reach a wallet, which is exactly what shipped.
    const bridged = wagmiConfig.connectors.filter(
      (c) => c.id === 'metaMaskSDK' || c.id === 'walletConnect',
    )

    expect(bridged.length).toBeGreaterThan(0)
  })

  it('puts the bridged connector last, so an installed extension still wins', () => {
    // Sign-in walks the list and takes the first connector that resolves a
    // provider. The SDK always resolves one, so ahead of the extensions it
    // would take over every desktop connection.
    const ids = connectorIds()
    const sdkAt = ids.indexOf('metaMaskSDK')
    const injectedAt = ids.indexOf('injected')

    expect(sdkAt).toBeGreaterThan(injectedAt)
  })

  it('gives every connector a distinct id', () => {
    const ids = connectorIds()
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('leaves WalletConnect out until a project id exists', () => {
    // A connector with no project id fails the moment someone taps it, which
    // is worse than not offering it.
    if (!hasWalletConnect) {
      expect(connectorIds()).not.toContain('walletConnect')
    } else {
      expect(connectorIds()).toContain('walletConnect')
    }
  })
})

describe('chains and transports', () => {
  it('leads with PulseChain', () => {
    expect(wagmiConfig.chains[0].id).toBe(pulsechain.id)
  })

  it('has a transport for every chain it declares', () => {
    // A chain with no transport throws only when someone actually switches to
    // it, which is a long way from where the mistake was made.
    for (const chain of wagmiConfig.chains) {
      expect(wagmiConfig._internal.transports[chain.id]).toBeDefined()
    }
  })
})
