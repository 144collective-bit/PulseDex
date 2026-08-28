/**
 * PulseDex User Data Storage & Security Service
 * Provides secure client-side storage, PBKDF2 password hashing,
 * session token management, and multi-account security.
 */

import {
  derivePBKDF2Hash,
  generateSecureSessionToken,
  checkAuthRateLimit,
  recordFailedAuthAttempt,
  resetAuthRateLimit,
} from './authSecurity'

const STORAGE_KEY_USERS = 'pulsedex_users_vault_v1'
const STORAGE_KEY_SESSION = 'pulsedex_active_session_v1'
const DB_NAME = 'PulseDexUserDB'
const DB_VERSION = 2
const STORE_NAME = 'users'

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 Days

// Generate unique User ID
export function generateUserId() {
  return 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7)
}

// IndexedDB Helper
function openIndexedDB() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null)
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

// Retrieve all registered users from storage
export async function getAllUsers() {
  try {
    const db = await openIndexedDB()
    if (db) {
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const req = store.getAll()
        req.onsuccess = () => {
          const users = req.result || []
          if (users.length > 0) {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users))
            resolve(users)
          } else {
            const local = localStorage.getItem(STORAGE_KEY_USERS)
            const fallback = local ? JSON.parse(local) : []
            resolve(fallback)
          }
        }
        req.onerror = () => {
          const local = localStorage.getItem(STORAGE_KEY_USERS)
          resolve(local ? JSON.parse(local) : [])
        }
      })
    }
  } catch (err) {
    console.warn('IndexedDB read error, using localStorage fallback:', err)
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// Save or Update a User in Storage
export async function saveUser(userData) {
  if (!userData || !userData.id) return null

  const users = await getAllUsers()
  const existingIdx = users.findIndex((u) => u.id === userData.id)

  if (existingIdx >= 0) {
    users[existingIdx] = {
      ...users[existingIdx],
      ...userData,
      updatedAt: new Date().toISOString(),
    }
  } else {
    users.push({
      ...userData,
      createdAt: userData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  // Save to LocalStorage
  localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users))

  // Save to IndexedDB
  try {
    const db = await openIndexedDB()
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(userData)
    }
  } catch (err) {
    console.warn('IndexedDB write error:', err)
  }

  return userData
}

// Find user by username or email
export async function findUserByUsernameOrEmail(identifier) {
  if (!identifier) return null
  const clean = identifier.trim().toLowerCase().replace(/^@/, '')
  const users = await getAllUsers()
  return (
    users.find(
      (u) =>
        u.username?.toLowerCase() === clean ||
        u.email?.toLowerCase() === clean
    ) || null
  )
}

// Register a new User account
export async function registerUser({
  username,
  email,
  password,
  displayName,
  bio = 'PulseChain Trader 🚀',
  securityPin = '',
}) {
  const cleanUsername = username.trim().toLowerCase().replace(/^@/, '')
  const cleanEmail = email ? email.trim().toLowerCase() : ''

  // Validate uniqueness
  const existing = await findUserByUsernameOrEmail(cleanUsername)
  if (existing) {
    throw new Error(`Username @${username} is already registered. Please sign in instead.`)
  }

  if (cleanEmail) {
    const existingEmail = await findUserByUsernameOrEmail(cleanEmail)
    if (existingEmail) {
      throw new Error(`Email ${email} is already associated with an account.`)
    }
  }

  const salt = `salt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  const passwordHash = password ? await derivePBKDF2Hash(password, salt) : ''
  const securityPinHash = securityPin ? await derivePBKDF2Hash(securityPin, salt) : ''

  const newUser = {
    id: generateUserId(),
    username: cleanUsername,
    email: cleanEmail,
    displayName: displayName?.trim() || username.trim(),
    salt,
    passwordHash,
    securityPinHash,
    isPinProtected: Boolean(securityPin),
    authMethods: {
      hasPassword: Boolean(password),
      hasPin: Boolean(securityPin),
    },
    profile: {
      displayName: displayName?.trim() || username.trim(),
      username: cleanUsername,
      bio,
    },
    preferences: {
      slippage: '0.5',
      customSlippage: '',
      gasPriority: 'fast',
      defaultCurrency: 'USD',
      chartInterval: '15m',
      autoHideSpam: true,
      soundFxEnabled: true,
      privacyMode: false,
      themeColor: 'theme-pulse-neon',
    },
    watchlist: [],
    customTokens: [],
    tradeNotes: [
      {
        id: `note-${Date.now()}`,
        token: 'PLS',
        note: 'Welcome to PulseDex! Your account and trading profile are safely secured.',
        type: 'Alpha',
        timestamp: new Date().toLocaleDateString(),
      },
    ],
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    securityAudit: {
      lastLoginDevice: navigator.userAgent?.substring(0, 80) || 'Unknown Device',
      loginCount: 1,
    },
  }

  await saveUser(newUser)
  return newUser
}

// Authenticate user with username/email & password with brute-force rate limiting
export async function authenticateUser(identifier, password) {
  if (!identifier || !password) {
    throw new Error('Please enter both your username/email and password.')
  }

  // 1. Rate Limit Lockout Check
  const rateLimit = checkAuthRateLimit(identifier)
  if (rateLimit.isLocked) {
    const remainingSec = Math.ceil(rateLimit.remainingMs / 1000)
    throw new Error(
      `Too many failed attempts. Account temporarily locked for security. Please retry in ${remainingSec}s.`
    )
  }

  const user = await findUserByUsernameOrEmail(identifier)
  if (!user) {
    recordFailedAuthAttempt(identifier)
    throw new Error('No account found matching that username or email.')
  }

  if (!user.passwordHash) {
    throw new Error('This account was created via Web3 Wallet. Please sign in with your wallet.')
  }

  const computedHash = await derivePBKDF2Hash(password, user.salt || 'pulsedex_salt_369')
  if (computedHash !== user.passwordHash) {
    const status = recordFailedAuthAttempt(identifier)
    if (status.isLocked) {
      throw new Error('Too many failed attempts. Account locked for 3 minutes for security.')
    }
    const remaining = 5 - status.attempts
    throw new Error(`Incorrect password. ${remaining > 0 ? `${remaining} attempts remaining.` : ''}`)
  }

  // Reset rate limit on success
  resetAuthRateLimit(identifier)

  user.lastLoginAt = new Date().toISOString()
  if (!user.securityAudit) user.securityAudit = {}
  user.securityAudit.lastLoginDevice = navigator.userAgent?.substring(0, 80) || 'Web Browser'
  user.securityAudit.loginCount = (user.securityAudit.loginCount || 0) + 1

  await saveUser(user)
  return user
}

// Active Session Management with Expiry & Cryptographic Token
export function getActiveSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION)
    if (!raw) return null
    const session = JSON.parse(raw)

    // Check 7-Day Session Expiration
    if (session.expiresAt && Date.now() > session.expiresAt) {
      clearActiveSession()
      return null
    }

    return session
  } catch {
    return null
  }
}

export function setActiveSession(sessionData) {
  if (!sessionData) {
    localStorage.removeItem(STORAGE_KEY_SESSION)
  } else {
    const enrichedSession = {
      ...sessionData,
      sessionToken: sessionData.sessionToken || generateSecureSessionToken(),
      signedInAt: sessionData.signedInAt || new Date().toISOString(),
      expiresAt: Date.now() + SESSION_MAX_AGE_MS,
      userAgent: navigator.userAgent?.substring(0, 80) || 'Browser',
    }
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(enrichedSession))
  }
}

export function clearActiveSession() {
  localStorage.removeItem(STORAGE_KEY_SESSION)
}

// Update User Security PIN
export async function setUserSecurityPin(userId, newPin) {
  const users = await getAllUsers()
  const user = users.find((u) => u.id === userId)
  if (!user) throw new Error('User not found')

  if (!newPin || newPin.length < 4) {
    throw new Error('Security PIN must be at least 4 digits.')
  }

  const salt = user.salt || `salt_${Date.now()}`
  user.securityPinHash = await derivePBKDF2Hash(newPin, salt)
  user.isPinProtected = true
  await saveUser(user)
  return user
}
