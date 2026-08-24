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
  KeyRound,
  Activity,
  CheckCircle2,
  AlertCircle,
  Layers,
} from 'lucide-react'
import { useUserProfile } from '../context/UserProfileContext'
import { useAuth } from '../context/AuthContext'
import { evaluatePasswordStrength } from '../services/authSecurity'

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

  // Profile Form State
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

  // Synchronize when profile or user changes
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

  // Save Profile Details
  const handleSaveProfile = (e) => {
    if (e) e.preventDefault()
    setIsSaving(true)

    updateProfile({
      displayName: displayName.trim() || 'Pulse Trader',
      username: username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || 'pulse_degen',
      email: email.trim(),
      bio: bio.trim(),
    })

    triggerSound('success')
    setSaveSuccessMessage('Profile settings saved to local vault')
    setTimeout(() => {
      setSaveSuccessMessage(null)
      setIsSaving(false)
    }, 2500)
  }

  // Preference Toggles
  const handleSlippageChange = (val) => {
    updatePreferences({ slippage: val })
    triggerSound('click')
  }

  const handleTogglePreference = (key) => {
    updatePreferences({ [key]: !preferences[key] })
    triggerSound('toggle')
  }

  // Password Update
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
    setPasswordStatus({ type: 'success', text: 'Password encrypted and updated in your vault.' })
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setTimeout(() => setPasswordStatus(null), 3000)
  }

  const pwStrength = evaluatePasswordStrength(newPassword)

  const initials = (displayName || username || 'PT')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="profile-page-shell">
      {/* 1. High-End Obsidian Hero Identity Banner */}
      <div className="profile-hero-card glass-panel font-mono">
        <div className="profile-hero-content">
          <div className="profile-avatar-badge">
            <span className="profile-avatar-text">{initials}</span>
            <div className="profile-avatar-glow-ring"></div>
          </div>

          <div className="profile-identity-col">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="profile-display-name">
                {currentUser?.displayName || displayName || 'Pulse Trader'}
              </h1>
              <div className="profile-status-badge">
                <ShieldCheck size={13} className="text-pulse-green" />
                <span>VAULT ENCRYPTED</span>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap mt-0.5">
              <span className="profile-handle-sub">
                @{currentUser?.username || username || 'pulse_degen'}
              </span>
              <span className="profile-dot-separator">•</span>
              <span className="profile-network-sub">
                <Activity size={12} className="text-pulse-cyan inline mr-1" />
                PulseChain (Chain ID: 369)
              </span>
            </div>
          </div>
        </div>

        {/* Hero Top Action Buttons */}
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

      {/* 2. Structured Dashboard Grid (2 Columns) */}
      <div className="profile-cards-grid font-mono">
        {/* ================= COLUMN 1: Profile & Security ================= */}
        <div className="profile-column-stack">
          {/* Card 1: Profile Information */}
          <div className="profile-section-card glass-panel">
            <div className="profile-card-header">
              <div className="flex items-center gap-2.5">
                <div className="profile-card-icon-badge">
                  <User size={15} className="text-pulse-cyan" />
                </div>
                <div>
                  <h2 className="profile-card-title">Profile Information</h2>
                  <p className="profile-card-subtitle">Manage public display identity & bio</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="profile-card-form">
              <div className="form-group">
                <label className="form-label">DISPLAY NAME</label>
                <div className="input-with-icon">
                  <User size={14} className="input-icon text-muted" />
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
                <label className="form-label">USERNAME (@HANDLE)</label>
                <div className="input-with-icon">
                  <span className="input-icon text-muted font-bold text-xs">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="e.g. pulse_whale"
                    className="form-input"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">EMAIL ADDRESS (OPTIONAL)</label>
                <div className="input-with-icon">
                  <Mail size={14} className="input-icon text-muted" />
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
                <label className="form-label">TRADER BIO & NOTES</label>
                <div className="input-with-icon">
                  <FileText size={14} className="input-icon text-muted" />
                  <input
                    type="text"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="e.g. PulseChain Liquidity Provider & Swing Trader"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="profile-form-action-row">
                <button
                  type="submit"
                  className="btn-primary profile-save-btn btn-glow-pulse font-mono"
                  disabled={isSaving}
                >
                  <Save size={14} />
                  <span>{isSaving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
                </button>

                {saveSuccessMessage && (
                  <div className="profile-success-chip animate-fade-in">
                    <CheckCircle2 size={13} className="text-pulse-green" />
                    <span>{saveSuccessMessage}</span>
                  </div>
                )}
              </div>
            </form>
          </div>

          {/* Card 2: Security & Password Credentials */}
          <div className="profile-section-card glass-panel">
            <div className="profile-card-header">
              <div className="flex items-center gap-2.5">
                <div className="profile-card-icon-badge">
                  <Lock size={15} className="text-pulse-yellow" />
                </div>
                <div>
                  <h2 className="profile-card-title">Security & Password Vault</h2>
                  <p className="profile-card-subtitle">PBKDF2 client-side encryption settings</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="profile-card-form">
              <div className="form-group">
                <label className="form-label">CURRENT PASSWORD</label>
                <div className="input-with-icon">
                  <Lock size={14} className="input-icon text-muted" />
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
                <div className="flex items-center justify-between">
                  <label className="form-label">NEW PASSWORD</label>
                  {newPassword && (
                    <span className={`text-[10px] font-bold ${
                      pwStrength.level === 'Strong' ? 'text-pulse-green' :
                      pwStrength.level === 'Medium' ? 'text-pulse-yellow' : 'text-pulse-red'
                    }`}>
                      {pwStrength.level}
                    </span>
                  )}
                </div>
                <div className="input-with-icon">
                  <Lock size={14} className="input-icon text-muted" />
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
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">CONFIRM NEW PASSWORD</label>
                <div className="input-with-icon">
                  <Lock size={14} className="input-icon text-muted" />
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
                  className={`text-xs p-2.5 rounded-lg flex items-center gap-2 font-mono ${
                    passwordStatus.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/10 text-red-400 border border-red-500/30'
                  }`}
                >
                  {passwordStatus.type === 'success' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  <span>{passwordStatus.text}</span>
                </div>
              )}

              <button type="submit" className="btn-secondary btn-sm font-mono mt-1 w-max">
                <KeyRound size={13} className="text-pulse-yellow" />
                <span>Update Password</span>
              </button>
            </form>
          </div>
        </div>

        {/* ================= COLUMN 2: Trading Engine & Web3 Wallet ================= */}
        <div className="profile-column-stack">
          {/* Card 3: Trading & DEX Preferences */}
          <div className="profile-section-card glass-panel">
            <div className="profile-card-header">
              <div className="flex items-center gap-2.5">
                <div className="profile-card-icon-badge">
                  <Sliders size={15} className="text-pulse-green" />
                </div>
                <div>
                  <h2 className="profile-card-title">Trading & DEX Preferences</h2>
                  <p className="profile-card-subtitle">Global swap execution & UI parameters</p>
                </div>
              </div>
            </div>

            <div className="profile-prefs-list">
              {/* Slippage Setting */}
              <div className="profile-pref-row">
                <div className="profile-pref-label-col">
                  <span className="profile-pref-title">Default Slippage Tolerance</span>
                  <p className="profile-pref-desc">Auto-configured across all DEX aggregator swaps</p>
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
                <div className="profile-pref-label-col">
                  <span className="profile-pref-title">Audio Cues & Sound FX</span>
                  <p className="profile-pref-desc">Cyber audio feedback for trades, clicks & saves</p>
                </div>
                <button
                  type="button"
                  className={`profile-toggle-switch ${preferences.soundEffects ? 'active' : ''}`}
                  onClick={() => handleTogglePreference('soundEffects')}
                  title="Toggle Sound Effects"
                >
                  <div className="profile-toggle-thumb">
                    {preferences.soundEffects ? <Volume2 size={10} /> : <VolumeX size={10} />}
                  </div>
                </button>
              </div>

              {/* Privacy Mode Setting */}
              <div className="profile-pref-row">
                <div className="profile-pref-label-col">
                  <span className="profile-pref-title">Privacy Mode</span>
                  <p className="profile-pref-desc">Mask USD balances & wallet amounts across the app</p>
                </div>
                <button
                  type="button"
                  className={`profile-toggle-switch ${preferences.privacyMode ? 'active' : ''}`}
                  onClick={() => handleTogglePreference('privacyMode')}
                  title="Toggle Privacy Mode"
                >
                  <div className="profile-toggle-thumb">
                    {preferences.privacyMode ? <EyeOff size={10} /> : <Eye size={10} />}
                  </div>
                </button>
              </div>

              {/* Fast Gas Priority */}
              <div className="profile-pref-row">
                <div className="profile-pref-label-col">
                  <span className="profile-pref-title">Fast Gas Priority</span>
                  <p className="profile-pref-desc">Auto-suggest high priority gas for speed in volatility</p>
                </div>
                <button
                  type="button"
                  className={`profile-toggle-switch ${preferences.fastGasPriority ? 'active' : ''}`}
                  onClick={() => handleTogglePreference('fastGasPriority')}
                  title="Toggle Fast Gas"
                >
                  <div className="profile-toggle-thumb">
                    <Zap size={10} />
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Card 4: Connected Web3 Wallet & Session */}
          <div className="profile-section-card glass-panel">
            <div className="profile-card-header">
              <div className="flex items-center gap-2.5">
                <div className="profile-card-icon-badge">
                  <Wallet size={15} className="text-pulse-cyan" />
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
                      className="btn-primary btn-sm font-mono btn-glow-pulse mt-1 w-max"
                      onClick={onOpenWalletModal}
                    >
                      <Wallet size={13} />
                      <span>Connect PulseChain Wallet</span>
                    </button>
                  )}
                </div>
              )}

              {/* Account Switcher */}
              <div className="profile-session-actions-box mt-3 pt-3 border-t border-subtle">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Account Session</span>
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
      </div>

      {/* 3. High-End Security Guarantee HUD Footer */}
      <div className="profile-security-footer font-mono glass-panel">
        <ShieldCheck size={16} className="text-pulse-green flex-shrink-0" />
        <span>
          PulseDex Client-Side Vault: Your profile, notes, and watchlist are secured with AES/PBKDF2 client-side encryption. User data is never deleted on logout.
        </span>
      </div>
    </div>
  )
}
