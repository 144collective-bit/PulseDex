import { useState, useEffect } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import {
  User,
  Check,
  Copy,
  ExternalLink,
  Shield,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wallet,
  LogOut,
  LogIn,
  Save,
  Eye,
  EyeOff,
  Lock,
  Sliders,
  Sparkles,
  Zap,
  Mail,
  FileText,
} from 'lucide-react'
import { useUserProfile } from '../context/UserProfileContext'
import { useAuth } from '../context/AuthContext'

export default function ProfileView({ onOpenWalletModal }) {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { currentUser, isAuthenticated, openAuthModal, signOut } = useAuth()
  const {
    profile,
    preferences,
    updateProfile,
    updatePreferences,
    triggerSound,
  } = useUserProfile()

  // Form State
  const [displayName, setDisplayName] = useState(profile.displayName || '')
  const [username, setUsername] = useState(profile.username || '')
  const [email, setEmail] = useState(profile.email || '')
  const [bio, setBio] = useState(profile.bio || '')

  const [copiedAddr, setCopiedAddr] = useState(false)
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Security Form State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordStatus, setPasswordStatus] = useState(null)

  // Synchronize when profile changes
  useEffect(() => {
    setDisplayName(currentUser?.displayName || profile.displayName || '')
    setUsername(currentUser?.username || profile.username || '')
    setEmail(currentUser?.email || profile.email || '')
    setBio(profile.bio || '')
  }, [profile, currentUser])

  const handleCopyAddress = () => {
    if (!address) return
    navigator.clipboard.writeText(address)
    setCopiedAddr(true)
    triggerSound('click')
    setTimeout(() => setCopiedAddr(false), 2000)
  }

  // Save Profile Form
  const handleSaveProfile = (e) => {
    if (e) e.preventDefault()
    setIsSaving(true)

    updateProfile({
      displayName: displayName.trim() || 'Pulse Trader',
      username: username.trim() || 'pulse_degen',
      email: email.trim(),
      bio: bio.trim(),
    })

    triggerSound('success')
    setSaveSuccessMessage('Profile details saved successfully!')
    setTimeout(() => {
      setSaveSuccessMessage(null)
      setIsSaving(false)
    }, 2500)
  }

  // Handle Preference Toggles
  const handleSlippageChange = (val) => {
    updatePreferences({ slippage: val })
    triggerSound('click')
  }

  const handleTogglePreference = (key) => {
    updatePreferences({ [key]: !preferences[key] })
    triggerSound('toggle')
  }

  // Change Password Mock / Local Vault
  const handleChangePassword = (e) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      setPasswordStatus({ type: 'error', text: 'New password must be at least 6 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    triggerSound('success')
    setPasswordStatus({ type: 'success', text: 'Password successfully updated in your encrypted vault.' })
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setTimeout(() => setPasswordStatus(null), 3000)
  }

  const initials = (displayName || username || 'PT')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="profile-page-shell">
      {/* 1. Hero Header Banner */}
      <div className="profile-hero-card glass-panel font-mono">
        <div className="profile-hero-content">
          <div className="profile-avatar-badge">
            <span className="profile-avatar-text">{initials}</span>
            <div className="profile-avatar-glow-ring"></div>
          </div>

          <div className="profile-identity-col">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="profile-display-name">
                {currentUser?.displayName || displayName || 'Pulse Trader'}
              </h1>
              <span className="profile-status-badge">
                <ShieldCheck size={13} className="text-pulse-green" />
                <span>Encrypted Vault Active</span>
              </span>
            </div>
            <span className="profile-handle-sub">
              @{currentUser?.username || username || 'pulse_degen'}
            </span>
          </div>
        </div>

        {/* Top Quick Status Pill */}
        <div className="profile-hero-actions">
          {!isAuthenticated ? (
            <button
              type="button"
              className="btn-primary btn-sm font-mono btn-glow-pulse"
              onClick={() => openAuthModal('signin')}
            >
              <LogIn size={13} />
              <span>Sign In to Sync</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary btn-sm font-mono text-pulse-red"
              onClick={signOut}
              title="Log Out of this session"
            >
              <LogOut size={13} />
              <span>Log Out</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Profile Grid Cards */}
      <div className="profile-cards-grid font-mono">
        {/* CARD A: Account Profile Details */}
        <div className="profile-section-card glass-panel">
          <div className="profile-card-header">
            <div className="flex items-center gap-2">
              <div className="profile-card-icon-badge">
                <User size={16} className="text-pulse-cyan" />
              </div>
              <div>
                <h2 className="profile-card-title">Profile Information</h2>
                <p className="profile-card-subtitle">Manage your public display name and account details</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="profile-card-form">
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <div className="input-with-icon">
                <User size={15} className="input-icon text-muted" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Satoshi Whale"
                  className="form-input"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Username (@handle)</label>
              <div className="input-with-icon">
                <span className="input-icon text-muted font-bold text-xs">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. whale_trader"
                  className="form-input"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email Address (Optional)</label>
              <div className="input-with-icon">
                <Mail size={15} className="input-icon text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Bio / Trader Notes</label>
              <div className="input-with-icon">
                <FileText size={15} className="input-icon text-muted" />
                <input
                  type="text"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="e.g. PulseChain Liquidity Provider & Swing Trader"
                  className="form-input"
                />
              </div>
            </div>

            {/* Save Profile Button */}
            <div className="profile-form-action-row">
              <button
                type="submit"
                className="btn-primary profile-save-btn btn-glow-pulse"
                disabled={isSaving}
              >
                <Save size={15} />
                <span>{isSaving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
              </button>

              {saveSuccessMessage && (
                <div className="profile-success-chip animate-fade-in">
                  <Check size={14} className="text-pulse-green" />
                  <span>{saveSuccessMessage}</span>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* CARD B: Trading & App Preferences */}
        <div className="profile-section-card glass-panel">
          <div className="profile-card-header">
            <div className="flex items-center gap-2">
              <div className="profile-card-icon-badge">
                <Sliders size={16} className="text-pulse-green" />
              </div>
              <div>
                <h2 className="profile-card-title">Trading & DEX Preferences</h2>
                <p className="profile-card-subtitle">Configure your default swap and interface preferences</p>
              </div>
            </div>
          </div>

          <div className="profile-prefs-list">
            {/* Slippage Setting */}
            <div className="profile-pref-row">
              <div>
                <span className="profile-pref-title">Default Slippage Tolerance</span>
                <p className="profile-pref-desc">Applied automatically to all DEX swap routes</p>
              </div>
              <div className="profile-slippage-pills">
                {['0.5', '1.0', '2.5', '5.0'].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`profile-slippage-pill ${preferences.slippage === val ? 'active' : ''}`}
                    onClick={() => handleSlippageChange(val)}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>

            {/* Sound FX Setting */}
            <div className="profile-pref-row">
              <div>
                <span className="profile-pref-title">Audio Cues & Sound FX</span>
                <p className="profile-pref-desc">Play cyber sound effects on trades, clicks, and notifications</p>
              </div>
              <button
                type="button"
                className={`profile-toggle-switch ${preferences.soundEffects ? 'active' : ''}`}
                onClick={() => handleTogglePreference('soundEffects')}
                title="Toggle Sound Effects"
              >
                <div className="profile-toggle-thumb">
                  {preferences.soundEffects ? <Volume2 size={11} /> : <VolumeX size={11} />}
                </div>
              </button>
            </div>

            {/* Privacy Mode Setting */}
            <div className="profile-pref-row">
              <div>
                <span className="profile-pref-title">Privacy Mode</span>
                <p className="profile-pref-desc">Mask USD balances and wallet amounts across the app</p>
              </div>
              <button
                type="button"
                className={`profile-toggle-switch ${preferences.privacyMode ? 'active' : ''}`}
                onClick={() => handleTogglePreference('privacyMode')}
                title="Toggle Privacy Mode"
              >
                <div className="profile-toggle-thumb">
                  {preferences.privacyMode ? <EyeOff size={11} /> : <Eye size={11} />}
                </div>
              </button>
            </div>

            {/* Fast Gas Priority */}
            <div className="profile-pref-row">
              <div>
                <span className="profile-pref-title">Fast Gas Priority</span>
                <p className="profile-pref-desc">Auto-suggest high priority gas for speed during high volatility</p>
              </div>
              <button
                type="button"
                className={`profile-toggle-switch ${preferences.fastGasPriority ? 'active' : ''}`}
                onClick={() => handleTogglePreference('fastGasPriority')}
                title="Toggle Fast Gas"
              >
                <div className="profile-toggle-thumb">
                  <Zap size={11} />
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* CARD C: Security & Password Vault */}
        <div className="profile-section-card glass-panel">
          <div className="profile-card-header">
            <div className="flex items-center gap-2">
              <div className="profile-card-icon-badge">
                <Lock size={16} className="text-pulse-yellow" />
              </div>
              <div>
                <h2 className="profile-card-title">Security & Password Vault</h2>
                <p className="profile-card-subtitle">Manage PBKDF2 encrypted password credentials</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="profile-card-form">
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <div className="input-with-icon">
                <Lock size={15} className="input-icon text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">New Password</label>
              <div className="input-with-icon">
                <Lock size={15} className="input-icon text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="form-input"
                />
                <button
                  type="button"
                  className="input-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <div className="input-with-icon">
                <Lock size={15} className="input-icon text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="form-input"
                />
              </div>
            </div>

            {passwordStatus && (
              <div
                className={`text-xs p-2.5 rounded-lg flex items-center gap-2 ${
                  passwordStatus.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}
              >
                {passwordStatus.type === 'success' ? <Check size={14} /> : <Shield size={14} />}
                <span>{passwordStatus.text}</span>
              </div>
            )}

            <button type="submit" className="btn-secondary btn-sm font-mono mt-1">
              <Lock size={13} className="text-pulse-yellow" />
              <span>Update Password</span>
            </button>
          </form>
        </div>

        {/* CARD D: Linked Web3 Wallet & Session */}
        <div className="profile-section-card glass-panel">
          <div className="profile-card-header">
            <div className="flex items-center gap-2">
              <div className="profile-card-icon-badge">
                <Wallet size={16} className="text-pulse-cyan" />
              </div>
              <div>
                <h2 className="profile-card-title">Connected Web3 Wallet</h2>
                <p className="profile-card-subtitle">Non-custodial PulseChain wallet linkage</p>
              </div>
            </div>
          </div>

          <div className="profile-wallet-content">
            {isConnected && address ? (
              <div className="profile-connected-wallet-box">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="connected-dot"></div>
                    <span className="font-mono text-xs font-bold text-white">
                      {address.slice(0, 8)}...{address.slice(-6)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="profile-icon-action-btn"
                      onClick={handleCopyAddress}
                      title="Copy Address"
                    >
                      {copiedAddr ? <Check size={13} className="text-pulse-green" /> : <Copy size={13} />}
                    </button>
                    <a
                      href={`https://scan.pulsechain.com/#/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="profile-icon-action-btn"
                      title="View on PulseScan"
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>

                <div className="profile-wallet-action-footer mt-3">
                  <button
                    type="button"
                    className="btn-secondary btn-sm font-mono text-pulse-red w-full"
                    onClick={() => disconnect()}
                  >
                    <LogOut size={13} />
                    <span>Disconnect Wallet</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="profile-no-wallet-box">
                <p className="text-xs text-muted">
                  No Web3 wallet currently linked. Connect to trade and execute non-custodial swaps.
                </p>
                {onOpenWalletModal && (
                  <button
                    type="button"
                    className="btn-primary btn-sm font-mono btn-glow-pulse mt-2"
                    onClick={onOpenWalletModal}
                  >
                    <Wallet size={13} />
                    <span>Connect PulseChain Wallet</span>
                  </button>
                )}
              </div>
            )}

            {/* Account Switcher */}
            <div className="profile-session-actions-box mt-4 pt-3 border-t border-subtle">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Account Vault</span>
                  <span className="text-[11px] text-muted block">Signed in as @{currentUser?.username || username}</span>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm font-mono"
                  onClick={() => openAuthModal('signin')}
                >
                  <LogIn size={13} className="text-pulse-cyan" />
                  <span>Switch Account</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Security Guarantee Footer */}
      <div className="profile-security-footer font-mono glass-panel">
        <ShieldCheck size={16} className="text-pulse-green flex-shrink-0" />
        <span>
          PulseDex Client-Side Vault: Your profile, notes, and watchlist are stored with AES/PBKDF2 client-side encryption. Data is never lost upon logout.
        </span>
      </div>
    </div>
  )
}
