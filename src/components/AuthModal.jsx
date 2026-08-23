import { useState, useEffect, useMemo } from 'react'
import { useAccount } from 'wagmi'
import {
  X,
  UserPlus,
  LogIn,
  Wallet,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  AlertCircle,
  Lock,
  User,
  Mail,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { PRESET_AVATARS, playChimeSound } from '../context/UserProfileContext'
import { fetchTwitterProfile } from '../services/twitterService'

// Twitter (X) SVG Icon Component
function TwitterXIcon({ size = 16, className = '' }) {
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

export default function AuthModal() {
  const { address, isConnected } = useAccount()
  const {
    isAuthModalOpen,
    authMode,
    setAuthMode,
    closeAuthModal,
    signUp,
    signIn,
    signInWithWallet,
    signInWithTwitter,
  } = useAuth()

  // Form States
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedAvatarId, setSelectedAvatarId] = useState('cyber-pulse')
  const [linkCurrentWallet, setLinkCurrentWallet] = useState(true)
  const [agreeTerms, setAgreeTerms] = useState(true)

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Twitter Dialog Modal State
  const [showTwitterAuthDialog, setShowTwitterAuthDialog] = useState(false)
  const [twitterInputHandle, setTwitterInputHandle] = useState('')
  const [twitterDisplayName, setTwitterDisplayName] = useState('')
  const [isTwitterConnecting, setIsTwitterConnecting] = useState(false)
  const [twitterLivePreview, setTwitterLivePreview] = useState(null)
  const [isFetchingXPreview, setIsFetchingXPreview] = useState(false)

  // Password strength calculation
  const passwordStrength = useMemo(() => {
    if (!password) return { score: 0, label: '', color: '' }
    let score = 0
    if (password.length >= 6) score += 1
    if (password.length >= 10) score += 1
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) score += 1
    if (/[^A-Za-z0-9]/.test(password)) score += 1

    if (score === 1) return { score: 25, label: 'Weak', color: '#f43f5e' }
    if (score === 2) return { score: 50, label: 'Fair', color: '#fbbf24' }
    if (score === 3) return { score: 75, label: 'Strong', color: '#00e5ff' }
    return { score: 100, label: 'Pulse-Grade', color: '#00ff9d' }
  }, [password])

  const handleSignUpSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')

    if (!username.trim() || username.length < 3) {
      setErrorMessage('Username must be at least 3 characters long.')
      return
    }

    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.')
      return
    }

    if (!agreeTerms) {
      setErrorMessage('Please accept the Terms of Service.')
      return
    }

    setIsSubmitting(true)
    try {
      await signUp({
        username: username.trim(),
        displayName: displayName.trim() || username.trim(),
        email: email.trim(),
        password,
        avatarId: selectedAvatarId,
        linkedWallet: linkCurrentWallet && isConnected ? address : '',
      })
      playChimeSound('success')
    } catch (err) {
      setErrorMessage(err.message || 'Failed to create account. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSignInSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')

    if (!username.trim() || !password) {
      setErrorMessage('Please enter both your username/email and password.')
      return
    }

    setIsSubmitting(true)
    try {
      await signIn({
        identifier: username.trim(),
        password,
      })
      playChimeSound('success')
    } catch (err) {
      setErrorMessage(err.message || 'Incorrect credentials. Please verify and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleWalletSignIn = async () => {
    setErrorMessage('')
    if (!isConnected || !address) {
      setErrorMessage('Please connect your Web3 wallet first using the top Connect button.')
      return
    }

    setIsSubmitting(true)
    try {
      await signInWithWallet(address)
      playChimeSound('success')
    } catch (err) {
      setErrorMessage(err.message || 'Failed to authenticate wallet account.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Debounce and fetch live X profile details when handle changes
  useEffect(() => {
    if (!twitterInputHandle.trim() || twitterInputHandle.length < 2) {
      setTwitterLivePreview(null)
      setIsFetchingXPreview(false)
      return
    }

    const clean = twitterInputHandle.trim().replace(/^@/, '')
    const timer = setTimeout(async () => {
      setIsFetchingXPreview(true)
      try {
        const profileData = await fetchTwitterProfile(clean)
        if (profileData) {
          setTwitterLivePreview(profileData)
          if (profileData.displayName && profileData.displayName !== `@${clean}` && !twitterDisplayName) {
            setTwitterDisplayName(profileData.displayName)
          }
        }
      } catch (err) {
        console.debug('Error fetching live X preview:', err)
      } finally {
        setIsFetchingXPreview(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [twitterInputHandle, twitterDisplayName])

  const handleTwitterSubmit = async (e) => {
    e.preventDefault()
    if (!twitterInputHandle.trim()) return

    setIsTwitterConnecting(true)
    try {
      const cleanHandle = twitterInputHandle.trim().replace(/^@/, '')
      const finalAvatar = twitterLivePreview?.avatarUrl || `https://unavatar.io/twitter/${cleanHandle}`
      const finalName = twitterDisplayName.trim() || twitterLivePreview?.displayName || `@${cleanHandle}`
      const finalBio = twitterLivePreview?.bio || `PulseChain Trader | @${cleanHandle} on 𝕏`
      const finalBanner = twitterLivePreview?.bannerUrl || ''

      await signInWithTwitter({
        twitterHandle: cleanHandle,
        displayName: finalName,
        avatarUrl: finalAvatar,
        bio: finalBio,
        bannerUrl: finalBanner,
      })
      playChimeSound('success')
      setShowTwitterAuthDialog(false)
    } catch (err) {
      setErrorMessage(err.message || 'Failed to authenticate with X account.')
    } finally {
      setIsTwitterConnecting(false)
    }
  }

  const currentAvatar = PRESET_AVATARS.find((a) => a.id === selectedAvatarId) || PRESET_AVATARS[0]

  if (!isAuthModalOpen) return null

  return (
    <div className="modal-backdrop" onClick={closeAuthModal}>
      <div
        className="auth-modal-card glass-panel font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="auth-modal-header">
          <div className="auth-modal-title-box">
            <div className="auth-icon-badge">
              <ShieldCheck size={22} className="text-pulse-green" />
            </div>
            <div>
              <h2 className="auth-modal-title">
                {authMode === 'signup' ? 'Create PulseDex Account' : 'Welcome Back to PulseDex'}
              </h2>
              <span className="auth-modal-sub">
                {authMode === 'signup'
                  ? 'Sign up to persist custom watchlists, notes & DEX preferences'
                  : 'Sign in to access your synchronized trader profile'}
              </span>
            </div>
          </div>

          <button className="wallet-modal-close-btn" onClick={closeAuthModal} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="auth-tabs-bar">
          <button
            className={`auth-tab-btn ${authMode === 'signin' ? 'active' : ''}`}
            onClick={() => {
              setAuthMode('signin')
              setErrorMessage('')
            }}
          >
            <LogIn size={14} />
            <span>Sign In</span>
          </button>

          <button
            className={`auth-tab-btn ${authMode === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setAuthMode('signup')
              setErrorMessage('')
            }}
          >
            <UserPlus size={14} />
            <span>Create Account</span>
            <span className="auth-new-chip">NEW</span>
          </button>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="auth-error-banner">
            <AlertCircle size={15} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="auth-modal-body">
          {/* Twitter Auth Interactive Overlay Dialog */}
          {showTwitterAuthDialog ? (
            <div className="auth-twitter-dialog glass-panel">
              <div className="twitter-dialog-header">
                <div className="twitter-logo-circle">
                  <TwitterXIcon size={22} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base">Authorize with X (Twitter)</h3>
                  <span className="text-xs text-muted">Auto-import your X avatar, display name & bio</span>
                </div>
              </div>

              <form onSubmit={handleTwitterSubmit} className="twitter-auth-form">
                <div className="auth-field">
                  <label className="auth-label">Your X (Twitter) Handle *</label>
                  <div className="auth-input-wrapper">
                    <span className="auth-prefix font-bold text-pulse-cyan">@</span>
                    <input
                      type="text"
                      placeholder="e.g. RichardHeartWin"
                      value={twitterInputHandle}
                      onChange={(e) => setTwitterInputHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      className="auth-input font-mono"
                      required
                      autoFocus
                    />
                    {isFetchingXPreview && <div className="search-spinner mr-2"></div>}
                  </div>
                </div>

                {/* Live X Profile Preview Card */}
                {twitterLivePreview && (
                  <div className="twitter-live-preview-box glass-panel">
                    <div className="twitter-preview-left">
                      <img
                        src={twitterLivePreview.avatarUrl}
                        alt={twitterLivePreview.handle}
                        className="twitter-preview-avatar"
                        onError={(e) => {
                          e.target.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${twitterLivePreview.handle}`
                        }}
                      />
                    </div>
                    <div className="twitter-preview-right">
                      <div className="flex items-center gap-1">
                        <span className="text-white font-bold text-xs">{twitterLivePreview.displayName}</span>
                        <span className="twitter-verified-chip text-xs">✓ 𝕏 Verified</span>
                      </div>
                      <span className="text-muted text-xs font-mono">@{twitterLivePreview.handle}</span>
                      <p className="twitter-preview-bio text-xs">{twitterLivePreview.bio}</p>
                    </div>
                  </div>
                )}

                <div className="auth-field">
                  <label className="auth-label">Custom Display Name (Optional override)</label>
                  <div className="auth-input-wrapper">
                    <User size={15} className="auth-input-icon" />
                    <input
                      type="text"
                      placeholder="e.g. Pulse Whale"
                      value={twitterDisplayName}
                      onChange={(e) => setTwitterDisplayName(e.target.value)}
                      className="auth-input"
                    />
                  </div>
                </div>

                <div className="twitter-actions-row">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowTwitterAuthDialog(false)}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="btn-primary btn-x-signin"
                    disabled={isTwitterConnecting || !twitterInputHandle.trim()}
                  >
                    <TwitterXIcon size={14} />
                    <span>
                      {isTwitterConnecting
                        ? 'Importing from X...'
                        : twitterLivePreview
                        ? `Sign In as @${twitterLivePreview.handle}`
                        : 'Authorize & Sign In'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* Quick Social & Web3 Auth Row (Available on both Sign In & Sign Up) */}
              <div className="auth-social-cta-grid">
                <button
                  type="button"
                  className="btn-x-oauth"
                  onClick={() => setShowTwitterAuthDialog(true)}
                  title="Sign in with your X (Twitter) handle"
                >
                  <TwitterXIcon size={16} />
                  <span>Continue with 𝕏</span>
                </button>

                <button
                  type="button"
                  className="btn-wallet-oauth"
                  onClick={handleWalletSignIn}
                  title="Sign in using your connected PulseChain Web3 wallet"
                >
                  <Wallet size={16} className="text-pulse-green" />
                  <span>Sign In with Wallet</span>
                </button>
              </div>

              <div className="auth-divider">
                <span>OR USE CREDENTIALS</span>
              </div>

              {/* SIGN IN FORM */}
              {authMode === 'signin' && (
                <form onSubmit={handleSignInSubmit} className="auth-form-container">
                  <div className="auth-field">
                    <label className="auth-label">Username or Email</label>
                    <div className="auth-input-wrapper">
                      <User size={15} className="auth-input-icon" />
                      <input
                        type="text"
                        placeholder="Enter your @username or email"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="auth-input font-mono"
                        required
                      />
                    </div>
                  </div>

                  <div className="auth-field">
                    <label className="auth-label">Password</label>
                    <div className="auth-input-wrapper">
                      <Lock size={15} className="auth-input-icon" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="auth-input font-mono"
                        required
                      />
                      <button
                        type="button"
                        className="auth-show-pwd-btn"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary auth-submit-btn btn-glow-pulse"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <span>Authenticating...</span>
                    ) : (
                      <>
                        <LogIn size={15} />
                        <span>Sign In to Account</span>
                      </>
                    )}
                  </button>

                  <div className="auth-footer-prompt">
                    <span>Don't have an account yet?</span>
                    <button
                      type="button"
                      className="auth-switch-link"
                      onClick={() => {
                        setAuthMode('signup')
                        setErrorMessage('')
                      }}
                    >
                      Create one now
                    </button>
                  </div>
                </form>
              )}

              {/* SIGN UP FORM */}
              {authMode === 'signup' && (
                <form onSubmit={handleSignUpSubmit} className="auth-form-container">
                  {/* Top Avatar Preview & Selector */}
                  <div className="auth-avatar-header-row">
                    <div
                      className="auth-selected-avatar"
                      style={{
                        background: currentAvatar.bg,
                        boxShadow: `0 0 16px ${currentAvatar.glowColor}88`,
                      }}
                    >
                      <span>{currentAvatar.icon}</span>
                    </div>
                    <div className="auth-avatar-picker-mini">
                      <span className="text-xs text-muted mb-1 block">Choose Initial Avatar:</span>
                      <div className="avatar-mini-chips">
                        {PRESET_AVATARS.map((av) => (
                          <button
                            key={av.id}
                            type="button"
                            className={`mini-av-chip ${selectedAvatarId === av.id ? 'active' : ''}`}
                            onClick={() => setSelectedAvatarId(av.id)}
                            title={av.name}
                            style={{
                              background: av.bg,
                              borderColor: selectedAvatarId === av.id ? av.glowColor : 'transparent',
                            }}
                          >
                            {av.icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="auth-fields-grid">
                    {/* Username */}
                    <div className="auth-field">
                      <label className="auth-label">Username Handle *</label>
                      <div className="auth-input-wrapper">
                        <span className="auth-prefix font-bold text-pulse-cyan">@</span>
                        <input
                          type="text"
                          placeholder="e.g. pulse_whale"
                          value={username}
                          onChange={(e) =>
                            setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))
                          }
                          className="auth-input font-mono"
                          maxLength={24}
                          required
                        />
                      </div>
                    </div>

                    {/* Display Name */}
                    <div className="auth-field">
                      <label className="auth-label">Display Name</label>
                      <div className="auth-input-wrapper">
                        <User size={15} className="auth-input-icon" />
                        <input
                          type="text"
                          placeholder="e.g. Diamond Trader"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="auth-input"
                          maxLength={32}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="auth-field">
                    <label className="auth-label">Email Address (Optional for alerts)</label>
                    <div className="auth-input-wrapper">
                      <Mail size={15} className="auth-input-icon" />
                      <input
                        type="email"
                        placeholder="trader@pulsechain.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="auth-input font-mono"
                      />
                    </div>
                  </div>

                  <div className="auth-fields-grid">
                    {/* Password */}
                    <div className="auth-field">
                      <label className="auth-label">Password *</label>
                      <div className="auth-input-wrapper">
                        <Lock size={15} className="auth-input-icon" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Min 6 characters"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="auth-input font-mono"
                          required
                        />
                        <button
                          type="button"
                          className="auth-show-pwd-btn"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm Password */}
                    <div className="auth-field">
                      <label className="auth-label">Confirm Password *</label>
                      <div className="auth-input-wrapper">
                        <Lock size={15} className="auth-input-icon" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Re-enter password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="auth-input font-mono"
                          required
                        />
                        <button
                          type="button"
                          className="auth-show-pwd-btn"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Password Strength Bar */}
                  {password && (
                    <div className="password-strength-container">
                      <div className="strength-bar-track">
                        <div
                          className="strength-bar-fill"
                          style={{
                            width: `${passwordStrength.score}%`,
                            backgroundColor: passwordStrength.color,
                            boxShadow: `0 0 10px ${passwordStrength.color}88`,
                          }}
                        ></div>
                      </div>
                      <span
                        className="strength-label font-mono"
                        style={{ color: passwordStrength.color }}
                      >
                        Strength: {passwordStrength.label}
                      </span>
                    </div>
                  )}

                  {/* Link Wallet Option */}
                  {isConnected && (
                    <label className="auth-checkbox-label">
                      <input
                        type="checkbox"
                        checked={linkCurrentWallet}
                        onChange={(e) => setLinkCurrentWallet(e.target.checked)}
                        className="auth-checkbox"
                      />
                      <span>
                        Link connected PulseChain address (
                        <strong className="text-pulse-green font-mono">
                          {address?.slice(0, 6)}...{address?.slice(-4)}
                        </strong>
                        ) to this account
                      </span>
                    </label>
                  )}

                  {/* Agree Terms */}
                  <label className="auth-checkbox-label">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="auth-checkbox"
                      required
                    />
                    <span className="text-xs text-muted">
                      I agree to store my trading profile and preferences locally in PulseDex Vault.
                    </span>
                  </label>

                  <button
                    type="submit"
                    className="btn-primary auth-submit-btn btn-glow-pulse"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <span>Creating Vault Account...</span>
                    ) : (
                      <>
                        <Sparkles size={15} />
                        <span>Complete Sign Up</span>
                      </>
                    )}
                  </button>

                  <div className="auth-footer-prompt">
                    <span>Already registered?</span>
                    <button
                      type="button"
                      className="auth-switch-link"
                      onClick={() => {
                        setAuthMode('signin')
                        setErrorMessage('')
                      }}
                    >
                      Sign in here
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
