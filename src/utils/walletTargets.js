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

/** The wallets this app lists by name, so everything else can be found. */
export const CURATED_WALLET_IDS = ['rabby', 'internetmoney', 'zkxwallet', 'okx']

/**
 * Every wallet on this page that the curated list does not name.
 *
 * The modal offered four wallets and a download link for each one it could not
 * find. On a desktop with an extension that is a reasonable thing to do. Inside
 * a wallet's own in-app browser - which is how most people reach a site like
 * this from a phone - it was a dead end: MetaMask, Trust, Coinbase, Rainbow and
 * the rest all inject a perfectly good provider, none of them is one of the
 * four, so the page detected nothing and offered to install browser extensions
 * to a browser that cannot have any. There was no way to connect, from inside a
 * wallet.
 *
 * EIP-6963 is what fixes it. A wallet that announces itself appears in wagmi's
 * connector list under its own reverse-DNS id, which is both proof it is really
 * there and a name and icon to show. Anything announcing itself is offered,
 * whether or not this app has heard of it.
 *
 * `hasInjected` covers the older wallets that set `window.ethereum` and never
 * announce. That one is offered only when nothing announced, because otherwise
 * it is the same wallet a second time under a duller name.
 */
export function otherInjectedWallets(connectors = [], { hasInjected = false } = {}) {
  const isCurated = (c) => CURATED_WALLET_IDS.some((id) => matchesWallet(c, id))

  // A dotted id is a reverse-DNS one, which only EIP-6963 discovery produces.
  const announced = connectors.filter(
    (c) => typeof c?.id === 'string' && c.id.includes('.') && !isCurated(c)
  )

  const seen = new Set()
  const out = []
  for (const c of announced) {
    const key = (c.name || c.id).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: c.id, name: c.name || 'Browser wallet', icon: c.icon || null })
  }

  if (out.length === 0 && hasInjected) {
    const generic = connectors.find((c) => c?.id === 'injected' && !isCurated(c))
    if (generic) {
      out.push({
        id: generic.id,
        // Its own name is "Injected", which tells a reader nothing.
        name: generic.name && generic.name !== 'Injected' ? generic.name : 'Browser wallet',
        icon: null,
      })
    }
  }

  return out
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
   * Parsed to reject what is not a web address - and `new URL` alone does not
   * do that. `javascript:alert(1)` is a perfectly valid URL, so the old check
   * passed it through and the wallet was handed a link whose target was a
   * script, to open in its own browser.
   *
   * Not reachable from this app, which only ever passes `window.location.href`
   * - but this is an exported helper with no say in who calls it next, and the
   * cost of being sure is one comparison.
   */
  let parsed
  try {
    parsed = new URL(href)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

  switch (walletId) {
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
    /*
     * MetaMask, whose universal link takes the address as a path with the
     * scheme stripped and re-adds https itself. Back after having been removed
     * with its SDK: the SDK is what was dropped, and this is a plain link that
     * needs nothing installed and no account of ours.
     *
     * Rabby and ZKX are not here, and not because they were forgotten. Neither
     * publishes a format this could be written against, and a link invented
     * rather than documented opens the wallet on its own home screen - which
     * to the person holding the phone is indistinguishable from the app being
     * broken. Both speak WalletConnect, so both are reached that way instead.
     */
    case 'metamask-app': {
      // Scheme stripped: MetaMask takes host and path, and re-adds https.
      const bare = href.replace(/^https?:\/\//, '')
      return `https://metamask.app.link/dapp/${bare}`
    }

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
