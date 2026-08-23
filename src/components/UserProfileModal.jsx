import { useState, useRef } from 'react'
import { useAccount } from 'wagmi'
import {
  X,
  User,
  Sliders,
  Palette,
  BookOpen,
  Download,
  Upload,
  RotateCcw,
  Check,
  Copy,
  ExternalLink,
  Shield,
  ShieldCheck,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Flame,
  Sparkles,
  Award,
  Plus,
  Trash2,
  Wallet,
  UserPlus,
  LogOut,
  Camera,
  Image as ImageIcon,
  Share2,
  Globe,
  Send,
  MessageSquare,
  Compass,
} from 'lucide-react'
import {
  useUserProfile,
  PRESET_AVATARS,
  PRESET_BANNERS,
  THEMES,
  AVAILABLE_BADGES,
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

export default function UserProfileModal() {
  const { address, isConnected } = useAccount()
  const { currentUser, isAuthenticated, openAuthModal, signOut } = useAuth()
  const {
    profile,
    preferences,
    tradeNotes,
    activeAvatarDef,
    isProfileModalOpen,
    closeProfileModal,
    updateProfile,
    updatePreferences,
    addTradeNote,
    deleteTradeNote,
    exportProfileData,
    importProfileData,
    resetProfile,
    triggerSound,
  } = useUserProfile()

  const [activeTab, setActiveTab] = useState('identity') // 'identity' | 'socials' | 'trading' | 'appearance' | 'journal' | 'backup'
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [isUploadingBanner, setIsUploadingBanner] = useState(false)

  // New Note Form State
  const [newNoteToken, setNewNoteToken] = useState('')
  const [newNoteText, setNewNoteText] = useState('')
  const [newNoteType, setNewNoteType] = useState('Strategy')

  const fileInputRef = useRef(null)
  const avatarUploadInputRef = useRef(null)
  const bannerUploadInputRef = useRef(null)

  if (!isProfileModalOpen) return null

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

  const handleBadgeToggle = (badgeId) => {
    const current = profile.badges || []
    const updated = current.includes(badgeId)
      ? current.filter((b) => b !== badgeId)
      : [...current, badgeId]
    updateProfile({ badges: updated })
    triggerSound('toggle')
  }

  // Handle Direct Photo Upload from Device
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingPhoto(true)
    try {
      const compressedDataUrl = await compressImageFile(file, 320, 320, 0.88)
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

  // Handle Banner Upload from Device
  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingBanner(true)
    try {
      const compressedDataUrl = await compressImageFile(file, 800, 300, 0.85)
      updateProfile({ bannerUrl: `url(${compressedDataUrl}) center/cover no-repeat` })
      triggerSound('success')
    } catch (err) {
      console.error('Failed to compress banner image:', err)
    } finally {
      setIsUploadingBanner(false)
      if (bannerUploadInputRef.current) bannerUploadInputRef.current.value = ''
    }
  }

  const handleAddNoteSubmit = (e) => {
    e.preventDefault()
    if (!newNoteText.trim()) return
    addTradeNote({
      token: newNoteToken.trim().toUpperCase() || 'PLS',
      note: newNoteText.trim(),
      type: newNoteType,
    })
    setNewNoteToken('')
    setNewNoteText('')
    triggerSound('success')
  }

  const handleFileImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const result = importProfileData(event.target.result)
        if (result.success) {
          setImportStatus('Profile & settings successfully imported!')
          triggerSound('success')
        } else {
          setImportStatus(`Import failed: ${result.error}`)
        }
      } catch (err) {
        setImportStatus(`Invalid JSON file format. ${err.message}`)
      }
      setTimeout(() => setImportStatus(''), 4000)
    }
    reader.readAsText(file)
  }

  const socials = profile.socials || {}
  const tradingAttributes = profile.tradingAttributes || {}

  return (
    <div className="modal-backdrop" onClick={closeProfileModal}>
      <div
        className="user-profile-modal-card glass-panel font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Profile Banner Header Area */}
        <div
          className="user-profile-banner-container"
          style={{ background: profile.bannerUrl || PRESET_BANNERS[0].style }}
        >
          <div className="banner-overlay-gradient"></div>

          {/* Banner Action Buttons */}
          <div className="banner-actions-bar">
            <input
              type="file"
              ref={bannerUploadInputRef}
              onChange={handleBannerUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="btn-banner-edit"
              onClick={() => bannerUploadInputRef.current?.click()}
              title="Upload custom cover banner"
            >
              <Camera size={13} />
              <span>{isUploadingBanner ? 'Processing...' : 'Upload Banner'}</span>
            </button>

            <button
              className="wallet-modal-close-btn banner-close-btn"
              onClick={closeProfileModal}
              title="Close Profile"
            >
              <X size={18} />
            </button>
          </div>

          {/* Avatar Profile Section */}
          <div className="user-profile-banner-hero">
            <div className="user-avatar-upload-wrapper">
              <div
                className="user-profile-avatar-badge-large"
                style={{
                  background: activeAvatarDef.bg,
                  boxShadow: `0 0 20px ${activeAvatarDef.glowColor}88`,
                }}
              >
                {profile.customAvatarUrl ? (
                  <img
                    src={profile.customAvatarUrl}
                    alt={profile.displayName}
                    className="avatar-custom-img"
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                ) : (
                  <span className="avatar-preset-icon-large">{activeAvatarDef.icon}</span>
                )}
              </div>

              {/* Upload Photo Button Overlay */}
              <input
                type="file"
                ref={avatarUploadInputRef}
                onChange={handlePhotoUpload}
                accept="image/*"
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="avatar-camera-btn"
                onClick={() => avatarUploadInputRef.current?.click()}
                title="Upload Profile Picture from Device"
              >
                <Camera size={14} />
              </button>
            </div>

            <div className="user-profile-hero-meta">
              <div className="user-profile-title-row">
                <h2 className="user-profile-title">{profile.displayName || 'Pulse Trader'}</h2>
                <span className="user-profile-handle">@{profile.username || 'user'}</span>
                {currentUser?.twitterVerified && (
                  <span className="twitter-verified-chip" title="Verified via X (Twitter)">
                    <TwitterXIcon size={11} />
                    <span>Verified</span>
                  </span>
                )}
              </div>

              <div className="user-profile-tier-row">
                <span className="user-tier-pill">
                  <Sparkles size={11} className="text-pulse-cyan" />
                  <span>{tradingAttributes.style || profile.tier}</span>
                </span>

                {isConnected && (
                  <span className="user-chain-chip">
                    <span className="live-dot"></span>
                    <span>PulseChain (369)</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="user-profile-tabs-bar">
          <button
            className={`profile-tab-btn ${activeTab === 'identity' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('identity')
              triggerSound('click')
            }}
          >
            <User size={14} />
            <span>Profile & Bio</span>
          </button>

          <button
            className={`profile-tab-btn ${activeTab === 'socials' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('socials')
              triggerSound('click')
            }}
          >
            <Share2 size={14} />
            <span>Socials & Links</span>
          </button>

          <button
            className={`profile-tab-btn ${activeTab === 'trading' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('trading')
              triggerSound('click')
            }}
          >
            <Sliders size={14} />
            <span>DEX Preferences</span>
          </button>

          <button
            className={`profile-tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('appearance')
              triggerSound('click')
            }}
          >
            <Palette size={14} />
            <span>Themes & Cover</span>
          </button>

          <button
            className={`profile-tab-btn ${activeTab === 'journal' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('journal')
              triggerSound('click')
            }}
          >
            <BookOpen size={14} />
            <span>Trader Notes ({tradeNotes.length})</span>
          </button>

          <button
            className={`profile-tab-btn ${activeTab === 'backup' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('backup')
              triggerSound('click')
            }}
          >
            <Download size={14} />
            <span>Sync & Backup</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="user-profile-body">
          {/* TAB 1: IDENTITY & PROFILE */}
          {activeTab === 'identity' && (
            <div className="tab-pane-content">
              {/* Account Vault Status Box */}
              <div className="profile-section-card glass-panel auth-status-card">
                <div className="card-sub-header">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className={isAuthenticated ? 'text-pulse-green' : 'text-pulse-cyan'} />
                    <span className="font-bold text-white">PulseDex Vault Account</span>
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
                      <div className="flex items-center gap-2">
                        <span className="auth-username-text font-mono text-white font-bold">
                          @{currentUser?.username}
                        </span>
                        {currentUser?.twitterVerified && (
                          <span className="twitter-verified-chip">
                            <TwitterXIcon size={10} /> Verified 𝕏
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted">
                        Member since {currentUser?.createdAt ? new Date(currentUser.createdAt).toLocaleDateString() : 'Active'}
                      </span>
                    </div>
                    <div className="auth-account-actions">
                      <button
                        className="btn-secondary btn-sm font-mono text-pulse-yellow"
                        onClick={() => {
                          signOut()
                          triggerSound('toggle')
                        }}
                      >
                        <LogOut size={13} />
                        <span>Log Out</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="auth-guest-prompt-row">
                    <span className="text-xs text-muted">
                      You are using local guest storage. Create a PulseDex account to persist notes, custom tokens & watchlists.
                    </span>
                    <div className="flex gap-2">
                      <button
                        className="btn-secondary btn-sm font-mono"
                        onClick={() => {
                          closeProfileModal()
                          openAuthModal('signin')
                        }}
                      >
                        Sign In
                      </button>
                      <button
                        className="btn-primary btn-sm font-mono btn-glow-pulse"
                        onClick={() => {
                          closeProfileModal()
                          openAuthModal('signup')
                        }}
                      >
                        <UserPlus size={13} />
                        <span>Sign Up</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Profile Picture Upload & Presets */}
              <div className="profile-section-card glass-panel">
                <div className="card-sub-header">
                  <span className="font-bold text-white">Profile Picture / Avatar</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-primary btn-sm font-mono"
                      onClick={() => avatarUploadInputRef.current?.click()}
                    >
                      <Camera size={13} />
                      <span>{isUploadingPhoto ? 'Uploading...' : 'Upload Image'}</span>
                    </button>
                    {profile.customAvatarUrl && (
                      <button
                        type="button"
                        className="btn-secondary btn-sm text-pulse-red"
                        onClick={() => updateProfile({ customAvatarUrl: '' })}
                        title="Remove uploaded picture"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="avatars-preset-grid">
                  {PRESET_AVATARS.map((av) => {
                    const isSelected = profile.avatarId === av.id && !profile.customAvatarUrl
                    return (
                      <button
                        key={av.id}
                        className={`avatar-preset-card ${isSelected ? 'active' : ''}`}
                        onClick={() => handleAvatarSelect(av.id)}
                        style={{
                          '--avatar-glow': av.glowColor,
                        }}
                      >
                        <div
                          className="avatar-preset-icon-box"
                          style={{ background: av.bg }}
                        >
                          <span>{av.icon}</span>
                        </div>
                        <span className="avatar-preset-name">{av.name}</span>
                        {isSelected && <span className="avatar-check-dot">✓</span>}
                      </button>
                    )
                  })}
                </div>

                {/* Custom Avatar URL Input */}
                <div className="custom-avatar-url-row">
                  <span className="text-xs text-muted">Or Custom Image URL:</span>
                  <input
                    type="url"
                    placeholder="https://example.com/my-avatar.png"
                    value={profile.customAvatarUrl}
                    onChange={(e) => updateProfile({ customAvatarUrl: e.target.value })}
                    className="modal-input text-xs"
                  />
                </div>
              </div>

              {/* Display Name & Bio */}
              <div className="profile-section-card glass-panel">
                <div className="form-group-grid">
                  <div className="form-field">
                    <label className="form-label">Display Name</label>
                    <input
                      type="text"
                      value={profile.displayName}
                      onChange={(e) => updateProfile({ displayName: e.target.value })}
                      placeholder="e.g. Richard Heart Fan"
                      className="modal-input"
                      maxLength={32}
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-label">Username Handle</label>
                    <div className="input-with-prefix">
                      <span className="input-prefix">@</span>
                      <input
                        type="text"
                        value={profile.username}
                        onChange={(e) =>
                          updateProfile({
                            username: e.target.value.replace(/[^a-zA-Z0-9_]/g, ''),
                          })
                        }
                        placeholder="pulse_whale"
                        className="modal-input font-mono"
                        maxLength={24}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-field mt-3">
                  <label className="form-label">Trader Bio / Tagline</label>
                  <input
                    type="text"
                    value={profile.bio}
                    onChange={(e) => updateProfile({ bio: e.target.value })}
                    placeholder="e.g. Long PulseChain, PulseX & HEX. Diamond hands only."
                    className="modal-input"
                    maxLength={120}
                  />
                  <div className="quick-bio-chips">
                    {['🚀 To the moon', '💎 Diamond Hands', '🔥 Trenches Hunter', '⚡ 369 PulseChain', '🌾 PulseX LP'].map(
                      (tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="chip-tag-btn"
                          onClick={() => {
                            updateProfile({ bio: tag })
                            triggerSound('toggle')
                          }}
                        >
                          {tag}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Connected Wallet Box */}
              {isConnected && (
                <div className="profile-section-card glass-panel">
                  <div className="card-sub-header">
                    <div className="flex items-center gap-2">
                      <Wallet size={15} className="text-pulse-green" />
                      <span className="font-bold text-white">Linked Web3 Wallet</span>
                    </div>
                    <span className="badge badge-green">Connected</span>
                  </div>
                  <div className="profile-wallet-row">
                    <span className="profile-wallet-addr font-mono">{address}</span>
                    <div className="profile-wallet-actions">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={handleCopyAddress}
                        title="Copy Address"
                      >
                        {copiedAddr ? <Check size={13} className="text-pulse-green" /> : <Copy size={13} />}
                        <span>{copiedAddr ? 'Copied' : 'Copy'}</span>
                      </button>
                      <a
                        href={`https://scan.pulsechain.com/address/${address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary btn-sm"
                      >
                        <ExternalLink size={13} />
                        <span>PulseScan</span>
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Trader Badges Showcase */}
              <div className="profile-section-card glass-panel">
                <div className="card-sub-header">
                  <div className="flex items-center gap-2">
                    <Award size={15} className="text-pulse-yellow" />
                    <span className="font-bold text-white">Trader Badges Showcase</span>
                  </div>
                  <span className="text-xs text-muted">Select active showcase badges</span>
                </div>
                <div className="badges-selection-grid">
                  {AVAILABLE_BADGES.map((badge) => {
                    const isUnlocked = profile.badges?.includes(badge.id)
                    return (
                      <div
                        key={badge.id}
                        className={`badge-item-card ${isUnlocked ? 'active' : ''}`}
                        onClick={() => handleBadgeToggle(badge.id)}
                      >
                        <div className="badge-item-icon">{badge.icon}</div>
                        <div className="badge-item-meta">
                          <span className="badge-item-label">{badge.label}</span>
                          <span className="badge-item-desc">{badge.desc}</span>
                        </div>
                        <div className="badge-item-toggle">
                          {isUnlocked ? <Check size={14} className="text-pulse-green" /> : <Plus size={14} className="text-muted" />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SOCIALS & TRADING ARCHETYPE */}
          {activeTab === 'socials' && (
            <div className="tab-pane-content">
              {/* Social Media Links */}
              <div className="profile-section-card glass-panel">
                <div className="card-sub-header">
                  <div className="flex items-center gap-2">
                    <Share2 size={15} className="text-pulse-cyan" />
                    <span className="font-bold text-white">Socials & Contact Links</span>
                  </div>
                  <span className="text-xs text-muted">Display on public trader card</span>
                </div>

                <div className="form-group-grid">
                  {/* Twitter / X */}
                  <div className="form-field">
                    <label className="form-label flex items-center gap-2">
                      <TwitterXIcon size={12} className="text-white" />
                      <span>X / Twitter Handle</span>
                    </label>
                    <div className="input-with-prefix">
                      <span className="input-prefix">@</span>
                      <input
                        type="text"
                        placeholder="twitter_username"
                        value={socials.twitter || ''}
                        onChange={(e) =>
                          updateProfile({
                            socials: { ...socials, twitter: e.target.value.replace(/^@/, '') },
                          })
                        }
                        className="modal-input font-mono"
                      />
                    </div>
                  </div>

                  {/* Telegram */}
                  <div className="form-field">
                    <label className="form-label flex items-center gap-2">
                      <Send size={12} className="text-pulse-cyan" />
                      <span>Telegram</span>
                    </label>
                    <div className="input-with-prefix">
                      <span className="input-prefix">@</span>
                      <input
                        type="text"
                        placeholder="telegram_handle"
                        value={socials.telegram || ''}
                        onChange={(e) =>
                          updateProfile({
                            socials: { ...socials, telegram: e.target.value.replace(/^@/, '') },
                          })
                        }
                        className="modal-input font-mono"
                      />
                    </div>
                  </div>

                  {/* Discord */}
                  <div className="form-field">
                    <label className="form-label flex items-center gap-2">
                      <MessageSquare size={12} className="text-pulse-purple" />
                      <span>Discord</span>
                    </label>
                    <input
                      type="text"
                      placeholder="username or user#1234"
                      value={socials.discord || ''}
                      onChange={(e) =>
                        updateProfile({
                          socials: { ...socials, discord: e.target.value },
                        })
                      }
                      className="modal-input font-mono"
                    />
                  </div>

                  {/* Website */}
                  <div className="form-field">
                    <label className="form-label flex items-center gap-2">
                      <Globe size={12} className="text-pulse-green" />
                      <span>Website / Linktree</span>
                    </label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={socials.website || ''}
                      onChange={(e) =>
                        updateProfile({
                          socials: { ...socials, website: e.target.value },
                        })
                      }
                      className="modal-input font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Trading Archetype & Strategy Profile */}
              <div className="profile-section-card glass-panel">
                <div className="card-sub-header">
                  <div className="flex items-center gap-2">
                    <Compass size={15} className="text-pulse-green" />
                    <span className="font-bold text-white">Trading Archetype & Strategy</span>
                  </div>
                  <span className="badge badge-pulse">{tradingAttributes.style || 'Degen Sniper'}</span>
                </div>

                <div className="trading-styles-grid">
                  {TRADING_STYLES.map((st) => {
                    const isSelected = (tradingAttributes.style || 'Degen Sniper') === st.id
                    return (
                      <div
                        key={st.id}
                        className={`style-choice-card ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          updateProfile({
                            tradingAttributes: { ...tradingAttributes, style: st.id },
                          })
                          triggerSound('toggle')
                        }}
                      >
                        <span className="style-choice-label">{st.label}</span>
                        <span className="style-choice-desc">{st.desc}</span>
                      </div>
                    )
                  })}
                </div>

                <div className="form-group-grid mt-4">
                  <div className="form-field">
                    <label className="form-label">Risk Tolerance Profile</label>
                    <select
                      value={tradingAttributes.riskTolerance || 'Moderate'}
                      onChange={(e) =>
                        updateProfile({
                          tradingAttributes: { ...tradingAttributes, riskTolerance: e.target.value },
                        })
                      }
                      className="modal-select font-mono"
                    >
                      <option value="Conservative">Conservative (Staking & Bluechips)</option>
                      <option value="Moderate">Moderate (Ecosystem Momentum)</option>
                      <option value="High Risk">High Risk (Trenches & Fair Launches)</option>
                      <option value="Degen Ape">Degen Ape (100x or Bust 🦍)</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Pinned Alpha Token</label>
                    <input
                      type="text"
                      placeholder="e.g. PLS, PLSX, HEX, INC"
                      value={tradingAttributes.pinnedToken || 'PLS'}
                      onChange={(e) =>
                        updateProfile({
                          tradingAttributes: {
                            ...tradingAttributes,
                            pinnedToken: e.target.value.toUpperCase(),
                          },
                        })
                      }
                      className="modal-input font-mono uppercase"
                      maxLength={10}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TRADING & DEX PREFERENCES */}
          {activeTab === 'trading' && (
            <div className="tab-pane-content">
              {/* Slippage Settings */}
              <div className="profile-section-card glass-panel">
                <div className="card-sub-header">
                  <div className="flex items-center gap-2">
                    <Sliders size={15} className="text-pulse-cyan" />
                    <span className="font-bold text-white">Default Slippage Tolerance</span>
                  </div>
                  <span className="badge badge-pulse">
                    {preferences.customSlippage ? `${preferences.customSlippage}% (Custom)` : `${preferences.slippage}%`}
                  </span>
                </div>
                <p className="text-xs text-muted mb-3">
                  Applied by default when executing swaps and calculating minimum output amounts.
                </p>
                <div className="slippage-options-row">
                  {['0.1', '0.5', '1.0', '3.0'].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`slippage-btn ${
                        preferences.slippage === val && !preferences.customSlippage ? 'active' : ''
                      }`}
                      onClick={() => {
                        updatePreferences({ slippage: val, customSlippage: '' })
                        triggerSound('toggle')
                      }}
                    >
                      {val}%
                    </button>
                  ))}
                  <div className="custom-slippage-input-box">
                    <input
                      type="number"
                      step="0.1"
                      min="0.01"
                      max="50"
                      placeholder="Custom %"
                      value={preferences.customSlippage}
                      onChange={(e) => {
                        updatePreferences({ customSlippage: e.target.value })
                      }}
                      className="custom-slip-input font-mono"
                    />
                    <span className="text-xs text-muted">%</span>
                  </div>
                </div>
              </div>

              {/* Gas Priority */}
              <div className="profile-section-card glass-panel">
                <div className="card-sub-header">
                  <div className="flex items-center gap-2">
                    <Flame size={15} className="text-pulse-purple" />
                    <span className="font-bold text-white">Default Gas Speed Priority</span>
                  </div>
                  <span className="text-xs font-mono text-pulse-green uppercase">
                    {preferences.gasPriority}
                  </span>
                </div>
                <div className="gas-priority-grid">
                  {[
                    { id: 'standard', title: 'Standard', gwei: '150 Gwei', desc: 'Optimal for regular trading' },
                    { id: 'fast', title: 'Fast (Recommended)', gwei: '220 Gwei', desc: 'Faster block confirmation' },
                    { id: 'turbo', title: 'Turbo Priority', gwei: '350 Gwei', desc: 'Front-run / Trenches sniping' },
                  ].map((g) => {
                    const isSelected = preferences.gasPriority === g.id
                    return (
                      <div
                        key={g.id}
                        className={`gas-choice-card ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          updatePreferences({ gasPriority: g.id })
                          triggerSound('toggle')
                        }}
                      >
                        <div className="gas-choice-header">
                          <span className="gas-choice-title">{g.title}</span>
                          <span className="gas-choice-gwei font-mono">{g.gwei}</span>
                        </div>
                        <span className="gas-choice-desc">{g.desc}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Display & Privacy Settings */}
              <div className="profile-section-card glass-panel">
                <div className="card-sub-header">
                  <span className="font-bold text-white">App Experience & Privacy</span>
                </div>

                <div className="preference-toggles-list">
                  {/* Privacy Mode */}
                  <div className="pref-toggle-item">
                    <div className="pref-toggle-info">
                      <div className="flex items-center gap-2">
                        {preferences.privacyMode ? (
                          <EyeOff size={16} className="text-pulse-yellow" />
                        ) : (
                          <Eye size={16} className="text-muted" />
                        )}
                        <span className="pref-title text-white font-bold">Privacy Mode</span>
                      </div>
                      <span className="pref-desc">
                        Mask portfolio balances and net worth numbers with <span className="font-mono">••••••</span> for streaming/sharing.
                      </span>
                    </div>
                    <button
                      className={`toggle-switch-btn ${preferences.privacyMode ? 'active' : ''}`}
                      onClick={() => {
                        updatePreferences({ privacyMode: !preferences.privacyMode })
                        triggerSound('toggle')
                      }}
                    >
                      <span className="toggle-switch-handle"></span>
                    </button>
                  </div>

                  {/* Sound Effects */}
                  <div className="pref-toggle-item">
                    <div className="pref-toggle-info">
                      <div className="flex items-center gap-2">
                        {preferences.soundFxEnabled ? (
                          <Volume2 size={16} className="text-pulse-cyan" />
                        ) : (
                          <VolumeX size={16} className="text-muted" />
                        )}
                        <span className="pref-title text-white font-bold">Sound Effects</span>
                      </div>
                      <span className="pref-desc">
                        Play audio feedback for swaps, transactions, and UI interactions.
                      </span>
                    </div>
                    <button
                      className={`toggle-switch-btn ${preferences.soundFxEnabled ? 'active' : ''}`}
                      onClick={() => {
                        const next = !preferences.soundFxEnabled
                        updatePreferences({ soundFxEnabled: next })
                        if (next) triggerSound('success')
                      }}
                    >
                      <span className="toggle-switch-handle"></span>
                    </button>
                  </div>

                  {/* Auto-Hide Spam Tokens */}
                  <div className="pref-toggle-item">
                    <div className="pref-toggle-info">
                      <div className="flex items-center gap-2">
                        <Shield size={16} className="text-pulse-green" />
                        <span className="pref-title text-white font-bold">Auto-Hide Scam & Spam Airdrops</span>
                      </div>
                      <span className="pref-desc">
                        Filter out known malicious phishing tokens automatically from your portfolio view.
                      </span>
                    </div>
                    <button
                      className={`toggle-switch-btn ${preferences.autoHideSpam ? 'active' : ''}`}
                      onClick={() => {
                        updatePreferences({ autoHideSpam: !preferences.autoHideSpam })
                        triggerSound('toggle')
                      }}
                    >
                      <span className="toggle-switch-handle"></span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Currency & Chart Defaults */}
              <div className="profile-section-card glass-panel">
                <div className="form-group-grid">
                  <div className="form-field">
                    <label className="form-label">Base Currency</label>
                    <select
                      value={preferences.defaultCurrency}
                      onChange={(e) => {
                        updatePreferences({ defaultCurrency: e.target.value })
                        triggerSound('toggle')
                      }}
                      className="modal-select font-mono"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="PLS">PLS (Native)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Default Chart Timeframe</label>
                    <select
                      value={preferences.chartInterval}
                      onChange={(e) => {
                        updatePreferences({ chartInterval: e.target.value })
                        triggerSound('toggle')
                      }}
                      className="modal-select font-mono"
                    >
                      <option value="1m">1 Minute (1m)</option>
                      <option value="5m">5 Minutes (5m)</option>
                      <option value="15m">15 Minutes (15m)</option>
                      <option value="1h">1 Hour (1h)</option>
                      <option value="4h">4 Hours (4h)</option>
                      <option value="1D">1 Day (1D)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: THEMES & COVERS */}
          {activeTab === 'appearance' && (
            <div className="tab-pane-content">
              {/* Preset Profile Banners */}
              <div className="profile-section-card glass-panel">
                <div className="card-sub-header">
                  <div className="flex items-center gap-2">
                    <ImageIcon size={15} className="text-pulse-cyan" />
                    <span className="font-bold text-white">Preset Profile Banners</span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => bannerUploadInputRef.current?.click()}
                  >
                    <Camera size={13} />
                    <span>Upload Custom</span>
                  </button>
                </div>

                <div className="banners-preset-grid">
                  {PRESET_BANNERS.map((b) => {
                    const isSelected = profile.bannerUrl === b.style
                    return (
                      <div
                        key={b.id}
                        className={`banner-preset-card ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          updateProfile({ bannerUrl: b.style })
                          triggerSound('toggle')
                        }}
                        style={{ background: b.style }}
                      >
                        <span className="banner-preset-name">{b.name}</span>
                        {isSelected && <span className="banner-check-badge">✓ Active</span>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Color Themes */}
              <div className="profile-section-card glass-panel">
                <div className="card-sub-header">
                  <span className="font-bold text-white">Color Palettes & Cyberpunk Aesthetics</span>
                  <span className="text-xs text-muted">Applied instantly</span>
                </div>
                <div className="theme-choices-grid">
                  {THEMES.map((theme) => {
                    const isSelected = preferences.themeColor === theme.id
                    return (
                      <div
                        key={theme.id}
                        className={`theme-card ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          updatePreferences({ themeColor: theme.id })
                          triggerSound('toggle')
                        }}
                        style={{ '--theme-accent': theme.color }}
                      >
                        <div className="theme-color-preview">
                          <span
                            className="color-dot-primary"
                            style={{ backgroundColor: theme.color, boxShadow: `0 0 10px ${theme.color}` }}
                          ></span>
                          <span className="color-dot-bg"></span>
                        </div>
                        <div className="theme-meta">
                          <span className="theme-name">{theme.name}</span>
                          <span className="theme-desc">{theme.desc}</span>
                        </div>
                        {isSelected && (
                          <span className="theme-active-tag">
                            <Check size={12} /> Active
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: TRADER JOURNAL / NOTES */}
          {activeTab === 'journal' && (
            <div className="tab-pane-content">
              {/* Add Note Form */}
              <div className="profile-section-card glass-panel">
                <div className="card-sub-header">
                  <div className="flex items-center gap-2">
                    <BookOpen size={15} className="text-pulse-cyan" />
                    <span className="font-bold text-white">Add Trading Note & Strategy</span>
                  </div>
                  <span className="text-xs text-muted">Saved in local profile</span>
                </div>
                <form onSubmit={handleAddNoteSubmit} className="journal-form">
                  <div className="journal-form-row">
                    <input
                      type="text"
                      placeholder="Token (e.g. PLS, PLSX, HEX, INC)"
                      value={newNoteToken}
                      onChange={(e) => setNewNoteToken(e.target.value)}
                      className="modal-input token-input font-mono uppercase"
                      maxLength={12}
                    />
                    <select
                      value={newNoteType}
                      onChange={(e) => setNewNoteType(e.target.value)}
                      className="modal-select type-select font-mono"
                    >
                      <option value="Strategy">Strategy</option>
                      <option value="Entry Plan">Entry Plan</option>
                      <option value="Target Exit">Target Exit</option>
                      <option value="Reminder">Reminder</option>
                      <option value="Alpha">Alpha Note</option>
                    </select>
                  </div>
                  <div className="journal-textarea-row">
                    <textarea
                      placeholder="Enter strategy notes, price triggers, target exits, DCA plan..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      className="modal-textarea font-mono"
                      rows={3}
                      required
                    ></textarea>
                  </div>
                  <div className="journal-submit-row">
                    <button type="submit" className="btn-primary btn-sm">
                      <Plus size={14} />
                      <span>Save Trading Note</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Notes List */}
              <div className="profile-section-card glass-panel">
                <div className="card-sub-header">
                  <span className="font-bold text-white">Your Notes History</span>
                  <span className="badge badge-pulse">{tradeNotes.length} notes</span>
                </div>
                {tradeNotes.length === 0 ? (
                  <div className="text-center py-6 text-muted text-xs font-mono">
                    No trading notes added yet. Add strategy notes or reminders above.
                  </div>
                ) : (
                  <div className="notes-list-stack">
                    {tradeNotes.map((n) => (
                      <div key={n.id} className="note-card-item">
                        <div className="note-card-header">
                          <div className="flex items-center gap-2">
                            <span className="note-token-badge font-mono">{n.token}</span>
                            <span className="note-type-chip">{n.type}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="note-timestamp font-mono text-muted text-xs">
                              {n.timestamp}
                            </span>
                            <button
                              className="btn-del-note"
                              onClick={() => {
                                deleteTradeNote(n.id)
                                triggerSound('toggle')
                              }}
                              title="Delete Note"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <p className="note-content-text font-mono">{n.note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: SYNC & BACKUP */}
          {activeTab === 'backup' && (
            <div className="tab-pane-content">
              <div className="profile-section-card glass-panel">
                <div className="card-sub-header">
                  <span className="font-bold text-white">Export & Backup Profile</span>
                  <span className="badge badge-green">JSON Format</span>
                </div>
                <p className="text-xs text-muted mb-3">
                  Export your full profile avatar, cover banner, trading preferences, custom slippage, and trading notes into a backup JSON file.
                </p>
                <button className="btn-primary font-mono" onClick={exportProfileData}>
                  <Download size={15} />
                  <span>Download Backup JSON</span>
                </button>
              </div>

              <div className="profile-section-card glass-panel">
                <div className="card-sub-header">
                  <span className="font-bold text-white">Import Profile from Backup</span>
                </div>
                <p className="text-xs text-muted mb-3">
                  Restore previously saved preferences, avatar, cover banner, and trading notes on another device or browser.
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileImport}
                  accept=".json"
                  style={{ display: 'none' }}
                />
                <button
                  className="btn-secondary font-mono"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={15} />
                  <span>Select JSON File to Restore</span>
                </button>
                {importStatus && (
                  <div className="mt-2 text-xs font-mono text-pulse-green">{importStatus}</div>
                )}
              </div>

              <div className="profile-section-card glass-panel border-red-warning">
                <div className="card-sub-header">
                  <span className="font-bold text-pulse-red">Reset All Settings</span>
                </div>
                <p className="text-xs text-muted mb-3">
                  Reset your profile avatar, DEX preferences, and trading notes back to default settings.
                </p>
                <button
                  className="btn-secondary text-pulse-red font-mono"
                  onClick={() => {
                    if (window.confirm('Are you sure you want to reset all profile data to default?')) {
                      resetProfile()
                      triggerSound('toggle')
                    }
                  }}
                >
                  <RotateCcw size={14} />
                  <span>Reset to Factory Defaults</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="user-profile-modal-footer">
          <div className="footer-left-status">
            <span className="text-muted text-xs">Profile & preferences sync automatically with Vault</span>
          </div>
          <button className="btn-primary" onClick={closeProfileModal}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
