/**
 * Which wallet is which.
 *
 * Three questions the connect modal has to answer, pulled out of it because
 * the modal is a component and this project cannot render one in a test. All
 * three are easy to get quietly wrong: a matcher that catches the wrong wallet
 * hands a connection request to the wrong extension, a detector that misses
 * offers a download link to somebody who already has it installed, and a
 * deep link with one encoding too few opens the wallet on its home screen
 * instead of this page.
 */

/**
 * Does this wagmi connector represent the wallet we mean?
 *
 * More than one can: the connector configured in `config/wagmi.js`, plus
 * whatever the wallet announces over EIP-6963. The caller tries each in turn
 * and keeps the first whose provider actually resolves, because with several
 * extensions installed only one of them owns `window.ethereum`.
 */
export function matchesWallet(connector, walletId) {
  const id = (connector?.id ?? '').toLowerCase()
  const name = (connector?.name ?? '').toLowerCase()
  const has = (needle) => id.includes(needle) || name.includes(needle)

  switch (walletId) {
    case 'walletconnect':
      // Both sides lower case. Comparing against the mixed-case connector id
      // here could never be true, and the name check was carrying it alone.
      return id === 'walletconnect' || name.includes('walletconnect')
    case 'rabby':
      return has('rabby')
    case 'internetmoney':
      return has('internet')
    case 'zkxwallet':
      return has('zkx')
    case 'okx':
      // "okx" and "zkx" differ by one character, so neither may be matched
      // loosely enough to catch the other.
      return has('okx')
    default:
      return false
  }
}

/**
 * Is the wallet actually present on this page?
 *
 * `win` is a parameter so this can be asked of a fabricated window. Each wallet
 * is checked on its own namespace first and only then on the shared
 * `window.ethereum`, because that object belongs to whichever extension claimed
 * it - on a machine with two installed, the loser is still there under its own
 * name and would otherwise look absent.
 */
export function detectWallet(walletId, win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return false
  const eth = win.ethereum

  switch (walletId) {
    case 'rabby':
      return Boolean(win.rabby || eth?.isRabby)
    case 'internetmoney':
      return Boolean(win.internetmoney || eth?.isInternetMoney)
    case 'zkxwallet':
      return Boolean(win.zkx || eth?.isZKX)
    case 'okx':
      // Both spellings: the extension and OKX's own documentation disagree.
      return Boolean(win.okxwallet || eth?.isOKXWallet || eth?.isOkxWallet)
    default:
      return false
  }
}

/**
 * A link that opens this page inside a wallet's own browser.
 *
 * The last resort on a phone, and the only route needing nothing installed and
 * no account of ours: the wallet app opens the URL in its in-app browser, where
 * a provider does exist and the ordinary injected connector works.
 *
 * Every format below is the wallet's own documented one.
 */
export function walletHandoffLink(walletId, href) {
  if (!href) return null

  /*
   * Parsed only to reject what is not a URL. Every link below embeds the
   * address whole, so a malformed one would be handed to a wallet as-is and
   * fail somewhere the user cannot see. The result is deliberately unused -
   * MetaMask was the one format that needed the parts, and it is gone.
   */
  try {
    void new URL(href)
  } catch {
    return null
  }

  switch (walletId) {
    case 'trust-app':
      return `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(href)}`
    case 'okx-app':
      /*
       * Encoded twice, and both are load-bearing. The inner call protects the
       * page URL as a parameter of the okx:// link; the outer protects that
       * whole link as a parameter of the https one. Drop either and the address
       * is truncated at its first query separator, and the wallet opens on its
       * home screen having lost where it was going.
       */
      return `https://web3.okx.com/download?deeplink=${encodeURIComponent(
        `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(href)}`,
      )}`
    case 'coinbase-app':
      return `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(href)}`
    default:
      return null
  }
}

/**
 * Is this provider really the wallet that was asked for?
 *
 * The connect flow has a last-resort branch that falls back to whatever owns
 * `window.ethereum`. Without this check that branch connects whichever
 * extension happens to hold it - so pressing "Rabby" on a machine where
 * another wallet won that race silently connects the other wallet, and the
 * account that appears is not the one anybody chose.
 *
 * Only the wallets this app offers can answer yes. Anything else is refused,
 * which sends the user to that wallet's own download page instead.
 */
export function providerIsWallet(provider, walletId) {
  if (!provider) return false

  switch (walletId) {
    case 'rabby':
      return Boolean(provider.isRabby)
    case 'internetmoney':
      return Boolean(provider.isInternetMoney)
    case 'zkxwallet':
      return Boolean(provider.isZKX)
    case 'okx':
      return Boolean(provider.isOKXWallet || provider.isOkxWallet)
    default:
      return false
  }
}
