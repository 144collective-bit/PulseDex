import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import {
  X,
  UserPlus,
  LogIn,
  Wallet,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertCircle,
  Lock,
  User,
  Mail,
  ArrowRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { playChimeSound } from '../context/UserProfileContext'
import { fetchTwitterProfile } from '../services/twitterService'

// Official X (Twitter) Logo
function TwitterXIcon({ size = 18, className = '' }) {
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

  // Standard Form Fields
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 𝕏 (Twitter) Sign-In Dialog State
  const [showXDialog, setShowXDialog] = useState(false)
  const [xHandleInput, setXHandleInput] = useState('')
  const [xLivePreview, setXLivePreview] = useState(null)
  const [isFetchingX, setIsFetchingX] = useState(false)
  const [isConnectingX, setIsConnectingX] = useState(false)

  // Debounce fetch live 𝕏 profile info
  useEffect(() => {
    if (!xHandleInput.trim() || xHandleInput.length < 2) {
      setXLivePreview(null)
      setIsFetchingX(false)
      return
    }

    const clean = xHandleInput.trim().replace(/^@/, '')
    const timer = setTimeout(async () => {
      setIsFetchingX(true)
      try {
        const profileData = await fetchTwitterProfile(clean)
        if (profileData) {
          setXLivePreview(profileData)
        }
      } catch (err) {
        console.debug('Error resolving 𝕏 preview:', err)
      } finally {
        setIsFetchingX(false)
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [xHandleInput])

  // Normal Sign Up Handler
  const handleSignUpSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')

    if (!email.trim() && !username.trim()) {
      setErrorMessage('Please enter an email or username.')
      return
    }

    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.')
      return
    }

    // Auto-generate username from email if not explicitly provided
    let finalUsername = username.trim()
    if (!finalUsername && email.includes('@')) {
      finalUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '')
    }
    if (!finalUsername) {
      finalUsername = `trader_${Math.floor(Math.random() * 90000 + 10000)}`
    }

    setIsSubmitting(true)
    try {
      await signUp({
        username: finalUsername,
        displayName: finalUsername,
        email: email.trim(),
        password,
        linkedWallet: isConnected && address ? address : '',
      })
      playChimeSound('success')
    } catch (err) {
      setErrorMessage(err.message || 'Failed to create account. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Normal Sign In Handler
  const handleSignInSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')

    const identifier = (email || username).trim()
    if (!identifier || !password) {
      setErrorMessage('Please enter your email/username and password.')
      return
    }

    setIsSubmitting(true)
    try {
      await signIn({
        identifier,
        password,
      })
      playChimeSound('success')
    } catch (err) {
      setErrorMessage(err.message || 'Invalid credentials. Please verify and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 1-Click 𝕏 Sign-In Handler
  const handleXSignIn = async (e) => {
    e?.preventDefault()
    if (!xHandleInput.trim()) return

    setIsConnectingX(true)
    try {
      const cleanHandle = xHandleInput.trim().replace(/^@/, '')
      const finalAvatar = xLivePreview?.avatarUrl || `https://unavatar.io/twitter/${cleanHandle}`
      const finalName = xLivePreview?.displayName || `@${cleanHandle}`
      const finalBio = xLivePreview?.bio || `PulseChain Trader | @${cleanHandle} on 𝕏`
      const finalBanner = xLivePreview?.bannerUrl || ''

      await signInWithTwitter({
        twitterHandle: cleanHandle,
        displayName: finalName,
        avatarUrl: finalAvatar,
        bio: finalBio,
        bannerUrl: finalBanner,
      })
      playChimeSound('success')
      setShowXDialog(false)
    } catch (err) {
      setErrorMessage(err.message || 'Failed to sign in with 𝕏 account.')
    } finally {
      setIsConnectingX(false)
    }
  }

  // Web3 Wallet Sign-In
  const handleWalletSignIn = async () => {
    setErrorMessage('')
    if (!isConnected || !address) {
      setErrorMessage('Please connect your Web3 wallet first.')
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
                {authMode === 'signup' ? 'Create Account' : 'Welcome Back'}
              </h2>
              <span className="auth-modal-sub">
                {authMode === 'signup'
                  ? 'Sign up to save watchlists, notes & preferences'
                  : 'Sign in to access your PulseDex profile'}
              </span>
            </div>
          </div>

          <button className="wallet-modal-close-btn" onClick={closeAuthModal} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Modal Tab Switcher */}
        <div className="auth-tabs-bar">
          <button
            className={`auth-tab-btn ${authMode === 'signin' ? 'active' : ''}`}
            onClick={() => {
              setAuthMode('signin')
              setErrorMessage('')
              setShowXDialog(false)
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
              setShowXDialog(false)
            }}
          >
            <UserPlus size={14} />
            <span>Sign Up</span>
          </button>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="auth-error-banner">
            <AlertCircle size={15} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="auth-modal-body">
          {/* 𝕏 (Twitter) Instant Sign-In Modal Flow */}
          {showXDialog ? (
            <div className="auth-twitter-dialog glass-panel">
              <div className="twitter-dialog-header">
                <div className="twitter-logo-circle">
                  <TwitterXIcon size={20} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">Sign in with 𝕏</h3>
                  <span className="text-xs text-muted">Enter your handle to link your 𝕏 profile</span>
                </div>
              </div>

              <form onSubmit={handleXSignIn} className="twitter-auth-form">
                <div className="auth-field">
                  <label className="auth-label">Your 𝕏 (Twitter) Handle</label>
                  <div className="auth-input-wrapper">
                    <span className="auth-prefix font-bold text-pulse-cyan">@</span>
                    <input
                      type="text"
                      placeholder="e.g. RichardHeartWin"
                      value={xHandleInput}
                      onChange={(e) => setXHandleInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      className="auth-input font-mono"
                      required
                      autoFocus
                    />
                    {isFetchingX && <div className="search-spinner mr-2"></div>}
                  </div>
                </div>

                {/* Live 𝕏 Preview */}
                {xLivePreview && (
                  <div className="twitter-live-preview-box glass-panel">
                    <img
                      src={xLivePreview.avatarUrl}
                      alt={xLivePreview.handle}
                      className="twitter-preview-avatar"
                      onError={(e) => {
                        e.target.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${xLivePreview.handle}`
                      }}
                    />
                    <div className="twitter-preview-right">
                      <div className="flex items-center gap-1">
                        <span className="text-white font-bold text-xs">{xLivePreview.displayName}</span>
                        <span className="twitter-verified-chip text-xs">✓ 𝕏 Verified</span>
                      </div>
                      <span className="text-muted text-xs font-mono">@{xLivePreview.handle}</span>
                    </div>
                  </div>
                )}

                <div className="twitter-actions-row">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowXDialog(false)}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="btn-primary btn-x-signin"
                    disabled={isConnectingX || !xHandleInput.trim()}
                  >
                    <TwitterXIcon size={14} />
                    <span>
                      {isConnectingX
                        ? 'Connecting...'
                        : xLivePreview
                        ? `Continue as @${xLivePreview.handle}`
                        : 'Sign In with 𝕏'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* Prominent 𝕏 (Twitter) Sign-In Button */}
              <button
                type="button"
                className="btn-x-prominent"
                onClick={() => setShowXDialog(true)}
              >
                <div className="x-btn-inner">
                  <div className="x-btn-icon">
                    <TwitterXIcon size={18} />
                  </div>
                  <span className="x-btn-text">
                    {authMode === 'signup' ? 'Sign up with 𝕏 (Twitter)' : 'Sign in with 𝕏 (Twitter)'}
                  </span>
                </div>
                <ArrowRight size={15} className="x-btn-arrow" />
              </button>

              <div className="auth-divider">
                <span>OR WITH EMAIL</span>
              </div>

              {/* STANDARD SIGN UP FORM */}
              {authMode === 'signup' && (
                <form onSubmit={handleSignUpSubmit} className="auth-form-container">
                  {/* Email */}
                  <div className="auth-field">
                    <label className="auth-label">Email Address</label>
                    <div className="auth-input-wrapper">
                      <Mail size={15} className="auth-input-icon" />
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="auth-input font-mono"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Username (Optional / Handle) */}
                  <div className="auth-field">
                    <label className="auth-label">Username (Optional)</label>
                    <div className="auth-input-wrapper">
                      <span className="auth-prefix font-bold text-pulse-cyan">@</span>
                      <input
                        type="text"
                        placeholder="Choose a username handle"
                        value={username}
                        onChange={(e) =>
                          setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))
                        }
                        className="auth-input font-mono"
                        maxLength={24}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="auth-field">
                    <label className="auth-label">Password</label>
                    <div className="auth-input-wrapper">
                      <Lock size={15} className="auth-input-icon" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Create a password (min. 6 chars)"
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
                    <label className="auth-label">Confirm Password</label>
                    <div className="auth-input-wrapper">
                      <Lock size={15} className="auth-input-icon" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Confirm your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="auth-input font-mono"
                        required
                      />
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="btn-primary auth-submit-btn btn-glow-pulse"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <span>Creating Account...</span>
                    ) : (
                      <>
                        <UserPlus size={15} />
                        <span>Create Account</span>
                      </>
                    )}
                  </button>

                  <div className="auth-footer-prompt">
                    <span>Already have an account?</span>
                    <button
                      type="button"
                      className="auth-switch-link"
                      onClick={() => {
                        setAuthMode('signin')
                        setErrorMessage('')
                      }}
                    >
                      Sign In
                    </button>
                  </div>
                </form>
              )}

              {/* STANDARD SIGN IN FORM */}
              {authMode === 'signin' && (
                <form onSubmit={handleSignInSubmit} className="auth-form-container">
                  {/* Email or Username */}
                  <div className="auth-field">
                    <label className="auth-label">Email or Username</label>
                    <div className="auth-input-wrapper">
                      <User size={15} className="auth-input-icon" />
                      <input
                        type="text"
                        placeholder="Enter your email or username"
                        value={email || username}
                        onChange={(e) => {
                          setEmail(e.target.value)
                          setUsername(e.target.value)
                        }}
                        className="auth-input font-mono"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="auth-field">
                    <label className="auth-label">Password</label>
                    <div className="auth-input-wrapper">
                      <Lock size={15} className="auth-input-icon" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
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

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="btn-primary auth-submit-btn btn-glow-pulse"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <span>Signing In...</span>
                    ) : (
                      <>
                        <LogIn size={15} />
                        <span>Sign In</span>
                      </>
                    )}
                  </button>

                  {/* Wallet 1-Click Option */}
                  {isConnected && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm flex items-center justify-center gap-2 mt-1"
                      onClick={handleWalletSignIn}
                    >
                      <Wallet size={14} className="text-pulse-green" />
                      <span>Sign In with Connected Wallet ({address?.slice(0, 6)}...)</span>
                    </button>
                  )}

                  <div className="auth-footer-prompt">
                    <span>Don't have an account?</span>
                    <button
                      type="button"
                      className="auth-switch-link"
                      onClick={() => {
                        setAuthMode('signup')
                        setErrorMessage('')
                      }}
                    >
                      Sign Up
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
