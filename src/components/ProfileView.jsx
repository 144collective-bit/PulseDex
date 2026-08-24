import { useState, useRef, useEffect } from 'react'
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
  Flame,
  Wallet,
  LogOut,
  Camera,
  Trash2,
  Download,
  Upload,
  Sparkles,
  RotateCcw,
  Save,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Sliders,
  Settings,
  TrendingUp,
  Radio,
  Zap,
} from 'lucide-react'
import {
  useUserProfile,
  PRESET_AVATARS,
  PRESET_BANNERS,
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

// Telegram SVG Icon
function TelegramIcon({ size = 14, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
    </svg>
  )
}

export default function ProfileView({ onOpenWalletModal }) {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { currentUser, isAuthenticated, openAuthModal, signOut, updateSecurityPin } = useAuth()
  const {
    profile,
    preferences,
    activeAvatarDef,
    activeBannerDef,
    updateProfile,
    updatePreferences,
    exportProfileData,
    importProfileData,
    resetProfile,
    triggerSound,
  } = useUserProfile()

  // Local Form States
  const [formData, setFormData] = useState({
    displayName: profile.displayName || '',
    username: profile.username || '',
    bio: profile.bio || '',
    tradingStyle: profile.tradingAttributes?.style || TRADING_STYLES[0].id,
    twitter: profile.socials?.twitter || '',
    telegram: profile.socials?.telegram || '',
  })

  const [copiedAddr, setCopiedAddr] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(null)
  const [newSecurityPin, setNewSecurityPin] = useState('')
  const [pinFeedback, setPinFeedback] = useState(null)
  const [isSavingPin, setIsSavingPin] = useState(false)
  const [importStatus, setImportStatus] = useState(null)

  const fileInputRef = useRef(null)
  const avatarUploadInputRef = useRef(null)

  // Synchronize when profile changes externally
  useEffect(() => {
    setFormData({
      displayName: profile.displayName || '',
      username: profile.username || '',
      bio: profile.bio || '',
      tradingStyle: profile.tradingAttributes?.style || TRADING_STYLES[0].id,
      twitter: profile.socials?.twitter || '',
      telegram: profile.socials?.telegram || '',
    })
  }, [profile])

  const handleCopyAddress = () => {
    if (!address) return
    navigator.clipboard.writeText(address)
    setCopiedAddr(true)
    triggerSound('click')
    setTimeout(() => setCopiedAddr(false), 2000)
  }

  // Handle Form Change
  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // Save Main Profile Details
  const handleSaveProfile = (e) => {
    if (e) e.preventDefault()
    updateProfile({
      displayName: formData.displayName.trim() || 'Pulse Trader',
      username: formData.username.trim() || 'pulse_degen',
      bio: formData.bio.trim(),
      tradingAttributes: {
        ...profile.tradingAttributes,
        style: formData.tradingStyle,
      },
      socials: {
        ...profile.socials,
        twitter: formData.twitter.trim().replace(/^@/, ''),
        telegram: formData.telegram.trim().replace(/^@/, ''),
      },
    })
    triggerSound('success')
    setSaveSuccessMessage('Profile saved successfully!')
    setTimeout(() => setSaveSuccessMessage(null), 3000)
  }

  // Direct Avatar Preset Select
  const handleSelectAvatar = (avatarId) => {
    updateProfile({ avatarId, customAvatarUrl: '' })
    triggerSound('toggle')
  }

  // Direct Banner Select
  const handleSelectBanner = (bannerStyle) => {
    updateProfile({ bannerUrl: bannerStyle })
    triggerSound('toggle')
  }

  // Handle Custom Avatar Upload
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingPhoto(true)
    try {
      const compressedDataUrl = await compressImageFile(file, 280, 280, 0.88)
      updateProfile({ customAvatarUrl: compressedDataUrl })
      triggerSound('success')
    } catch (err) {
      console.error('Failed to process avatar image:', err)
      alert('Could not process image file. Please upload a valid PNG or JPEG image.')
    } finally {
      setIsUploadingPhoto(false)
      if (avatarUploadInputRef.current) avatarUploadInputRef.current.value = ''
    }
  }

  // Remove Custom Avatar Photo
  const handleRemovePhoto = () => {
    updateProfile({ customAvatarUrl: '' })
    triggerSound('click')
  }

  // Update Security PIN
  const handleUpdatePin = async (e) => {
    e?.preventDefault()
    if (!newSecurityPin || newSecurityPin.length < 4) {
      setPinFeedback({ text: 'PIN must be at least 4 digits.', type: 'error' })
      return
    }

    setIsSavingPin(true)
    setPinFeedback(null)
    try {
      await updateSecurityPin(newSecurityPin.trim())
      setPinFeedback({ text: 'Security PIN updated successfully!', type: 'success' })
      setNewSecurityPin('')
      triggerSound('success')
      setTimeout(() => setPinFeedback(null), 3500)
    } catch (err) {
      setPinFeedback({ text: err.message || 'Failed to update PIN.', type: 'error' })
    } finally {
      setIsSavingPin(false)
    }
  }

  // Handle Backup Export
  const handleExportBackup = () => {
    const jsonStr = exportProfileData()
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pulsedex_profile_backup_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    triggerSound('success')
  }

  // Handle Backup Import
  const handleImportBackup = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const success = importProfileData(event.target.result)
        if (success) {
          setImportStatus({ text: 'Profile restored successfully!', type: 'success' })
          triggerSound('success')
        } else {
          setImportStatus({ text: 'Invalid backup file format.', type: 'error' })
        }
      } catch {
        setImportStatus({ text: 'Error reading backup file.', type: 'error' })
      }
      setTimeout(() => setImportStatus(null), 3500)
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Reset to default
  const handleResetProfile = () => {
    if (window.confirm('Reset all profile settings to defaults? This will clear customized attributes.')) {
      resetProfile()
      triggerSound('click')
    }
  }

  return (
    <div className="profile-page-container animate-fade-in">
      {/* =========================================================================
          HERO PROFILE BANNER & IDENTITY CARD
         ========================================================================= */}
      <div className="profile-hero-card glass-panel">
        {/* Banner Area */}
        <div
          className="profile-hero-banner"
          style={{ background: profile.bannerUrl || activeBannerDef?.style || PRESET_BANNERS[0].style }}
        >
          {/* Quick Banner Selector in top right */}
          <div className="profile-banner-palette font-mono">
            <span className="banner-palette-label">Banner:</span>
            {PRESET_BANNERS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`banner-swatch-btn ${profile.bannerUrl === b.style ? 'active' : ''}`}
                style={{ background: b.accent }}
                onClick={() => handleSelectBanner(b.style)}
                title={b.name}
              />
            ))}
          </div>
        </div>

        {/* Hero Identity Body */}
        <div className="profile-hero-content">
          <div className="profile-avatar-wrapper">
            <div
              className="profile-avatar-large"
              style={{
                background: profile.customAvatarUrl ? 'none' : (activeAvatarDef?.bg || 'linear-gradient(135deg, #00ff9d, #0066ff)'),
                boxShadow: `0 0 24px ${activeAvatarDef?.glowColor || '#00e5ff'}44`,
              }}
            >
              {profile.customAvatarUrl ? (
                <img
                  src={profile.customAvatarUrl}
                  alt={profile.displayName}
                  className="profile-avatar-img"
                />
              ) : (
                <span className="profile-avatar-emoji">{activeAvatarDef?.icon || '⚡'}</span>
              )}
            </div>

            {/* Photo Upload Floating Trigger */}
            <label className="profile-avatar-camera-btn" title="Upload Custom Avatar Photo">
              <Camera size={14} />
              <input
                ref={avatarUploadInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
                disabled={isUploadingPhoto}
              />
            </label>
          </div>

          <div className="profile-hero-meta">
            <div className="profile-name-row">
              <h1 className="profile-display-name">{profile.displayName || 'Pulse Trader'}</h1>
              <span className="profile-username-pill font-mono">
                @{profile.username || (currentUser?.username) || 'pulse_degen'}
              </span>
              <span className="profile-style-badge font-mono">
                {profile.tradingAttributes?.style || 'Trenches Sniper'}
              </span>
            </div>

            <p className="profile-bio-text">
              {profile.bio || 'Hunting alpha on PulseChain 🚀'}
            </p>

            <div className="profile-tags-row font-mono">
              {/* Web3 Wallet Chip */}
              {isConnected && address ? (
                <div className="profile-chip profile-wallet-chip" onClick={handleCopyAddress}>
                  <div className="live-dot-green"></div>
                  <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
                  {copiedAddr ? <Check size={13} className="text-pulse-green" /> : <Copy size={13} />}
                </div>
              ) : (
                <button
                  type="button"
                  className="profile-chip profile-connect-chip"
                  onClick={onOpenWalletModal}
                >
                  <Wallet size={13} />
                  <span>Connect Wallet</span>
                </button>
              )}

              {/* Account Vault Chip */}
              {isAuthenticated ? (
                <span className="profile-chip chip-vault-active">
                  <ShieldCheck size={13} className="text-pulse-green" />
                  <span>Vault: {currentUser?.username}</span>
                </span>
              ) : (
                <button
                  type="button"
                  className="profile-chip chip-vault-guest"
                  onClick={() => openAuthModal('signin')}
                >
                  <KeyRound size={13} />
                  <span>Sign In Vault</span>
                </button>
              )}

              {/* Socials Chips if available */}
              {profile.socials?.twitter && (
                <a
                  href={`https://x.com/${profile.socials.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="profile-chip chip-social"
                >
                  <TwitterXIcon size={12} />
                  <span>@{profile.socials.twitter}</span>
                  <ExternalLink size={11} className="opacity-60" />
                </a>
              )}

              {profile.socials?.telegram && (
                <a
                  href={`https://t.me/${profile.socials.telegram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="profile-chip chip-social"
                >
                  <TelegramIcon size={12} />
                  <span>@{profile.socials.telegram}</span>
                  <ExternalLink size={11} className="opacity-60" />
                </a>
              )}

              {/* Sound FX state */}
              <span className="profile-chip chip-subtle">
                {preferences.soundFxEnabled ? <Volume2 size={13} className="text-pulse-green" /> : <VolumeX size={13} className="text-muted" />}
                <span>Sound: {preferences.soundFxEnabled ? 'ON' : 'OFF'}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Save Success Toast Banner */}
      {saveSuccessMessage && (
        <div className="profile-alert-banner success animate-fade-in font-mono">
          <Check size={16} className="text-pulse-green" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* =========================================================================
          MAIN SINGLE-PAGE 2-COLUMN GRID
         ========================================================================= */}
      <div className="profile-sections-grid">
        {/* =======================================================================
            LEFT COLUMN: PROFILE CUSTOMIZATION & AVATAR PICKER
           ======================================================================= */}
        <div className="profile-col">
          {/* Card 1: Identity & Information */}
          <div className="profile-card glass-panel">
            <div className="profile-card-header">
              <div className="flex items-center gap-2">
                <User size={16} className="text-pulse-green" />
                <h2 className="profile-card-title font-mono">Profile Information</h2>
              </div>
              <span className="badge badge-green text-[10px] font-mono">PUBLIC INFO</span>
            </div>

            <form onSubmit={handleSaveProfile} className="profile-form">
              <div className="profile-form-grid">
                <div className="form-group">
                  <label className="form-label font-mono">Display Name</label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => handleChange('displayName', e.target.value)}
                    placeholder="e.g. Pulse Whale"
                    className="form-input font-mono"
                    maxLength={32}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label font-mono">Username Handle</label>
                  <div className="input-with-prefix">
                    <span className="input-prefix font-mono">@</span>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => handleChange('username', e.target.value)}
                      placeholder="username"
                      className="form-input font-mono"
                      maxLength={24}
                    />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label font-mono">Bio / Trading Thesis</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => handleChange('bio', e.target.value)}
                  placeholder="Share your PulseChain strategy or trading thesis..."
                  className="form-textarea font-mono"
                  rows={2}
                  maxLength={160}
                />
              </div>

              {/* Trading Style Archetype */}
              <div className="form-group">
                <label className="form-label font-mono">Trading Style Archetype</label>
                <div className="trading-style-pills font-mono">
                  {TRADING_STYLES.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      className={`style-pill-btn ${formData.tradingStyle === style.id ? 'active' : ''}`}
                      onClick={() => handleChange('tradingStyle', style.id)}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Social Handles */}
              <div className="profile-form-grid">
                <div className="form-group">
                  <label className="form-label font-mono">𝕏 (Twitter) Handle</label>
                  <div className="input-with-prefix">
                    <span className="input-prefix font-mono">@</span>
                    <input
                      type="text"
                      value={formData.twitter}
                      onChange={(e) => handleChange('twitter', e.target.value)}
                      placeholder="your_x_handle"
                      className="form-input font-mono"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label font-mono">Telegram Handle</label>
                  <div className="input-with-prefix">
                    <span className="input-prefix font-mono">@</span>
                    <input
                      type="text"
                      value={formData.telegram}
                      onChange={(e) => handleChange('telegram', e.target.value)}
                      placeholder="your_tg_handle"
                      className="form-input font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <button type="submit" className="btn-primary profile-save-btn font-mono">
                <Save size={15} />
                <span>Save Profile Changes</span>
              </button>
            </form>
          </div>

          {/* Card 2: Avatar Presets & Custom Upload */}
          <div className="profile-card glass-panel">
            <div className="profile-card-header">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-pulse-cyan" />
                <h2 className="profile-card-title font-mono">Avatar Selection</h2>
              </div>
              {profile.customAvatarUrl && (
                <button
                  type="button"
                  className="btn-danger-subtle font-mono text-[11px]"
                  onClick={handleRemovePhoto}
                >
                  <Trash2 size={12} />
                  <span>Remove Custom Photo</span>
                </button>
              )}
            </div>

            <div className="preset-avatars-grid">
              {PRESET_AVATARS.map((avatar) => {
                const isSelected = !profile.customAvatarUrl && profile.avatarId === avatar.id
                return (
                  <button
                    key={avatar.id}
                    type="button"
                    className={`preset-avatar-btn ${isSelected ? 'active' : ''}`}
                    style={{ background: avatar.bg }}
                    onClick={() => handleSelectAvatar(avatar.id)}
                    title={avatar.name}
                  >
                    <span className="preset-avatar-icon">{avatar.icon}</span>
                    <span className="preset-avatar-name font-mono">{avatar.name}</span>
                    {isSelected && (
                      <div className="avatar-check-badge">
                        <Check size={12} className="text-black" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* =======================================================================
            RIGHT COLUMN: PREFERENCES, SECURITY & DATA BACKUP
           ======================================================================= */}
        <div className="profile-col">
          {/* Card 3: Trading & App Preferences */}
          <div className="profile-card glass-panel">
            <div className="profile-card-header">
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-pulse-yellow" />
                <h2 className="profile-card-title font-mono">Trading & App Preferences</h2>
              </div>
              <span className="badge badge-pulse text-[10px] font-mono">INSTANT SYNC</span>
            </div>

            <div className="preferences-list font-mono">
              {/* Sound Effects */}
              <div className="preference-item-row">
                <div className="preference-label-group">
                  <div className="flex items-center gap-2">
                    {preferences.soundFxEnabled ? (
                      <Volume2 size={16} className="text-pulse-green" />
                    ) : (
                      <VolumeX size={16} className="text-muted" />
                    )}
                    <span className="preference-title">Sound Effects</span>
                  </div>
                  <span className="preference-desc">Audio feedback on trades, copy actions & clicks</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-subtle-test"
                    onClick={() => triggerSound('success')}
                    title="Play Test Chime"
                  >
                    Test
                  </button>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.soundFxEnabled}
                      onChange={(e) => {
                        updatePreferences({ soundFxEnabled: e.target.checked })
                        triggerSound('toggle')
                      }}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              {/* Default Slippage */}
              <div className="preference-item-row vertical">
                <div className="preference-label-group">
                  <span className="preference-title">Default DEX Slippage</span>
                  <span className="preference-desc">Max price deviation allowed on automated swaps</span>
                </div>
                <div className="slippage-preset-row">
                  {['0.1', '0.5', '1.0', '2.5'].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`slippage-pill ${preferences.slippage === val ? 'active' : ''}`}
                      onClick={() => {
                        updatePreferences({ slippage: val, customSlippage: '' })
                        triggerSound('click')
                      }}
                    >
                      {val}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Gas Priority */}
              <div className="preference-item-row vertical">
                <div className="preference-label-group">
                  <span className="preference-title">Gas Speed Preset</span>
                  <span className="preference-desc">PulseChain transaction fee estimation speed</span>
                </div>
                <div className="slippage-preset-row">
                  {[
                    { id: 'standard', label: 'Standard (120 Gwei)' },
                    { id: 'fast', label: 'Fast (150 Gwei)' },
                    { id: 'instant', label: 'Turbo (200 Gwei)' },
                  ].map((gas) => (
                    <button
                      key={gas.id}
                      type="button"
                      className={`slippage-pill flex-1 ${preferences.gasPriority === gas.id ? 'active' : ''}`}
                      onClick={() => {
                        updatePreferences({ gasPriority: gas.id })
                        triggerSound('click')
                      }}
                    >
                      {gas.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Chart Interval */}
              <div className="preference-item-row">
                <div className="preference-label-group">
                  <span className="preference-title">Default Chart Interval</span>
                  <span className="preference-desc">Timeframe loaded upon opening pair screener</span>
                </div>
                <div className="flex items-center gap-1">
                  {['5m', '15m', '1h', '4h', '1D'].map((interval) => (
                    <button
                      key={interval}
                      type="button"
                      className={`chart-interval-btn ${preferences.chartInterval === interval ? 'active' : ''}`}
                      onClick={() => {
                        updatePreferences({ chartInterval: interval })
                        triggerSound('click')
                      }}
                    >
                      {interval}
                    </button>
                  ))}
                </div>
              </div>

              {/* Privacy Mode */}
              <div className="preference-item-row">
                <div className="preference-label-group">
                  <div className="flex items-center gap-2">
                    {preferences.privacyMode ? <EyeOff size={15} className="text-pulse-cyan" /> : <Eye size={15} className="text-muted" />}
                    <span className="preference-title">Privacy Mode</span>
                  </div>
                  <span className="preference-desc">Mask wallet balances and portfolio USD values</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={preferences.privacyMode}
                    onChange={(e) => {
                      updatePreferences({ privacyMode: e.target.checked })
                      triggerSound('toggle')
                    }}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          {/* Card 4: Account Vault & Security */}
          <div className="profile-card glass-panel">
            <div className="profile-card-header">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-pulse-cyan" />
                <h2 className="profile-card-title font-mono">Account & Security</h2>
              </div>
              <span className="badge badge-blue text-[10px] font-mono">ENCRYPTED</span>
            </div>

            <div className="account-security-body font-mono">
              {/* Account Status Box */}
              <div className="account-status-box">
                <div className="status-box-header">
                  <span className="text-muted">Account Status:</span>
                  <span className="status-badge-val">
                    {isAuthenticated ? (
                      <span className="text-pulse-green font-bold">● Vault Active ({currentUser?.username})</span>
                    ) : isConnected ? (
                      <span className="text-pulse-cyan font-bold">● Web3 Wallet Connected</span>
                    ) : (
                      <span className="text-muted font-bold">○ Guest Mode</span>
                    )}
                  </span>
                </div>

                {isConnected && address && (
                  <div className="account-detail-row">
                    <span className="text-muted">Wallet:</span>
                    <span className="text-white font-mono">{address.slice(0, 10)}...{address.slice(-6)}</span>
                  </div>
                )}
              </div>

              {/* PIN Security Management if Authenticated */}
              {isAuthenticated ? (
                <form onSubmit={handleUpdatePin} className="pin-update-form">
                  <label className="form-label font-mono">Update 4-Digit Security PIN</label>
                  <div className="pin-input-group">
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={newSecurityPin}
                      onChange={(e) => setNewSecurityPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="New PIN (min 4 digits)"
                      className="form-input font-mono flex-1"
                    />
                    <button
                      type="submit"
                      className="btn-secondary font-mono text-xs"
                      disabled={isSavingPin || newSecurityPin.length < 4}
                    >
                      <KeyRound size={13} />
                      <span>{isSavingPin ? 'Updating...' : 'Update PIN'}</span>
                    </button>
                  </div>
                  {pinFeedback && (
                    <div className={`pin-feedback-msg ${pinFeedback.type} animate-fade-in`}>
                      {pinFeedback.type === 'success' ? <Check size={13} /> : <Lock size={13} />}
                      <span>{pinFeedback.text}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn-danger-outline w-full mt-3 font-mono"
                    onClick={signOut}
                  >
                    <LogOut size={14} />
                    <span>Sign Out of Account Vault</span>
                  </button>
                </form>
              ) : (
                <div className="guest-action-box">
                  <p className="guest-action-desc">
                    Sign in to your encrypted PulseDex vault to backup your watchlists and sync profile settings across devices.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary flex-1 font-mono text-xs"
                      onClick={() => openAuthModal('signin')}
                    >
                      <ShieldCheck size={14} />
                      <span>Sign In / Register</span>
                    </button>
                    {isConnected && (
                      <button
                        type="button"
                        className="btn-secondary font-mono text-xs text-pulse-red"
                        onClick={() => disconnect()}
                      >
                        <LogOut size={13} />
                        <span>Disconnect</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 5: Profile Data Backup & Restore */}
          <div className="profile-card glass-panel">
            <div className="profile-card-header">
              <div className="flex items-center gap-2">
                <Download size={16} className="text-pulse-green" />
                <h2 className="profile-card-title font-mono">Data Backup & Restore</h2>
              </div>
            </div>

            <div className="backup-actions-grid font-mono">
              <button
                type="button"
                className="btn-backup-item"
                onClick={handleExportBackup}
                title="Export profile JSON file"
              >
                <Download size={14} className="text-pulse-green" />
                <span>Export Profile JSON</span>
              </button>

              <label className="btn-backup-item cursor-pointer" title="Import profile JSON file">
                <Upload size={14} className="text-pulse-cyan" />
                <span>Import Profile JSON</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  onChange={handleImportBackup}
                  style={{ display: 'none' }}
                />
              </label>

              <button
                type="button"
                className="btn-backup-item text-pulse-red"
                onClick={handleResetProfile}
                title="Reset all settings to default"
              >
                <RotateCcw size={14} />
                <span>Reset to Defaults</span>
              </button>
            </div>

            {importStatus && (
              <div className={`pin-feedback-msg ${importStatus.type} mt-3 animate-fade-in font-mono`}>
                <span>{importStatus.text}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
