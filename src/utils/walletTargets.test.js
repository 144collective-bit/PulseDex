import { describe, it, expect } from 'vitest'
import {
  matchesWallet,
  detectWallet,
  walletHandoffLink,
  providerIsWallet,
} from './walletTargets'

/*
 * Getting the right wallet, and getting to it.
 *
 * The failures here are quiet ones. A matcher that catches the wrong extension
 * sends a connection request to a wallet the user did not choose; a detector
 * that misses offers a download to somebody who already has it; a deep link
 * short of one encoding opens the app on its home screen, having lost the page
 * it was told to open.
 */

const HREF = 'https://pulsedex.net/?tab=dex&token=0xabc'

const conn = (id, name) => ({ id, name })

describe('matchesWallet', () => {
  it('finds a wallet by its configured connector id', () => {
    expect(matchesWallet(conn('okxWallet', 'OKX Wallet'), 'okx')).toBe(true)
    expect(matchesWallet(conn('rabby', 'Rabby Wallet'), 'rabby')).toBe(true)
    expect(matchesWallet(conn('internetMoney', 'Internet Money Wallet'), 'internetmoney')).toBe(true)
  })

  it('finds the same wallet when EIP-6963 announces it under its own id', () => {
    // The announced connector carries the wallet's rdns, not our id, and it is
    // often the only one that resolves when several extensions are installed.
    expect(matchesWallet(conn('com.okex.wallet', 'OKX Wallet'), 'okx')).toBe(true)
    expect(matchesWallet(conn('io.rabby', 'Rabby'), 'rabby')).toBe(true)
  })

  it('does not confuse OKX with ZKX', () => {
    // One character apart, and both are in the list. A loose match would hand
    // an OKX request to the ZKX connector, which would fail or - worse - open
    // the wrong wallet.
    expect(matchesWallet(conn('zkxWallet', 'ZKX Wallet'), 'okx')).toBe(false)
    expect(matchesWallet(conn('okxWallet', 'OKX Wallet'), 'zkxwallet')).toBe(false)
  })

  it('does not match one wallet against another', () => {
    expect(matchesWallet(conn('okxWallet', 'OKX Wallet'), 'internetmoney')).toBe(false)
    expect(matchesWallet(conn('rabby', 'Rabby Wallet'), 'zkxwallet')).toBe(false)
  })

  it('offers nothing for MetaMask, which is no longer a choice here', () => {
    // The four wallets are Rabby, Internet Money, OKX and ZKX. A matcher that
    // still answered for MetaMask would let it back in through the connect
    // flow without ever appearing in the list.
    expect(matchesWallet(conn('metaMask', 'MetaMask'), 'metamask')).toBe(false)
    expect(matchesWallet(conn('metaMaskSDK', 'MetaMask'), 'metamask')).toBe(false)
  })

  it('matches WalletConnect, which a case-sensitive comparison never did', () => {
    // The id is lower-cased before comparison, so testing it against
    // 'walletConnect' was dead code and the name check carried it alone.
    expect(matchesWallet(conn('walletConnect', 'WalletConnect'), 'walletconnect')).toBe(true)
  })

  it('claims nothing for an unknown wallet or a connector with no identity', () => {
    expect(matchesWallet(conn('okxWallet', 'OKX Wallet'), 'nonesuch')).toBe(false)
    expect(matchesWallet({}, 'okx')).toBe(false)
    expect(matchesWallet(null, 'okx')).toBe(false)
  })
})

describe('detectWallet', () => {
  it('finds OKX on its own namespace', () => {
    expect(detectWallet('okx', { okxwallet: {} })).toBe(true)
  })

  it('finds OKX on the shared object, in either spelling', () => {
    // The extension and OKX's own docs disagree about the casing.
    expect(detectWallet('okx', { ethereum: { isOKXWallet: true } })).toBe(true)
    expect(detectWallet('okx', { ethereum: { isOkxWallet: true } })).toBe(true)
  })

  it('finds a wallet that lost the race for window.ethereum', () => {
    /*
     * The case that matters on a real machine. With two extensions installed
     * only one owns window.ethereum; checking that alone would report the other
     * as missing and offer a download for something already installed.
     */
    const win = { ethereum: { isMetaMask: true }, okxwallet: {}, rabby: {} }
    expect(detectWallet('okx', win)).toBe(true)
    expect(detectWallet('rabby', win)).toBe(true)
  })

  it('never reports MetaMask as present, since it is not offered', () => {
    expect(detectWallet('metamask', { ethereum: { isMetaMask: true } })).toBe(false)
  })

  it('reports nothing on a page with no wallet at all', () => {
    // Every phone browser. The modal shows the handoff links instead.
    for (const id of ['okx', 'rabby', 'internetmoney', 'zkxwallet']) {
      expect(detectWallet(id, {}), id).toBe(false)
      expect(detectWallet(id, undefined), id).toBe(false)
    }
  })
})

