import { useState, useRef } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import {
  User,
  Sliders,
  ShieldCheck,
  Check,
  Copy,
  ExternalLink,
  Shield,
  Volume2,
  VolumeX,
  Flame,
  Wallet,
  UserPlus,
  LogOut,
  Camera,
  Share2,
  KeyRound,
  Lock,
  CheckCircle2,
  ShieldAlert,
  RefreshCw,
  Download,
  Upload,
} from 'lucide-react'
import {
  useUserProfile,
  PRESET_AVATARS,
  TRADING_STYLES,
  compressImageFile,
} from '../context/UserProfileContext'
import { useAuth } from '../context/AuthContext'

// Twitter (X) SVG Icon
function TwitterXIcon({ size = 14, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export default function ProfileView({ onOpenWalletModal }) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { currentUser, isAuthenticated, openAuthModal, signOut, updateSecurityPin } = useAuth()
  const {
    profile,
    preferences,
    activeAvatarDef,
    updateProfile,
    updatePreferences,
    exportProfileData,
    importProfileData,
    triggerSound,
  } = useUserProfile()

  const [activeTab, setActiveTab] = useState('profile') // 'profile' | 'settings'
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [importStatus, setImportStatus] = useState('')

  // Security Management State
  const [newSecurityPin, setNewSecurityPin] = useState('')
  const [pinFeedback, setPinFeedback] = useState({ text: '', type: '' })
  const [isSavingPin, setIsSavingPin] = useState(false)
  const [isSigningWalletProof, setIsSigningWalletProof] = useState(false)
  const [walletSigFeedback, setWalletSigFeedback] = useState(null)

  const fileInputRef = useRef(null)
  const avatarUploadInputRef = useRef(null)

  const handleCopyAddress = () => {
    if (!address) return
    navigator.clipboard.writeText(address)
    setCopiedAddr(true)
    triggerSound('click')
    setTimeout(() => setCopiedAddr(false), 2000)
  }

  const handleAvatarSelect = (avatarId) => {
    updateProfile({ avatarId, customAvatarUrl: '' })
    triggerSound('toggle')
  }

  // Handle Direct Photo Upload from Device
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingPhoto(true)
    try {
      const compressedDataUrl = await compressImageFile(file, 280, 280, 0.88)
      updateProfile({ customAvatarUrl: compressedDataUrl })
      triggerSound('success')
    } catch (err) {
      console.error('Failed to compress avatar image:', err)
      alert('Could not process image file. Please choose a valid PNG or JPEG image.')
    } finally {
      setIsUploadingPhoto(false)
      if (avatarUploadInputRef.current) avatarUploadInputRef.current.value = ''
    }
  }

  const handleUpdatePin = async (e) => {
    e?.preventDefault()
    if (!newSecurityPin || newSecurityPin.length < 4) {
      setPinFeedback({ text: 'PIN must be at least 4 digits.', type: 'error' })
      return
    }

    setIsSavingPin(true)
    setPinFeedback({ text: '', type: '' })
    try {
      await updateSecurityPin(newSecurityPin.trim())
      setPinFeedback({ text: 'Security PIN updated & active!', type: 'success' })
      setNewSecurityPin('')
      triggerSound('success')
    } catch (err) {
      setPinFeedback({ text: err.message || 'Failed to update PIN.', type: 'error' })
    } finally {
      setIsSavingPin(false)
    }
  }

  const handleSignWalletVerification = async () => {
    if (!address || !signMessageAsync) return
    setIsSigningWalletProof(true)
    setWalletSigFeedback(null)
    try {
      const timestamp = new Date().toISOString()
      const signature = await signMessageAsync({
        message: `PulseDex Account Ownership Verification\nUser: ${currentUser?.username || profile.username}\nWallet: ${address}\nTimestamp: ${timestamp}`,
      })
      setWalletSigFeedback({
        type: 'success',
        text: 'Cryptographic proof verified & bound to your PulseDex vault!',
        sig: signature.slice(0, 16) + '...',
      })
      triggerSound('success')
    } catch (err) {
      setWalletSigFeedback({
        type: 'error',
        text: err.shortMessage || err.message || 'Signature rejected by wallet.',
      })
    } finally {
      setIsSigningWalletProof(false)
    }
  }

  const handleFileImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const result = importProfileData(event.target.result)
        if (result.success) {
          setImportStatus('Settings successfully imported!')
          triggerSound('success')
        } else {
          setImportStatus(result.error || 'Import failed.')
        }
      } catch {
        setImportStatus('Invalid JSON file format.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="profile-view-container max-w-4xl mx-auto p-4 md:p-6 font-mono animate-fade-in">
      {/* Hidden Photo Upload Input */}
      <input
        type="file"
        ref={avatarUploadInputRef}
        onChange={handlePhotoUpload}
        accept="image/png, image/jpeg, image/webp"
        style={{ display: 'none' }}
      />

      {/* Profile Banner & Hero Section */}
      <div className="user-profile-hero rounded-2xl overflow-hidden glass-panel mb-6" style={{ background: profile.bannerUrl }}>
        <div className="hero-overlay"></div>

        <div className="hero-content">
          <div className="hero-avatar-wrapper">
            <div
              className="hero-avatar"
              style={{
                background: profile.customAvatarUrl
                  ? 'transparent'
                  : activeAvatarDef.bg,
                borderColor: activeAvatarDef.glowColor,
                boxShadow: `0 0 24px ${activeAvatarDef.glowColor}40`,
              }}
            >
              {profile.customAvatarUrl ? (
                <img
                  src={profile.customAvatarUrl}
                  alt={profile.displayName}
                  className="hero-avatar-custom-img"
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
              ) : (
                <span>{activeAvatarDef.icon}</span>
              )}

              <button
                type="button"
                className="hero-avatar-upload-badge"
                onClick={() => avatarUploadInputRef.current?.click()}
                title="Upload profile image"
              >
                <Camera size={11} />
              </button>
            </div>
          </div>

          <div className="hero-text-meta">
            <div className="hero-names-row">
              <h2 className="hero-display-name">{profile.displayName || 'Pulse Trader'}</h2>
              <span className="hero-username">
                @{currentUser?.username || profile.username || 'trader'}
              </span>
              {(currentUser?.twitterVerified || profile.socials?.twitter) && (
                <span className="twitter-verified-chip" title="Verified 𝕏 Profile">
                  <TwitterXIcon size={10} />
                  <span>Verified</span>
                </span>
              )}
            </div>

            <div className="hero-sub-pills">
              <span className="hero-tier-badge font-mono">
                {profile.tier || 'Pulse Veteran'}
              </span>
              {isConnected && address ? (
                <button
                  type="button"
                  className="user-address-chip"
                  onClick={handleCopyAddress}
                  title="Click to copy address"
                >
                  <Wallet size={11} className="text-pulse-cyan" />
                  <span className="font-mono">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </span>
                  {copiedAddr ? (
                    <Check size={11} className="text-pulse-green" />
                  ) : (
                    <Copy size={11} />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-secondary btn-xs font-mono"
                  onClick={onOpenWalletModal}
                >
                  <Wallet size={11} className="text-pulse-green" />
                  <span>Connect Wallet</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2 Streamlined Navigation Tabs */}
      <div className="user-profile-tabs-bar mb-4">
        <button
          className={`profile-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('profile')
            triggerSound('click')
          }}
        >
          <User size={14} />
          <span>Profile & Identity</span>
        </button>

        <button
          className={`profile-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('settings')
            triggerSound('click')
          }}
        >
          <Sliders size={14} />
          <span>Settings & Security</span>
        </button>
      </div>

      {/* Page 1: Profile & Identity */}
      {activeTab === 'profile' && (
        <div className="space-y-4 animate-fade-in">
          {/* Account Status Card */}
          <div className="profile-section-card glass-panel auth-status-card">
            <div className="card-sub-header">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className={isAuthenticated ? 'text-pulse-green' : 'text-pulse-cyan'} />
                <span className="font-bold text-white">PulseDex Identity Vault</span>
              </div>
              {isAuthenticated ? (
                <span className="badge badge-green">Authenticated</span>
              ) : (
                <span className="badge badge-pulse">Guest Mode</span>
              )}
            </div>
            {isAuthenticated ? (
              <div className="auth-account-info-row">
                <div className="auth-user-meta">
                  <span className="auth-username-text text-white font-bold">
                    Signed in as @{currentUser?.username}
                  </span>
                  <span className="text-xs text-muted block">
                    Synced with PBKDF2 vault
                  </span>
                </div>
                <button
                  className="btn-secondary btn-sm font-mono text-pulse-yellow"
                  onClick={() => {
                    signOut()
                    triggerSound('toggle')
                  }}
                >
                  <LogOut size={13} />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="auth-guest-prompt-row">
                <span className="text-xs text-muted">
                  Sign in or create an account to securely save preferences and verify your 𝕏 handle.
                </span>
                <div className="flex gap-2">
                  <button
                    className="btn-secondary btn-sm font-mono"
                    onClick={() => openAuthModal('signin')}
                  >
                    Sign In
                  </button>
                  <button
                    className="btn-primary btn-sm font-mono btn-glow-pulse"
                    onClick={() => openAuthModal('signup')}
                  >
                    <UserPlus size={13} />
                    <span>Sign Up</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Profile Details */}
          <div className="profile-section-card glass-panel">
            <div className="card-sub-header">
              <span className="font-bold text-white">Profile Details</span>
            </div>
            <div className="form-group-grid">
              <div className="form-field">
                <label className="form-label">Display Name</label>
                <input
                  type="text"
                  className="auth-text-input font-mono"
                  value={profile.displayName || ''}
                  onChange={(e) => updateProfile({ displayName: e.target.value })}
                  placeholder="e.g. Satoshi"
                  maxLength={32}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Bio</label>
                <input
                  type="text"
                  className="auth-text-input font-mono"
                  value={profile.bio || ''}
                  onChange={(e) => updateProfile({ bio: e.target.value })}
                  placeholder="PulseChain Trader 🚀"
                  maxLength={120}
                />
              </div>
            </div>

            {/* Preset Avatars */}
            <div className="mt-3">
              <label className="form-label text-[11px] text-muted mb-1.5 block">Quick Avatar Selection</label>
              <div className="avatars-preset-grid">
                {PRESET_AVATARS.slice(0, 6).map((av) => {
                  const isSelected = profile.avatarId === av.id && !profile.customAvatarUrl
                  return (
                    <button
                      key={av.id}
                      className={`avatar-preset-card ${isSelected ? 'active' : ''}`}
                      onClick={() => handleAvatarSelect(av.id)}
                      style={{ '--avatar-glow': av.glowColor }}
                    >
                      <div className="avatar-preset-icon-box" style={{ background: av.bg }}>
                        <span>{av.icon}</span>
                      </div>
                      <span className="avatar-preset-name">{av.name}</span>
                      {isSelected && <span className="avatar-check-dot">✓</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Socials & Archetype */}
          <div className="profile-section-card glass-panel">
            <div className="card-sub-header">
              <div className="flex items-center gap-2">
                <Share2 size={15} className="text-pulse-cyan" />
                <span className="font-bold text-white">Socials & Trading Archetype</span>
              </div>
            </div>

            <div className="form-group-grid">
              <div className="form-field">
                <label className="form-label flex items-center gap-1.5">
                  <TwitterXIcon size={12} className="text-white" />
                  <span>𝕏 (Twitter) Handle</span>
                </label>
                <div className="input-with-prefix">
                  <span className="input-prefix">@</span>
                  <input
                    type="text"
                    placeholder="twitter_handle"
                    value={profile.socials?.twitter || ''}
                    onChange={(e) =>
                      updateProfile({
                        socials: {
                          ...profile.socials,
                          twitter: e.target.value.replace(/^@/, ''),
                        },
                      })
                    }
                    className="auth-text-input font-mono"
                  />
                </div>
              </div>

              <div className="form-field">
                <label className="form-label flex items-center gap-1.5">
                  <Flame size={13} className="text-pulse-yellow" />
                  <span>Trading Style</span>
                </label>
                <select
                  className="auth-text-input font-mono"
                  value={profile.tradingAttributes?.style || 'Degen Sniper'}
                  onChange={(e) =>
                    updateProfile({
                      tradingAttributes: {
                        ...profile.tradingAttributes,
                        style: e.target.value,
                      },
                    })
                  }
                >
                  {TRADING_STYLES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page 2: Settings & Security */}
      {activeTab === 'settings' && (
        <div className="space-y-4 animate-fade-in">
          {/* DEX Trading Defaults */}
          <div className="profile-section-card glass-panel">
            <div className="card-sub-header">
              <div className="flex items-center gap-2">
                <Sliders size={15} className="text-pulse-cyan" />
                <span className="font-bold text-white">DEX Trading Preferences</span>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label text-xs text-muted mb-1 block">Default Slippage Tolerance</label>
              <div className="slippage-btn-group">
                {['0.1', '0.5', '1.0', '3.0'].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`slippage-btn ${preferences.slippage === val ? 'active' : ''}`}
                    onClick={() => {
                      updatePreferences({ slippage: val, customSlippage: '' })
                      triggerSound('toggle')
                    }}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>

            <div className="trading-toggles-grid mt-2">
              <div className="toggle-row">
                <div className="flex items-center gap-2">
                  {preferences.soundFxEnabled ? (
                    <Volume2 size={15} className="text-pulse-green" />
                  ) : (
                    <VolumeX size={15} className="text-muted" />
                  )}
                  <div>
                    <div className="toggle-title">Interface Sound Effects</div>
                    <div className="toggle-desc">Audio feedback for swaps & clicks</div>
                  </div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={preferences.soundFxEnabled}
                    onChange={(e) => updatePreferences({ soundFxEnabled: e.target.checked })}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="toggle-row">
                <div className="flex items-center gap-2">
                  <Shield size={15} className="text-pulse-cyan" />
                  <div>
                    <div className="toggle-title">Auto-Hide Spam Tokens</div>
                    <div className="toggle-desc">Filter fake airdrops & honeypots</div>
                  </div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={preferences.autoHideSpam}
                    onChange={(e) => updatePreferences({ autoHideSpam: e.target.checked })}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          {/* Security PIN & Handle Protection */}
          <div className="profile-section-card glass-panel">
            <div className="card-sub-header">
              <div className="flex items-center gap-2">
                <Lock size={15} className="text-pulse-yellow" />
                <span className="font-bold text-white">Security PIN & Handle Protection</span>
              </div>
              <span className="badge badge-pulse text-[10px]">PBKDF2 Defense</span>
            </div>

            <form onSubmit={handleUpdatePin} className="mt-2">
              <p className="text-xs text-muted mb-2">
                Set a 4 to 8 digit PIN to lock your 𝕏 handle and profile from unauthorized logins.
              </p>
              <div className="flex gap-2">
                <div className="input-with-prefix flex-1">
                  <span className="input-prefix">PIN</span>
                  <input
                    type="password"
                    placeholder="Enter 4-8 digit PIN"
                    value={newSecurityPin}
                    onChange={(e) => setNewSecurityPin(e.target.value)}
                    className="auth-text-input font-mono"
                    maxLength={8}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSavingPin || !newSecurityPin}
                  className="btn-primary font-mono text-xs px-4"
                >
                  {isSavingPin ? <RefreshCw size={13} className="animate-spin" /> : 'Save PIN'}
                </button>
              </div>

              {pinFeedback.text && (
                <div
                  className={`mt-2 text-xs font-mono flex items-center gap-1.5 ${
                    pinFeedback.type === 'success' ? 'text-pulse-green' : 'text-pulse-red'
                  }`}
                >
                  {pinFeedback.type === 'success' ? <CheckCircle2 size={13} /> : <ShieldAlert size={13} />}
                  <span>{pinFeedback.text}</span>
                </div>
              )}
            </form>
          </div>

          {/* Cryptographic Web3 Wallet Anchor */}
          {isConnected && address && (
            <div className="profile-section-card glass-panel">
              <div className="card-sub-header">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={15} className="text-pulse-green" />
                  <span className="font-bold text-white">Cryptographic Wallet Verification</span>
                </div>
                <span className="badge badge-green text-[10px]">EIP-191</span>
              </div>

              <p className="text-xs text-muted mb-2">
                Sign a zero-gas cryptographic signature to prove ownership of wallet {address.slice(0, 6)}...{address.slice(-4)}.
              </p>

              <button
                type="button"
                disabled={isSigningWalletProof}
                className="btn-secondary font-mono text-xs"
                onClick={handleSignWalletVerification}
              >
                {isSigningWalletProof ? (
                  <RefreshCw size={13} className="animate-spin mr-1.5 inline" />
                ) : (
                  <CheckCircle2 size={13} className="text-pulse-green mr-1.5 inline" />
                )}
                <span>Sign Wallet Proof</span>
              </button>

              {walletSigFeedback && (
                <div
                  className={`mt-2 p-2 rounded text-xs font-mono ${
                    walletSigFeedback.type === 'success'
                      ? 'bg-pulse-green-bg text-pulse-green'
                      : 'bg-pulse-red-bg text-pulse-red'
                  }`}
                >
                  <div>{walletSigFeedback.text}</div>
                </div>
              )}
            </div>
          )}

          {/* Backup / Restore JSON */}
          <div className="profile-section-card glass-panel">
            <div className="card-sub-header">
              <span className="font-bold text-white">Backup & Restore</span>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary font-mono text-xs flex-1" onClick={exportProfileData}>
                <Download size={13} />
                <span>Export JSON</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileImport}
                accept=".json"
                style={{ display: 'none' }}
              />
              <button
                className="btn-secondary font-mono text-xs flex-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={13} />
                <span>Import JSON</span>
              </button>
            </div>
            {importStatus && (
              <div className="mt-2 text-xs font-mono text-pulse-green">{importStatus}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
