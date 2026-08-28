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

// Curated supported wallet definitions with detection checks, official download links & SVGs
const SUPPORTED_WALLETS = [
  {
    id: 'rabby',
    name: 'Rabby Wallet',
    badge: 'Popular on PulseChain',
    badgeColor: 'blue',
    desc: 'Game-changing DeFi wallet with built-in multi-chain routing & security audit checks.',
    downloadUrl: 'https://rabby.io',
    detect: () =>
      typeof window !== 'undefined' &&
      Boolean(window.rabby || window.ethereum?.isRabby),
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
    id: 'metaMask',
    name: 'MetaMask',
    badge: 'Standard',
    badgeColor: 'amber',
    desc: 'The classic Web3 wallet extension and mobile app for PulseChain & EVM.',
    downloadUrl: 'https://metamask.io/download/',
    detect: () =>
      typeof window !== 'undefined' &&
      Boolean(window.ethereum?.isMetaMask && !window.ethereum?.isRabby && !window.ethereum?.isInternetMoney),
    icon: (
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="8" fill="#F6851B" fillOpacity="0.15" />
        <path
          d="M26.85 7.23L17.2 13.91L18.99 9.87L26.85 7.23ZM5.15 7.23L14.73 13.95L13.01 9.87L5.15 7.23ZM23.3 22.47L20.87 25.96L26.15 27.38L27.65 22.56L23.3 22.47ZM4.35 22.56L5.85 27.38L11.13 25.96L8.7 22.47L4.35 22.56ZM11.45 17.65L9.67 19.92L14.76 20.15L14.65 15.34L11.45 17.65ZM20.55 17.65L17.34 15.3L17.23 20.15L22.33 19.92L20.55 17.65ZM11.13 25.96L14.41 24.36L11.75 22.54L11.13 25.96ZM20.87 25.96L20.25 22.54L17.59 24.36L20.87 25.96Z"
          fill="#E2761B"
        />
        <path
          d="M17.59 24.36L20.25 22.54L20.55 17.65L17.23 20.15L17.59 24.36ZM11.75 22.54L14.41 24.36L14.76 20.15L11.45 17.65L11.75 22.54Z"
          fill="#E4761B"
        />
        <path
          d="M14.41 24.36L11.13 25.96L14.9 28.5L14.86 26.23L14.41 24.36ZM17.59 24.36L17.14 26.23L17.1 28.5L20.87 25.96L17.59 24.36Z"
          fill="#D7C1B3"
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
    detect: () =>
      typeof window !== 'undefined' &&
      Boolean(window.internetmoney || window.ethereum?.isInternetMoney),
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
    id: 'zkxwallet',
    name: 'ZKX Wallet',
    badge: 'Account Abstraction',
    badgeColor: 'purple',
    desc: 'Next-generation Web3 smart account wallet with native PulseChain support.',
    downloadUrl: 'https://zkxwallet.com',
    detect: () =>
      typeof window !== 'undefined' &&
      Boolean(window.zkx || window.ethereum?.isZKX),
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

// Matches a wagmi connector (manually configured or EIP-6963 auto-discovered)
// against one of our curated wallet definitions by id/name substring.
function matchesWallet(connector, walletId) {
  const id = connector.id?.toLowerCase() || ''
  const name = connector.name?.toLowerCase() || ''

  if (walletId === 'metamask') return id.includes('metamask') || name.includes('metamask')
  if (walletId === 'rabby') return id.includes('rabby') || name.includes('rabby')
  if (walletId === 'internetmoney') return id.includes('internet') || name.includes('internet')
  if (walletId === 'zkxwallet') return id.includes('zkx') || name.includes('zkx')
  return false
}

export default function WalletConnectModal({ isOpen, onClose }) {
  const { address, isConnected } = useAccount()
  const { connectors, connect, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const [connectingWalletId, setConnectingWalletId] = useState(null)
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [connectError, setConnectError] = useState('')

  // Reset states when opened
  useEffect(() => {
    if (isOpen) {
      setConnectError('')
      setConnectingWalletId(null)
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

      // Fallback to the generic injected connector (bare `window.ethereum`)
      if (!connector) {
        const generic = connectors.find((c) => c.id === 'injected' || c.type === 'injected')
        const provider = generic ? await generic.getProvider().catch(() => undefined) : undefined
        if (provider) connector = generic
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
                  <div
                    key={w.id}
                    className={`wallet-option-item ${isThisConnecting ? 'is-connecting' : ''}`}
                    onClick={() => handleConnect(w)}
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
                        <button className="wallet-connect-cta-btn">Connect</button>
                      ) : (
                        <div className="wallet-install-link" title="Open official download site">
                          <span>Get</span>
                          <ArrowRight size={13} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

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
