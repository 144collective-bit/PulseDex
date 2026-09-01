/*
 * The connector list as a browser with an extension sees it.
 *
 * A separate file from `wagmi.test.js` on purpose: the list is decided while
 * the module is being imported, so the two cases need two module registries.
 * Keeping them apart means one import of wagmi and viem each - the most
 * expensive thing in this suite - instead of one per assertion, and lets the
 * two files run at the same time.
 */

import { describe, it, expect } from 'vitest'
import { browserWindow } from '../test/fixtures'

globalThis.window = browserWindow({ ethereum: { isMetaMask: true } })

const { wagmiConfig } = await import('./wagmi')

const ids = wagmiConfig.connectors.map((c) => c.id)

describe('a browser that already has a wallet', () => {
  it('leaves the SDK out, because the injected connectors reach that wallet already', () => {
    // Not tidiness: wagmi reconnects on mount by asking every connector for
    // its provider, and this one answers by loading a 106 kB SDK. Listing it
    // costs every visitor that download before they have asked for a wallet.
    expect(ids).not.toContain('metaMaskSDK')
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
})
