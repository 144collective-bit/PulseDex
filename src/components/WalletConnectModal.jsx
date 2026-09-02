import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import {
  X,
  ShieldCheck,
  ExternalLink,
  Check,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Zap,
  Lock,
} from 'lucide-react'
import { pulsechain } from '../config/pulsechain'
import { hasWalletConnect } from '../config/wagmi'
import { useEscapeKey } from '../hooks/useEscapeKey'
import {
  matchesWallet,
  detectWallet,
  walletHandoffLink,
  providerIsWallet,
} from '../utils/walletTargets'

// Curated supported wallet definitions with detection checks, official download links & SVGs
const SUPPORTED_WALLETS = [
  {
    id: 'rabby',
    name: 'Rabby Wallet',
    badge: 'Popular on PulseChain',
    badgeColor: 'blue',
    desc: 'Game-changing DeFi wallet with built-in multi-chain routing & security audit checks.',
    downloadUrl: 'https://rabby.io',
    detect: () => detectWallet('rabby'),
    icon: (
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill="#8697FF" fillOpacity="0.15" />
        <path
          d="M20 9C13.925 9 9 13.925 9 20C9 26.075 13.925 31 20 31C26.075 31 31 26.075 31 20C31 13.925 26.075 9 20 9ZM20 28.5C15.305 28.5 11.5 24.695 11.5 20C11.5 15.305 15.305 11.5 20 11.5C24.695 11.5 28.5 15.305 28.5 20C28.5 24.695 24.695 28.5 20 28.5Z"
          fill="#8697FF"
        />
        <path
          d="M24.2 16.8C23.6 15.7 22.4 15 21 15H17V25H19.5V21.5H21C22.4 21.5 23.6 20.8 24.2 19.7C24.5 19.2 24.7 18.6 24.7 18C24.7 17.4 24.5 16.8 24.2 16.8ZM21 19.5H19.5V17H21C21.6 17 22.2 17.4 22.2 18.25C22.2 19.1 21.6 19.5 21 19.5Z"
          fill="#FFFFFF"
        />
      </svg>
    ),
  },
  {
    id: 'internetMoney',
    name: 'Internet Money Wallet',
    badge: 'PulseChain Native',
    badgeColor: 'green',
    desc: 'Built specifically for PulseChain by the community. Native multi-chain DEX swaps and accounts.',
    downloadUrl: 'https://internetmoney.io',
    detect: () => detectWallet('internetmoney'),
    icon: (
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill="#00FF9D" fillOpacity="0.15" />
        <circle cx="20" cy="20" r="12" stroke="#00FF9D" strokeWidth="2" />
        <path
          d="M16 14H24M20 14V26M16 26H24M16 18H22M16 22H22"
          stroke="#00FF9D"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'okx',
    name: 'OKX Wallet',
    badge: 'Multi-chain',
    badgeColor: 'blue',
    desc: 'Exchange-backed wallet with its own in-app browser on phones.',
    downloadUrl: 'https://web3.okx.com/download',
    detect: () => detectWallet('okx'),
    icon: (
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill="#FFFFFF" fillOpacity="0.08" />
        <g fill="#FFFFFF">
          <rect x="9" y="9" width="6.5" height="6.5" rx="1" />
          <rect x="24.5" y="9" width="6.5" height="6.5" rx="1" />
          <rect x="16.75" y="16.75" width="6.5" height="6.5" rx="1" />
          <rect x="9" y="24.5" width="6.5" height="6.5" rx="1" />
          <rect x="24.5" y="24.5" width="6.5" height="6.5" rx="1" />
        </g>
      </svg>
    ),
  },
  {
    id: 'zkxwallet',
    name: 'ZKX Wallet',
    badge: 'Account Abstraction',
    badgeColor: 'purple',
    desc: 'Next-generation Web3 smart account wallet with native PulseChain support.',
    downloadUrl: 'https://zkxwallet.com',
    detect: () => detectWallet('zkxwallet'),
    icon: (
      <div className="zkx-logo-img-wrapper">
        <img
          src="/apps/zkxwallet.png"
          alt="ZKX Wallet"
          width="28"
          height="28"
          style={{ borderRadius: '8px', objectFit: 'contain' }}
          onError={(e) => {
            e.target.style.display = 'none'
          }}
        />
      </div>
    ),
  },
]

/**
 * Is this a phone or tablet browser rather than a desktop one?
 *
 * Asked because the entire wallet list above is browser extensions, and a
 * phone browser cannot run any of them. Coarse pointer plus a narrow viewport
 * catches touch laptops correctly (they are desktops and keep the desktop
 * list) and does not depend on parsing a user agent string.
 */
function isMobileBrowser() {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches
  return Boolean(coarse) && window.innerWidth < 1024
}

/** Has some wallet already put a provider on the page? */
function hasInjectedProvider() {
  return typeof window !== 'undefined' && Boolean(window.ethereum)
}

/**
 * Wallets that can open this page inside their own browser.
 *
 * The last resort, and the only one that needs nothing installed and no
 * account of ours: a universal link that hands the current URL to the wallet
 * app, which opens it in its in-app browser - where a provider does exist and
 * the ordinary injected connector works. Every one of these is the wallet's
 * own documented link format.
 */
const MOBILE_HANDOFF = [
  {
    id: 'trust-app',
    name: 'Trust Wallet',
    desc: 'Opens this page inside Trust Wallet.',
    link: () => walletHandoffLink('trust-app', window.location.href),
  },
  {
    id: 'okx-app',
    name: 'OKX Wallet',
    desc: 'Opens this page inside the OKX app.',
    /*
     * Two encodings, and both are needed. The inner one protects the page URL
     * as a parameter of the okx:// link; the outer protects that whole link as
     * a parameter of the https one. Skipping either truncates the address at
     * its first query separator and the wallet opens on its home screen.
     */
    link: () => walletHandoffLink('okx-app', window.location.href),
  },
  {
    id: 'coinbase-app',
    name: 'Coinbase Wallet',
    desc: 'Opens this page inside Coinbase Wallet.',
    link: () => walletHandoffLink('coinbase-app', window.location.href),
  },
]

export default function WalletConnectModal({ isOpen, onClose }) {
  useEscapeKey(isOpen, onClose)

  const { address, isConnected } = useAccount()
  const { connectors, connect, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const [connectingWalletId, setConnectingWalletId] = useState(null)
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [connectError, setConnectError] = useState('')

  /*
   * Measured on open rather than at module load, so a rotated tablet or a
   * resized window is judged as it is now.
   */
  const [isMobile, setIsMobile] = useState(false)
  const [injectedPresent, setInjectedPresent] = useState(true)

  // Reset states when opened
  useEffect(() => {
    if (isOpen) {
      setConnectError('')
      setConnectingWalletId(null)
      setIsMobile(isMobileBrowser())
      setInjectedPresent(hasInjectedProvider())
    }
  }, [isOpen])

  // Clear pending state when connected or errored
  useEffect(() => {
    if (isConnected) {
      setConnectingWalletId(null)
      onClose()
    }
    if (error) {
      setConnectError(error.message || 'Connection request rejected or failed.')
      setConnectingWalletId(null)
    }
  }, [isConnected, error, onClose])

  if (!isOpen) return null

  const handleConnect = async (walletDef) => {
    setConnectError('')
    setConnectingWalletId(walletDef.id)

    try {
      // Several connectors can match the same wallet name: our manually
      // configured one (from src/config/wagmi.js) plus any EIP-6963
      // auto-discovered connector for that same wallet. With more than one
      // wallet extension installed, only one can own `window.ethereum` at a
      // time, so the manual connector's provider can resolve to nothing even
      // though the wallet is genuinely installed. Try every match in order
      // and use the first one whose provider actually resolves.
      const candidates = connectors.filter((c) => matchesWallet(c, walletDef.id.toLowerCase()))

      let connector = null
      for (const candidate of candidates) {
        const provider = await candidate.getProvider().catch(() => undefined)
        if (provider) {
          connector = candidate
          break
        }
      }

      /*
       * Last resort: the bare `window.ethereum`, but only when it really is the
       * wallet that was asked for.
       *
       * Whichever extension won that object answers here, so connecting to it
       * unchecked means pressing "Rabby" can hand back an account from another
       * wallet entirely - and since MetaMask is no longer offered, it would be
       * connecting something the user was never shown. Refusing sends them to
       * their wallet's own download page instead, which is the honest outcome.
       */
      if (!connector) {
        const generic = connectors.find((c) => c.id === 'injected' || c.type === 'injected')
        const provider = generic ? await generic.getProvider().catch(() => undefined) : undefined
        if (provider && providerIsWallet(provider, walletDef.id.toLowerCase())) connector = generic
      }

      if (connector) {
        await connect({ connector })
      } else {
        window.open(walletDef.downloadUrl, '_blank')
        setConnectingWalletId(null)
      }
    } catch (err) {
      console.error('Wallet connection error:', err)
      setConnectError(err?.message || 'Failed to establish connection. Please check your wallet extension.')
      setConnectingWalletId(null)
    }
  }

  /**
   * Connect through a named connector rather than by sniffing the window.
   *
   * The mobile routes have no injected provider to find - that is the whole
   * reason they exist - so the detection dance above does not apply to them.
   */
  const connectVia = async (connectorId, label) => {
    setConnectError('')
    setConnectingWalletId(connectorId)
    try {
      const connector = connectors.find((c) => c.id === connectorId)
      if (!connector) {
        setConnectError(`${label} is not available on this deployment.`)
        setConnectingWalletId(null)
        return
      }
      await connect({ connector })
    } catch (err) {
      console.error('Wallet connection error:', err)
      setConnectError(err?.shortMessage || err?.message || `Could not reach ${label}.`)
      setConnectingWalletId(null)
    }
  }

  const copyAddress = () => {
    if (!address) return
    navigator.clipboard.writeText(address)
    setCopiedAddr(true)
    setTimeout(() => setCopiedAddr(false), 2000)
  }

  const isWrongChain = isConnected && chainId !== pulsechain.id

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="wallet-modal-card glass-panel font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="wallet-modal-header">
          <div className="wallet-modal-title-box">
            <div className="wallet-modal-icon-shield">
              <ShieldCheck size={20} className="text-pulse-green" />
            </div>
            <div>
              <h2 className="wallet-modal-title">
                {isConnected ? 'Wallet Connected' : 'Connect PulseChain Wallet'}
              </h2>
              <span className="wallet-modal-sub">
                {isConnected ? 'PulseChain Mainnet (369)' : 'Select your verified Web3 provider'}
              </span>
            </div>
          </div>
          <button className="wallet-modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Wrong Chain Alert */}
        {isWrongChain && (
          <div className="wallet-chain-warning">
            <div className="warning-text-group">
              <AlertCircle size={16} className="text-pulse-yellow" />
              <span>You are connected to the wrong network.</span>
            </div>
            <button
              className="btn-switch-chain"
              onClick={() => switchChain({ chainId: pulsechain.id })}
            >
              Switch to PulseChain (369)
            </button>
          </div>
        )}

        {/* Connected Wallet Profile View */}
        {isConnected ? (
          <div className="wallet-connected-body">
            <div className="wallet-profile-chip">
              <div className="wallet-pulse-avatar">
                <span className="avatar-letter">{address?.slice(2, 4).toUpperCase()}</span>
                <span className="avatar-live-dot"></span>
              </div>
              <div className="wallet-profile-info">
                <div className="wallet-profile-addr-row">
                  <span className="wallet-full-addr">
                    {address?.slice(0, 8)}...{address?.slice(-6)}
                  </span>
                  <button className="btn-copy-addr" onClick={copyAddress} title="Copy Address">
                    {copiedAddr ? (
                      <Check size={13} className="text-pulse-green" />
                    ) : (
                      <span className="copy-label">Copy</span>
                    )}
                  </button>
                </div>
                <div className="wallet-chain-status text-pulse-green">
                  <span>● PulseChain Mainnet (Chain ID 369)</span>
                </div>
              </div>
            </div>

            <div className="wallet-modal-actions-row">
              <a
                href={`https://scan.pulsechain.com/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="wallet-action-link"
              >
                <span>View on PulseScan</span>
                <ExternalLink size={13} />
              </a>

              <button
                className="wallet-disconnect-cta"
                onClick={() => {
                  disconnect()
                  onClose()
                }}
              >
                Disconnect Wallet
              </button>
            </div>
          </div>
        ) : (
          /* Wallet Selector List */
          <div className="wallet-connect-body">
            {connectError && (
              <div className="wallet-error-banner">
                <AlertCircle size={14} />
                <span>{connectError}</span>
              </div>
            )}

            {/*
              On a phone the extension list below is unreachable by definition,
              so it is replaced rather than added to. Offering "Get Rabby" on a
              phone is offering a browser add-on to a browser that has none.
            */}
            {isMobile && !injectedPresent ? (
              <div className="wallet-options-list">

                {hasWalletConnect && (
                  <button
                    type="button"
                    className={`wallet-option-item ${connectingWalletId === 'walletConnect' ? 'is-connecting' : ''}`}
                    onClick={() => connectVia('walletConnect', 'WalletConnect')}
                    disabled={connectingWalletId === 'walletConnect'}
                  >
                    <div className="wallet-option-left">
                      <div className="wallet-option-icon">
                        <Zap size={22} className="text-pulse-cyan" />
                      </div>
                      <div className="wallet-option-meta">
                        <div className="wallet-option-name-row">
                          <span className="wallet-option-name">Any other wallet</span>
                          <span className="wallet-badge badge-blue">WalletConnect</span>
                        </div>
                        <span className="wallet-option-desc">
                          Rabby, Internet Money, Trust, Rainbow and most other mobile wallets.
                        </span>
                      </div>
                    </div>
                    <div className="wallet-option-right">
                      {connectingWalletId === 'walletConnect' ? (
                        <div className="wallet-spin-loader"></div>
                      ) : (
                        <span className="wallet-connect-cta-btn">Connect</span>
                      )}
                    </div>
                  </button>
                )}

                <p className="wallet-handoff-label">Or open this page in your wallet</p>

                {MOBILE_HANDOFF.map((w) => (
                  <a
                    key={w.id}
                    className="wallet-option-item"
                    href={w.link()}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="wallet-option-left">
                      <div className="wallet-option-meta">
                        <div className="wallet-option-name-row">
                          <span className="wallet-option-name">{w.name}</span>
                        </div>
                        <span className="wallet-option-desc">{w.desc}</span>
                      </div>
                    </div>
                    <div className="wallet-option-right">
                      <div className="wallet-install-link">
                        <span>Open</span>
                        <ExternalLink size={13} />
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
            <div className="wallet-options-list">
              {SUPPORTED_WALLETS.map((w) => {
                // `w.detect()` only sees whichever wallet currently owns
                // `window.ethereum`. Also trust EIP-6963 auto-discovered
                // connectors (their id is the wallet's dotted rdns, e.g.
                // "io.rabby") since their presence in `connectors` means that
                // wallet genuinely announced itself, regardless of which
                // extension is dominant.
                const isDetected =
                  w.detect() ||
                  connectors.some((c) => c.id?.includes('.') && matchesWallet(c, w.id.toLowerCase()))
                const isThisConnecting = isPending && connectingWalletId === w.id

                return (
                  /* A real button, not a clickable div. Connecting a wallet is
                     the primary action of the app; as a div it could not be
                     reached by Tab, took no focus ring, and was not announced
                     as actionable by a screen reader. */
                  <button
                    key={w.id}
                    type="button"
                    className={`wallet-option-item ${isThisConnecting ? 'is-connecting' : ''}`}
                    onClick={() => handleConnect(w)}
                    disabled={isThisConnecting}
                    aria-label={
                      isDetected ? `Connect ${w.name}` : `Install ${w.name}`
                    }
                  >
                    <div className="wallet-option-left">
                      <div className="wallet-option-icon">{w.icon}</div>
                      <div className="wallet-option-meta">
                        <div className="wallet-option-name-row">
                          <span className="wallet-option-name">{w.name}</span>
                          {w.badge && (
                            <span className={`wallet-badge badge-${w.badgeColor}`}>
                              {w.badge}
                            </span>
                          )}
                          {isDetected && (
                            <span className="wallet-detected-pill">Detected</span>
                          )}
                        </div>
                        <span className="wallet-option-desc">{w.desc}</span>
                      </div>
                    </div>

                    <div className="wallet-option-right">
                      {isThisConnecting ? (
                        <div className="wallet-spin-loader"></div>
                      ) : isDetected ? (
                        <span className="wallet-connect-cta-btn">Connect</span>
                      ) : (
                        <div className="wallet-install-link" title="Open official download site">
                          <span>Get</span>
                          <ArrowRight size={13} />
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            )}

            {/* Security Guarantee Footnote */}
            <div className="wallet-security-footnote">
              <Lock size={13} className="text-pulse-cyan" />
              <span>
                Read-only connection for portfolio & swaps. We never request private keys or seed phrases.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
