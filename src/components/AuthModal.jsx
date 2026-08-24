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
  KeyRound,
  CheckCircle2,
  Clock,
  Shield,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { playChimeSound } from '../context/UserProfileContext'
import {
  evaluatePasswordStrength,
  checkAuthRateLimit,
} from '../services/authSecurity'

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

  // Rate Limit Check
  useEffect(() => {
    const identifier = (email || username).trim()
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
  }, [email, username])

  if (!isAuthModalOpen) return null

  const pwStrength = evaluatePasswordStrength(password)

  const handleModeSwitch = (newMode) => {
    setAuthMode(newMode)
    setErrorMessage('')
    playChimeSound('toggle')
  }

  // Handle Standard Sign In / Sign Up Form
  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')

    const cleanUsername = username.trim()
    const cleanEmail = email.trim()

    if (authMode === 'signup') {
      if (!cleanUsername || cleanUsername.length < 3) {
        setErrorMessage('Username must be at least 3 characters long.')
        return
      }
      if (!password || password.length < 6) {
        setErrorMessage('Password must be at least 6 characters long.')
        return
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.')
        return
      }

      setIsSubmitting(true)
      try {
        await signUp({
          username: cleanUsername,
          email: cleanEmail,
          password,
          walletAddress: isConnected ? address : null,
        })
        playChimeSound('success')
        closeAuthModal()
      } catch (err) {
        setErrorMessage(err.message || 'Registration failed.')
      } finally {
        setIsSubmitting(false)
      }
    } else {
      // Sign In
      const identifier = cleanUsername || cleanEmail
      if (!identifier) {
        setErrorMessage('Please enter your username or email.')
        return
      }
      if (!password) {
        setErrorMessage('Please enter your password.')
        return
      }

      setIsSubmitting(true)
      try {
        await signIn({ identifier, password })
        playChimeSound('success')
        closeAuthModal()
      } catch (err) {
        setErrorMessage(err.message || 'Authentication failed.')
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  // 1-Click Sign In with Web3 Wallet
  const handleWalletSignIn = async () => {
    if (!isConnected || !address) {
      setErrorMessage('Please connect your Web3 wallet first.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')
    try {
      if (signMessageAsync) {
        await signMessageAsync({
          message: `PulseDex Secure Sign In\nWallet: ${address}\nTimestamp: ${new Date().toISOString()}`,
        })
      }
      await signInWithWallet(address)
      playChimeSound('success')
      closeAuthModal()
    } catch (err) {
      if (err.name === 'UserRejectedRequestError' || err.message?.includes('rejected')) {
        setErrorMessage('Signature cancelled by user.')
      } else {
        setErrorMessage(err.message || 'Wallet authentication failed.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop-overlay animate-fade-in" onClick={closeAuthModal}>
      <div
        className="modal-container auth-modal-container glass-panel animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header auth-modal-header">
          <div className="flex items-center gap-2">
            <div className="auth-header-icon-badge">
              <ShieldCheck size={18} className="text-pulse-cyan" />
            </div>
            <div>
              <h2 className="modal-title font-mono">
                {authMode === 'signup' ? 'Create PulseDex Account' : 'Sign In to PulseDex'}
              </h2>
              <p className="modal-subtitle text-xs text-muted">
                {authMode === 'signup'
                  ? 'Access your encrypted portfolio, notes & saved watchlists'
                  : 'Welcome back! Enter your credentials to continue'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={closeAuthModal}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Brute Force Rate Limit Lockout Banner */}
        {rateLimitInfo.isLocked && (
          <div className="auth-lockout-banner animate-fade-in font-mono">
            <div className="flex items-center gap-2 text-pulse-red">
              <Clock size={15} />
              <span className="font-bold">Security Lockout Active</span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Too many failed login attempts. Retry in{' '}
              <span className="text-pulse-yellow font-bold">
                {Math.ceil(rateLimitInfo.remainingMs / 1000)}s
              </span>
            </p>
          </div>
        )}

        {/* Segment Tabs (Sign In vs Sign Up) */}
        <div className="auth-mode-switch-pills font-mono">
          <button
            type="button"
            className={`auth-mode-pill ${authMode === 'signin' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('signin')}
          >
            <LogIn size={14} />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            className={`auth-mode-pill ${authMode === 'signup' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('signup')}
          >
            <UserPlus size={14} />
            <span>Sign Up</span>
          </button>
        </div>

        {/* Error Alert Message */}
        {errorMessage && (
          <div className="auth-error-alert animate-fade-in font-mono">
            <AlertCircle size={15} className="flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="auth-form font-mono">
          <div className="form-group">
            <label className="form-label">
              {authMode === 'signup' ? 'Username' : 'Username or Email'}
            </label>
            <div className="input-with-icon">
              <User size={15} className="input-icon text-muted" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={authMode === 'signup' ? 'e.g. pulse_whale' : 'Enter username or email'}
                className="form-input"
                autoComplete="username"
                disabled={isSubmitting || rateLimitInfo.isLocked}
                required
                autoFocus
              />
            </div>
          </div>

          {authMode === 'signup' && (
            <div className="form-group animate-fade-in">
              <label className="form-label">Email Address (Optional)</label>
              <div className="input-with-icon">
                <Mail size={15} className="input-icon text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="form-input"
                  autoComplete="email"
                  disabled={isSubmitting || rateLimitInfo.isLocked}
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <div className="flex items-center justify-between">
              <label className="form-label">Password</label>
              {authMode === 'signup' && password && (
                <span className={`text-[11px] font-bold ${
                  pwStrength.level === 'Strong' ? 'text-pulse-green' :
                  pwStrength.level === 'Medium' ? 'text-pulse-yellow' : 'text-pulse-red'
                }`}>
                  {pwStrength.level} Password
                </span>
              )}
            </div>
            <div className="input-with-icon">
              <Lock size={15} className="input-icon text-muted" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password (min 6 chars)"
                className="form-input"
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                disabled={isSubmitting || rateLimitInfo.isLocked}
                required
              />
              <button
                type="button"
                className="input-eye-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {authMode === 'signup' && (
            <div className="form-group animate-fade-in">
              <label className="form-label">Confirm Password</label>
              <div className="input-with-icon">
                <Lock size={15} className="input-icon text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="form-input"
                  autoComplete="new-password"
                  disabled={isSubmitting || rateLimitInfo.isLocked}
                  required
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="btn-primary auth-submit-btn btn-glow-pulse font-mono mt-2"
            disabled={isSubmitting || rateLimitInfo.isLocked}
          >
            {isSubmitting ? (
              <span>Processing...</span>
            ) : authMode === 'signup' ? (
              <>
                <span>Create Account & Vault</span>
                <ArrowRight size={15} />
              </>
            ) : (
              <>
                <span>Sign In to PulseDex</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Toggle Switch Callout (Sign In <-> Sign Up) */}
        <div className="auth-mode-toggle-callout font-mono">
          {authMode === 'signin' ? (
            <div className="flex items-center justify-between w-full">
              <span className="text-muted text-xs">Don't have an account yet?</span>
              <button
                type="button"
                className="auth-toggle-action-btn"
                onClick={() => handleModeSwitch('signup')}
              >
                <UserPlus size={13} className="text-pulse-green" />
                <span>Sign Up Free</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-muted text-xs">Already have an account?</span>
              <button
                type="button"
                className="auth-toggle-action-btn"
                onClick={() => handleModeSwitch('signin')}
              >
                <LogIn size={13} className="text-pulse-cyan" />
                <span>Sign In to Vault</span>
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="auth-divider">
          <span>OR QUICK ACCESS</span>
        </div>

        {/* Web3 Wallet Quick Sign In */}
        <button
          type="button"
          className="auth-wallet-btn font-mono"
          onClick={handleWalletSignIn}
          disabled={isSubmitting}
        >
          <Wallet size={16} className="text-pulse-green" />
          <span>
            {isConnected && address
              ? `Sign In with Wallet (${address.slice(0, 6)}...${address.slice(-4)})`
              : 'Connect & Sign In with Web3 Wallet'}
          </span>
        </button>

        {/* Footer info */}
        <div className="auth-modal-footer font-mono">
          <Shield size={12} className="text-pulse-cyan" />
          <span>Encrypted Vault Security • PBKDF2 Password Protection</span>
        </div>
      </div>
    </div>
  )
}
