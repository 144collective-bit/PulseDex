/*
 * A phone browser once a WalletConnect project id exists.
 *
 * The third of three cases, each in its own file because the connector list is
 * decided at load time and the cases cannot share a module registry - the same
 * reason `wagmi.withWallet.test.js` is separate.
 *
 * This one matters more than it used to. MetaMask's SDK was previously the
 * route that needed no configuration from us, and it is gone with MetaMask
 * itself. WalletConnect is now the only way a phone with no extension reaches
 * any of the four wallets, so "does a project id actually produce that route"
 * stopped being a detail and became the whole mobile story.
 */

import { describe, it, expect, vi } from 'vitest'
import { browserWindow } from '../test/fixtures'

// Both set before importing: the config reads them while it is being built.
globalThis.window = browserWindow({ ethereum: undefined })
vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', '00000000000000000000000000000000')

const { wagmiConfig, hasWalletConnect } = await import('./wagmi')

const ids = wagmiConfig.connectors.map((c) => c.id)

describe('a phone with a WalletConnect project id', () => {
  it('reports itself as configured', () => {
    expect(hasWalletConnect).toBe(true)
  })

  it('gains the one connector that needs nothing on window', () => {
    // The route to Rabby, Internet Money, OKX and ZKX on a phone. Without it
    // the modal can only hand the page to a wallet's in-app browser, and only
    // for the wallets that publish a link to do it with.
    expect(ids).toContain('walletConnect')
  })

  it('still does not bring MetaMask back', () => {
    expect(ids).not.toContain('metaMask')
    expect(ids).not.toContain('metaMaskSDK')
  })

  it('keeps it behind the extensions', () => {
    // Sign-in takes the first connector that resolves a provider, and this one
    // always resolves. Ahead of the extensions it would answer for all of them.
    expect(ids.indexOf('walletConnect')).toBeGreaterThan(ids.indexOf('injected'))
  })
})