describe('walletHandoffLink', () => {
  it('encodes the OKX link twice, because it is nested twice', () => {
    const link = walletHandoffLink('okx-app', HREF)
    const deeplink = decodeURIComponent(new URL(link).searchParams.get('deeplink'))

    expect(deeplink.startsWith('okx://wallet/dapp/url?dappUrl=')).toBe(true)
    // The page URL survives intact, query string and all.
    expect(decodeURIComponent(deeplink.split('dappUrl=')[1])).toBe(HREF)
  })

  it('does not let the page query string terminate the OKX link', () => {
    /*
     * The failure a single encoding produces: the outer parser stops at the
     * first bare & and the wallet opens on its home screen. A raw separator
     * anywhere after the scheme means that has happened.
     */
    const link = walletHandoffLink('okx-app', HREF)
    expect(link.split('?deeplink=')[1]).not.toContain('&')
  })

  it('offers no handoff for a wallet this app does not list', () => {
    // Trust and Coinbase were dropped with MetaMask: the four wallets are
    // Rabby, Internet Money, OKX and ZKX, and a link to anything else invites
    // a connection nobody wanted.
    expect(walletHandoffLink('trust-app', HREF)).toBeNull()
    expect(walletHandoffLink('coinbase-app', HREF)).toBeNull()
  })

  it('returns nothing rather than a broken link', () => {
    expect(walletHandoffLink('okx-app', '')).toBeNull()
    expect(walletHandoffLink('okx-app', 'not a url')).toBeNull()
    expect(walletHandoffLink('nonesuch', HREF)).toBeNull()
  })

  it('no longer offers a MetaMask handoff', () => {
    expect(walletHandoffLink('metamask-app', HREF)).toBeNull()
  })

  it('leaves OKX as the only wallet with a mobile handoff', () => {
    // Worth stating plainly: of the four, OKX is the only one publishing a
    // link format, so it is the only one a phone can reach without
    // WalletConnect configured.
    const offered = ['rabby', 'internetmoney', 'okx-app', 'zkxwallet', 'trust-app', 'coinbase-app']
      .filter((id) => walletHandoffLink(id, HREF) !== null)
    expect(offered).toEqual(['okx-app'])
  })
})

describe('providerIsWallet', () => {
  it('accepts a provider that is the wallet asked for', () => {
    expect(providerIsWallet({ isRabby: true }, 'rabby')).toBe(true)
    expect(providerIsWallet({ isInternetMoney: true }, 'internetmoney')).toBe(true)
    expect(providerIsWallet({ isZKX: true }, 'zkxwallet')).toBe(true)
    expect(providerIsWallet({ isOKXWallet: true }, 'okx')).toBe(true)
    expect(providerIsWallet({ isOkxWallet: true }, 'okx')).toBe(true)
  })

  it('refuses a provider belonging to a different wallet', () => {
    /*
     * The reason this exists. The connect flow can fall back to whatever owns
     * window.ethereum, and unchecked that means pressing "Rabby" hands back an
     * account from whichever extension won the race - now including wallets
     * that are no longer offered at all.
     */
    expect(providerIsWallet({ isMetaMask: true }, 'rabby')).toBe(false)
    expect(providerIsWallet({ isRabby: true }, 'okx')).toBe(false)
    expect(providerIsWallet({ isZKX: true }, 'okx')).toBe(false)
  })

  it('refuses a provider with nothing to identify it', () => {
    expect(providerIsWallet({}, 'rabby')).toBe(false)
    expect(providerIsWallet(null, 'rabby')).toBe(false)
    expect(providerIsWallet({ isMetaMask: true }, 'metamask')).toBe(false)
  })
})
