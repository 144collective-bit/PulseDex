import { describe, it, expect } from 'vitest'
import { matchesWallet, detectWallet, walletHandoffLink } from './walletTargets'

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
    expect(matchesWallet(conn('rabby', 'Rabby Wallet'), 'metamask')).toBe(false)
    expect(matchesWallet(conn('metaMask', 'MetaMask'), 'rabby')).toBe(false)
    expect(matchesWallet(conn('okxWallet', 'OKX Wallet'), 'internetmoney')).toBe(false)
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
    expect(detectWallet('metamask', win)).toBe(true)
  })

  it('does not report MetaMask for a wallet wearing its flag', () => {
    // Several set isMetaMask for compatibility. Trusting it lists MetaMask as
    // installed on machines that have never had it.
    expect(detectWallet('metamask', { ethereum: { isMetaMask: true, isRabby: true } })).toBe(false)
    expect(detectWallet('metamask', { ethereum: { isMetaMask: true, isOKXWallet: true } })).toBe(
      false,
    )
  })

  it('reports nothing on a page with no wallet at all', () => {
    // Every phone browser. The modal shows the handoff links instead.
    for (const id of ['okx', 'rabby', 'internetmoney', 'metamask', 'zkxwallet']) {
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

  it('hands MetaMask an address with the scheme stripped, as it expects', () => {
    expect(walletHandoffLink('metamask-app', HREF)).toBe('https://metamask.app.link/dapp/pulsedex.net/')
  })

  it('encodes the whole address for Trust and Coinbase', () => {
    expect(walletHandoffLink('trust-app', HREF)).toContain(encodeURIComponent(HREF))
    expect(walletHandoffLink('coinbase-app', HREF)).toContain(encodeURIComponent(HREF))
  })

  it('returns nothing rather than a broken link', () => {
    expect(walletHandoffLink('okx-app', '')).toBeNull()
    expect(walletHandoffLink('okx-app', 'not a url')).toBeNull()
    expect(walletHandoffLink('nonesuch', HREF)).toBeNull()
  })
})
