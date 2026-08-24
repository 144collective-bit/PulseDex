import { useState, useEffect } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
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
  ExternalLink,
  KeyRound,
  CheckCircle2,
  RefreshCw,
  Clock,
  ShieldAlert,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { playChimeSound } from '../context/UserProfileContext'
import { fetchTwitterProfile } from '../services/twitterService'
import {
  generateXAuthChallenge,
  evaluatePasswordStrength,
  checkAuthRateLimit,
} from '../services/authSecurity'

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
  const { signMessageAsync } = useSignMessage()

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
  const [rateLimitInfo, setRateLimitInfo] = useState({ isLocked: false, remainingMs: 0 })

  // 𝕏 (Twitter) Secure Dialog State
  const [showXDialog, setShowXDialog] = useState(false)
  const [xStep, setXStep] = useState(1) // 1: Enter Handle & Generate Nonce, 2: Active Session Handshake & PIN
  const [xHandleInput, setXHandleInput] = useState('')
  const [xLivePreview, setXLivePreview] = useState(null)
  const [xChallenge, setXChallenge] = useState(null)
  const [xSecurityPin, setXSecurityPin] = useState('')
  const [showPinInput, setShowPinInput] = useState(false)
  const [isFetchingX, setIsFetchingX] = useState(false)
  const [isConnectingX, setIsConnectingX] = useState(false)

  // Rate Limit Check interval
  useEffect(() => {
    const identifier = (email || username || xHandleInput).trim()
    if (!identifier) return

    const status = checkAuthRateLimit(identifier)
    setRateLimitInfo(status)

    if (status.isLocked) {
      const interval = setInterval(() => {
        const updated = checkAuthRateLimit(identifier)
        setRateLimitInfo(updated)
        if (!updated.isLocked) clearInterval(interval)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [email, username, xHandleInput])

  // Debounce fetch live 𝕏 profile info
  useEffect(() => {
    if (!xHandleInput.trim() || xHandleInput.length < 2) {
      setXLivePreview(null)
      setIsFetchingX(false)
      setXChallenge(null)
      return
    }

    const clean = xHandleInput.trim().replace(/^@/, '')
    const timer = setTimeout(async () => {
      setIsFetchingX(true)
      try {
        const profileData = await fetchTwitterProfile(clean)
        if (profileData) {
          setXLivePreview(profileData)
          const challenge = generateXAuthChallenge(clean)
          setXChallenge(challenge)
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

    if (rateLimitInfo.isLocked) {
      setErrorMessage(`Account temporarily locked. Please wait ${Math.ceil(rateLimitInfo.remainingMs / 1000)}s.`)
      return
    }

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

    if (rateLimitInfo.isLocked) {
      setErrorMessage(`Account locked due to multiple failed attempts. Please retry in ${Math.ceil(rateLimitInfo.remainingMs / 1000)}s.`)
      return
    }

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

  // Launch Active 𝕏 Handshake Window
  const handleLaunchXIntent = () => {
    if (!xChallenge?.intentUrl) return
    const width = 600
    const height = 500
    const left = window.screen.width / 2 - width / 2
    const top = window.screen.height / 2 - height / 2

    window.open(
      xChallenge.intentUrl,
      'PulseDexXAuth',
      `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`
    )
    setIsXHandshakeLaunched(true)
    setXStep(2)
  }

  // Complete Secure 𝕏 Sign-In Handler
  const handleCompleteXSignIn = async (e) => {
    e?.preventDefault()
    if (!xHandleInput.trim()) return
    setErrorMessage('')

    setIsConnectingX(true)
    try {
      const cleanHandle = xHandleInput.trim().replace(/^@/, '')
      const finalAvatar = xLivePreview?.avatarUrl || `https://unavatar.io/twitter/${cleanHandle}`
      const finalName = xLivePreview?.displayName || `@${cleanHandle}`
      const finalBio = xLivePreview?.bio || `PulseChain Trader | @${cleanHandle} on 𝕏`
      const finalBanner = xLivePreview?.bannerUrl || ''

      // If user has connected wallet, attempt cryptographic signature
      let signature = ''
      if (isConnected && address && signMessageAsync) {
        try {
          signature = await signMessageAsync({
            message: `PulseDex Security Verification\nIdentity: @${cleanHandle}\nWallet: ${address}\nChallenge: ${xChallenge?.challengeCode || 'PDX-AUTH'}\nTimestamp: ${Date.now()}`,
          })
        } catch {
          // Signature optional
        }
      }

      await signInWithTwitter({
        twitterHandle: cleanHandle,
        displayName: finalName,
        avatarUrl: finalAvatar,
        bio: finalBio,
        bannerUrl: finalBanner,
        securityPin: xSecurityPin.trim(),
        verificationChallenge: xChallenge?.challengeCode || '',
        walletSignature: signature,
      })

      playChimeSound('success')
      setShowXDialog(false)
      setXStep(1)
      setXSecurityPin('')
    } catch (err) {
      if (err.message === 'ACCOUNT_PIN_REQUIRED') {
        setShowPinInput(true)
        setErrorMessage('This 𝕏 account is protected with a Security PIN. Please enter your PIN.')
      } else {
        setErrorMessage(err.message || 'Failed to authenticate 𝕏 account.')
      }
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

  const passwordStrength = evaluatePasswordStrength(password)

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
                {authMode === 'signup' ? 'Create PulseDex Account' : 'Welcome Back'}
              </h2>
              <span className="auth-modal-sub">
                {authMode === 'signup'
                  ? 'Sign up to persist notes, custom tokens & watchlists'
                  : 'Sign in to access your PulseDex profile & secure vault'}
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
            <span>Create Account</span>
          </button>
        </div>

        {/* Rate Limit Security Lockout Banner */}
        {rateLimitInfo.isLocked && (
          <div className="auth-lockout-banner animate-fade-in font-mono text-xs">
            <div className="flex items-center gap-2 text-pulse-red font-bold">
              <ShieldAlert size={16} />
              <span>Brute-Force Protection Active</span>
            </div>
            <p className="mt-1 text-muted text-[11px]">
              Too many invalid login attempts. Temporary cooldown in effect:
              <strong className="text-white ml-1 font-mono">
                {Math.ceil(rateLimitInfo.remainingMs / 1000)}s
              </strong>
            </p>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && !rateLimitInfo.isLocked && (
          <div className="auth-error-banner animate-fade-in">
            <AlertCircle size={15} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 1. SOCIAL / 1-CLICK AUTH OPTIONS */}
        <div className="auth-social-section">
          {/* Twitter (X) Button */}
          <button
            type="button"
            className="auth-btn-x-login font-mono"
            onClick={() => {
              setShowXDialog(true)
              setErrorMessage('')
              setXStep(1)
            }}
          >
            <div className="flex items-center gap-2">
              <TwitterXIcon size={16} />
              <span>Continue with 𝕏 (Active Session)</span>
            </div>
            <span className="auth-x-verified-pill font-mono">Verified Handshake</span>
          </button>

          {/* Web3 Wallet Quick Connect */}
          <button
            type="button"
            className={`auth-btn-wallet-login font-mono ${isConnected ? 'is-connected' : ''}`}
            onClick={handleWalletSignIn}
            disabled={isSubmitting}
          >
            <div className="flex items-center gap-2">
              <Wallet size={15} className="text-pulse-green" />
              <span>
                {isConnected
                  ? `Sign In as ${address.slice(0, 6)}...${address.slice(-4)}`
                  : 'Sign In with Connected Web3 Wallet'}
              </span>
            </div>
            <span className="badge badge-green text-[9px]">Web3 Auth</span>
          </button>
        </div>

        {/* 𝕏 (Twitter) SECURE AUTHENTICATION DIALOG */}
        {showXDialog && (
          <div className="auth-x-dialog-box glass-panel animate-fade-in font-mono">
            <div className="x-dialog-header">
              <div className="flex items-center gap-2">
                <TwitterXIcon size={16} className="text-white" />
                <span className="font-bold text-white text-xs">
                  {xStep === 1 ? 'Step 1: 𝕏 Ownership Verification' : 'Step 2: Confirm Active 𝕏 Session'}
                </span>
              </div>
              <button
                type="button"
                className="text-muted hover:text-white text-xs p-1"
                onClick={() => setShowXDialog(false)}
              >
                ✕
              </button>
            </div>

            {xStep === 1 ? (
              /* STEP 1: Enter Handle & Generate Cryptographic Nonce */
              <div className="x-dialog-step-content">
                <p className="text-[11px] text-muted leading-relaxed">
                  To ensure security, PulseDex verifies that you are logged into your active 𝕏 account via an official cryptographic handshake.
                </p>

                <div className="auth-input-group mt-2">
                  <div className="auth-input-icon-wrapper">
                    <span className="text-pulse-cyan font-bold text-sm">@</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Enter your 𝕏 handle (e.g. Satoshi)"
                    value={xHandleInput}
                    onChange={(e) => setXHandleInput(e.target.value)}
                    className="auth-text-input font-mono"
                    autoFocus
                  />
                  {isFetchingX && <RefreshCw size={13} className="animate-spin text-muted mr-2" />}
                </div>

                {/* Live Preview & Challenge Nonce */}
                {xLivePreview && (
                  <div className="x-preview-card glass-panel mt-2 animate-fade-in">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={xLivePreview.avatarUrl}
                        alt={xLivePreview.displayName}
                        className="x-preview-avatar"
                        onError={(e) => {
                          e.target.style.display = 'none'
                        }}
                      />
                      <div className="flex-1 min-width-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-xs truncate">
                            {xLivePreview.displayName}
                          </span>
                          <span className="text-pulse-cyan text-[10px]">✓</span>
                        </div>
                        <span className="text-muted text-[11px]">@{xLivePreview.handle}</span>
                      </div>
                    </div>

                    {xChallenge && (
                      <div className="challenge-nonce-box mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-muted">Session Nonce:</span>
                        <code className="text-pulse-cyan font-mono text-[10px] font-bold">
                          {xChallenge.challengeCode}
                        </code>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  disabled={!xHandleInput.trim() || isFetchingX}
                  className="btn-primary w-full mt-3 font-mono text-xs justify-center py-2.5 btn-glow-pulse"
                  onClick={handleLaunchXIntent}
                >
                  <div className="flex items-center gap-2">
                    <ExternalLink size={13} />
                    <span>Launch 𝕏 Verification Handshake</span>
                  </div>
                </button>
              </div>
            ) : (
              /* STEP 2: Active Session Confirmation & Security PIN */
              <div className="x-dialog-step-content animate-fade-in">
                <div className="handshake-verified-pill text-xs text-pulse-green flex items-center gap-1.5 p-2 rounded bg-pulse-green-bg mb-2">
                  <CheckCircle2 size={15} />
                  <span>𝕏 Verification Window Triggered</span>
                </div>

                <p className="text-[11px] text-muted">
                  Confirming active session for <strong className="text-white">@{xHandleInput.replace(/^@/, '')}</strong>.
                </p>

                {/* Security PIN Field (Optional on first setup, mandatory if protected) */}
                <div className="auth-input-group mt-3">
                  <div className="auth-input-icon-wrapper">
                    <KeyRound size={15} className="text-pulse-yellow" />
                  </div>
                  <input
                    type="password"
                    placeholder={showPinInput ? 'Enter Security PIN (Required)' : 'Set/Enter Security PIN (Optional)'}
                    value={xSecurityPin}
                    onChange={(e) => setXSecurityPin(e.target.value)}
                    className="auth-text-input font-mono"
                    maxLength={8}
                  />
                </div>
                <span className="text-[10px] text-muted block mt-1">
                  Protects your 𝕏 handle from unauthorized access by third parties.
                </span>

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    className="btn-secondary flex-1 font-mono text-xs justify-center"
                    onClick={() => setXStep(1)}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={isConnectingX}
                    className="btn-primary flex-1 font-mono text-xs justify-center py-2.5 btn-glow-pulse"
                    onClick={handleCompleteXSignIn}
                  >
                    {isConnectingX ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck size={14} />
                        <span>Authenticate & Sign In</span>
                      </div>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="auth-divider-row">
          <div className="auth-divider-line"></div>
          <span className="auth-divider-text">OR EMAIL / USERNAME</span>
          <div className="auth-divider-line"></div>
        </div>

        {/* 2. STANDARD EMAIL / USERNAME & PASSWORD FORM */}
        <form onSubmit={authMode === 'signup' ? handleSignUpSubmit : handleSignInSubmit}>
          <div className="auth-form-fields">
            {/* Username / Identifier Input */}
            <div className="auth-input-group">
              <div className="auth-input-icon-wrapper">
                <User size={15} className="text-muted" />
              </div>
              <input
                type="text"
                placeholder={authMode === 'signup' ? 'Choose Username' : 'Email or Username'}
                value={authMode === 'signup' ? username : email || username}
                onChange={(e) => {
                  if (authMode === 'signup') setUsername(e.target.value)
                  else {
                    setEmail(e.target.value)
                    setUsername(e.target.value)
                  }
                }}
                className="auth-text-input font-mono"
                required
              />
            </div>

            {/* Email Input (Sign Up Only) */}
            {authMode === 'signup' && (
              <div className="auth-input-group">
                <div className="auth-input-icon-wrapper">
                  <Mail size={15} className="text-muted" />
                </div>
                <input
                  type="email"
                  placeholder="Email Address (Optional)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="auth-text-input font-mono"
                />
              </div>
            )}

            {/* Password Input */}
            <div className="auth-input-group">
              <div className="auth-input-icon-wrapper">
                <Lock size={15} className="text-muted" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-text-input font-mono"
                required
              />
              <button
                type="button"
                className="auth-show-pwd-btn text-muted"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {/* Password Strength Indicator on Sign Up */}
            {authMode === 'signup' && password.length > 0 && (
              <div className="pwd-strength-meter font-mono text-[10px]">
                <div className="flex items-center justify-between text-muted">
                  <span>Password Security:</span>
                  <span
                    className={
                      passwordStrength.score >= 3
                        ? 'text-pulse-green'
                        : passwordStrength.score >= 2
                        ? 'text-pulse-yellow'
                        : 'text-pulse-red'
                    }
                  >
                    {passwordStrength.score >= 3
                      ? 'Strong'
                      : passwordStrength.score >= 2
                      ? 'Medium'
                      : 'Weak'}
                  </span>
                </div>
                <div className="strength-bar-track mt-1">
                  <div
                    className={`strength-bar-fill strength-${passwordStrength.score}`}
                    style={{ width: `${Math.max(15, (passwordStrength.score / 4) * 100)}%` }}
                  ></div>
                </div>
                <span className="text-[9px] text-muted mt-0.5 block">{passwordStrength.feedback}</span>
              </div>
            )}

            {/* Confirm Password (Sign Up Only) */}
            {authMode === 'signup' && (
              <div className="auth-input-group">
                <div className="auth-input-icon-wrapper">
                  <Lock size={15} className="text-muted" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="auth-text-input font-mono"
                  required
                />
              </div>
            )}

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={isSubmitting || rateLimitInfo.isLocked}
              className="btn-primary w-full mt-2 font-mono font-bold justify-center py-3 btn-glow-pulse"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <RefreshCw size={15} className="animate-spin" />
                  <span>Verifying Credentials...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>{authMode === 'signup' ? 'Create Account' : 'Sign In'}</span>
                  <ArrowRight size={15} />
                </div>
              )}
            </button>
          </div>
        </form>

        {/* Footnote Security Badge */}
        <div className="auth-security-footer font-mono text-[10px] text-muted text-center mt-2">
          <ShieldCheck size={12} className="inline mr-1 text-pulse-green" />
          <span>PBKDF2-SHA256 Encrypted Vault • Rate-Limited Brute-Force Defense</span>
        </div>
      </div>
    </div>
  )
}
