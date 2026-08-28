/**
 * PulseDex Advanced Authentication & Cryptographic Security Service
 * Implements PBKDF2 password derivation, session tokens, and brute-force rate limiting.
 */

const RATE_LIMIT_KEY = 'pulsedex_auth_ratelimit_v1'
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 3 * 60 * 1000 // 3 minutes

/**
 * Derives a strong PBKDF2-SHA256 hash for password protection
 */
export async function derivePBKDF2Hash(password, salt) {
  if (!password || !salt) return ''
  const encoder = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )

  const saltBuffer = encoder.encode(salt)
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 600000,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  )

  const hashArray = Array.from(new Uint8Array(derivedBits))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generates a cryptographically random session token (256-bit hex)
 */
export function generateSecureSessionToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Checks Rate Limiting for Auth attempts
 * @returns { isLocked: boolean, remainingMs: number, attempts: number }
 */
export function checkAuthRateLimit(identifier) {
  if (!identifier) return { isLocked: false, remainingMs: 0, attempts: 0 }
  const cleanId = identifier.trim().toLowerCase()

  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY)
    const records = raw ? JSON.parse(raw) : {}
    const entry = records[cleanId]

    if (!entry) {
      return { isLocked: false, remainingMs: 0, attempts: 0 }
    }

    const now = Date.now()
    if (entry.lockedUntil && entry.lockedUntil > now) {
      return {
        isLocked: true,
        remainingMs: entry.lockedUntil - now,
        attempts: entry.attempts || MAX_FAILED_ATTEMPTS,
      }
    }

    // Reset if lockout expired
    if (entry.lockedUntil && entry.lockedUntil <= now) {
      delete records[cleanId]
      localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(records))
      return { isLocked: false, remainingMs: 0, attempts: 0 }
    }

    return {
      isLocked: false,
      remainingMs: 0,
      attempts: entry.attempts || 0,
    }
  } catch {
    return { isLocked: false, remainingMs: 0, attempts: 0 }
  }
}

/**
 * Records a failed login attempt for rate limiting
 */
export function recordFailedAuthAttempt(identifier) {
  if (!identifier) return { isLocked: false, remainingMs: 0, attempts: 1 }
  const cleanId = identifier.trim().toLowerCase()

  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY)
    const records = raw ? JSON.parse(raw) : {}
    const now = Date.now()

    const entry = records[cleanId] || { attempts: 0, firstAttemptAt: now }
    entry.attempts += 1
    entry.lastAttemptAt = now

    if (entry.attempts >= MAX_FAILED_ATTEMPTS) {
      entry.lockedUntil = now + LOCKOUT_DURATION_MS
    }

    records[cleanId] = entry
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(records))

    const isLocked = Boolean(entry.lockedUntil && entry.lockedUntil > now)
    return {
      isLocked,
      remainingMs: isLocked ? entry.lockedUntil - now : 0,
      attempts: entry.attempts,
    }
  } catch {
    return { isLocked: false, remainingMs: 0, attempts: 1 }
  }
}

/**
 * Resets failed attempts after successful authentication
 */
export function resetAuthRateLimit(identifier) {
  if (!identifier) return
  const cleanId = identifier.trim().toLowerCase()

  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY)
    if (!raw) return
    const records = JSON.parse(raw)
    delete records[cleanId]
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(records))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Validates password complexity
 * @returns { isValid: boolean, score: number, feedback: string, level: string }
 */
export function evaluatePasswordStrength(password) {
  if (!password) return { isValid: false, score: 0, feedback: 'Password is required.', level: 'Weak' }

  let score = 0
  const feedback = []

  if (password.length >= 8) score += 1
  else feedback.push('At least 8 characters')

  if (/[A-Z]/.test(password)) score += 1
  else feedback.push('An uppercase letter')

  if (/[0-9]/.test(password)) score += 1
  else feedback.push('A number')

  if (/[^A-Za-z0-9]/.test(password)) score += 1
  else feedback.push('A special character')

  let level = 'Weak'
  if (score >= 3 && password.length >= 8) level = 'Strong'
  else if (score >= 2 || password.length >= 6) level = 'Medium'

  return {
    isValid: password.length >= 6,
    score,
    level,
    feedback: feedback.length > 0 ? `Include: ${feedback.join(', ')}` : 'Strong password',
  }
}
