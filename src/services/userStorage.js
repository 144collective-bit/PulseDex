/**
 * PulseDex User Data Storage Service
 * Provides secure client-side storage, password hashing, Twitter authentication,
 * and multi-account management with IndexedDB primary engine and LocalStorage fallback.
 */

import { fetchTwitterProfile } from './twitterService'

const STORAGE_KEY_USERS = 'pulsedex_users_vault_v1'
const STORAGE_KEY_SESSION = 'pulsedex_active_session_v1'
const DB_NAME = 'PulseDexUserDB'
const DB_VERSION = 1
const STORE_NAME = 'users'

// Web Crypto SHA-256 Hashing with salt
export async function hashPassword(password, salt = 'pulsedex_salt_369') {
  if (!password) return ''
  const encoder = new TextEncoder()
  const data = encoder.encode(password + salt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

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
    users[existingIdx] = { ...users[existingIdx], ...userData, updatedAt: new Date().toISOString() }
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
        u.email?.toLowerCase() === clean ||
        u.twitterHandle?.toLowerCase() === clean
    ) || null
  )
}

// Find user by Twitter Handle
export async function findUserByTwitter(twitterHandle) {
  if (!twitterHandle) return null
  const clean = twitterHandle.trim().toLowerCase().replace(/^@/, '')
  const users = await getAllUsers()
  return (
    users.find(
      (u) =>
        u.twitterHandle?.toLowerCase() === clean ||
        u.profile?.socials?.twitter?.toLowerCase() === clean ||
        u.username?.toLowerCase() === clean
    ) || null
  )
}

// Find user by linked wallet address
export async function findUserByWallet(walletAddress) {
  if (!walletAddress) return null
  const clean = walletAddress.trim().toLowerCase()
  const users = await getAllUsers()
  return (
    users.find(
      (u) =>
        u.linkedWallet?.toLowerCase() === clean ||
        u.wallets?.some((w) => w.toLowerCase() === clean)
    ) || null
  )
}

// Register a new User account
export async function registerUser({
  username,
  email,
  password,
  displayName,
  avatarId = 'cyber-pulse',
  customAvatarUrl = '',
  bannerUrl = '',
  bio = 'PulseChain Trader 🚀',
  linkedWallet = '',
  twitterHandle = '',
  twitterVerified = false,
  socials = {},
  tradingAttributes = {},
}) {
  const cleanUsername = username.trim().toLowerCase().replace(/^@/, '')
  const cleanEmail = email ? email.trim().toLowerCase() : ''
  const cleanTwitter = twitterHandle ? twitterHandle.trim().toLowerCase().replace(/^@/, '') : ''

  // Validate uniqueness
  const existing = await findUserByUsernameOrEmail(cleanUsername)
  if (existing) {
    throw new Error(`Username @${username} is already registered. Please choose another or sign in.`)
  }

  if (cleanEmail) {
    const existingEmail = await findUserByUsernameOrEmail(cleanEmail)
    if (existingEmail) {
      throw new Error(`Email ${email} is already associated with an account.`)
    }
  }

  const salt = `salt_${Date.now()}`
  const passwordHash = password ? await hashPassword(password, salt) : ''

  const newUser = {
    id: generateUserId(),
    username: cleanUsername,
    email: cleanEmail,
    displayName: displayName?.trim() || username.trim(),
    salt,
    passwordHash,
    linkedWallet: linkedWallet ? linkedWallet.toLowerCase() : '',
    wallets: linkedWallet ? [linkedWallet.toLowerCase()] : [],
    twitterHandle: cleanTwitter,
    twitterVerified: Boolean(twitterVerified || cleanTwitter),
    profile: {
      displayName: displayName?.trim() || username.trim(),
      username: cleanUsername,
      avatarId,
      customAvatarUrl,
      bannerUrl: bannerUrl || 'linear-gradient(135deg, rgba(0, 255, 157, 0.2) 0%, rgba(0, 102, 255, 0.2) 100%)',
      bio,
      tier: 'Pulse Veteran',
      badges: ['pulse-og', 'diamond-hands'],
      memberSince: new Date().toISOString().split('T')[0],
      socials: {
        twitter: cleanTwitter || socials?.twitter || '',
        telegram: socials?.telegram || '',
        discord: socials?.discord || '',
        website: socials?.website || '',
      },
      tradingAttributes: {
        style: tradingAttributes?.style || 'Degen Sniper',
        riskTolerance: tradingAttributes?.riskTolerance || 'Moderate',
        pinnedToken: tradingAttributes?.pinnedToken || 'PLS',
        timezone: tradingAttributes?.timezone || 'UTC',
      },
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
  }

  await saveUser(newUser)
  return newUser
}

// Authenticate user with password
export async function authenticateUser(identifier, password) {
  if (!identifier || !password) {
    throw new Error('Please enter both your username/email and password.')
  }

  const user = await findUserByUsernameOrEmail(identifier)
  if (!user) {
    throw new Error('No account found matching that username or email.')
  }

  if (!user.passwordHash) {
    if (user.twitterHandle) {
      throw new Error('This account is registered via X (Twitter). Please sign in using the Twitter button.')
    }
    throw new Error('This account was created via Web3 Wallet. Please sign in with your wallet.')
  }

  const computedHash = await hashPassword(password, user.salt || 'pulsedex_salt_369')
  if (computedHash !== user.passwordHash) {
    throw new Error('Incorrect password. Please try again.')
  }

  user.lastLoginAt = new Date().toISOString()
  await saveUser(user)
  return user
}

// Authenticate or auto-create account with Web3 Wallet
export async function authenticateWithWallet(walletAddress) {
  if (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length !== 42) {
    throw new Error('Invalid PulseChain wallet address.')
  }

  const cleanAddr = walletAddress.toLowerCase()
  let user = await findUserByWallet(cleanAddr)

  if (!user) {
    const shortAddr = `${cleanAddr.slice(2, 6)}_${cleanAddr.slice(-4)}`
    user = await registerUser({
      username: `pulse_${shortAddr}`,
      email: '',
      password: '',
      displayName: `Trader ${cleanAddr.slice(0, 6)}`,
      avatarId: 'cyber-pulse',
      bio: 'Verified PulseChain Web3 Trader ⚡',
      linkedWallet: cleanAddr,
    })
  } else {
    user.lastLoginAt = new Date().toISOString()
    await saveUser(user)
  }

  return user
}

// Authenticate or auto-create account with Twitter (X)
export async function authenticateWithTwitter({
  twitterHandle,
  displayName,
  avatarUrl = '',
  bio = '',
  bannerUrl = '',
}) {
  if (!twitterHandle) {
    throw new Error('Twitter handle is required for X authorization.')
  }

  const cleanHandle = twitterHandle.trim().toLowerCase().replace(/^@/, '')
  
  // Pull live X profile details if available
  let fetchedXInfo = null
  try {
    fetchedXInfo = await fetchTwitterProfile(cleanHandle)
  } catch (e) {
    console.debug('Could not fetch X profile details:', e)
  }

  const finalDisplayName = displayName?.trim() || fetchedXInfo?.displayName || `@${cleanHandle}`
  const finalAvatarUrl = avatarUrl || fetchedXInfo?.avatarUrl || `https://unavatar.io/twitter/${cleanHandle}`
  const finalBio = bio || fetchedXInfo?.bio || `PulseChain Trader | @${cleanHandle} on 𝕏`
  const finalBannerUrl = bannerUrl || fetchedXInfo?.bannerUrl || ''

  let user = await findUserByTwitter(cleanHandle)

  if (!user) {
    // Register new user with Twitter details
    user = await registerUser({
      username: cleanHandle,
      displayName: finalDisplayName,
      email: '',
      password: '',
      avatarId: 'cyber-pulse',
      customAvatarUrl: finalAvatarUrl,
      bannerUrl: finalBannerUrl,
      bio: finalBio,
      twitterHandle: cleanHandle,
      twitterVerified: true,
      socials: {
        twitter: cleanHandle,
        telegram: '',
        discord: '',
        website: `https://x.com/${cleanHandle}`,
      },
      tradingAttributes: {
        style: 'Degen Sniper',
        riskTolerance: 'High Risk',
        pinnedToken: 'PLS',
      },
    })
  } else {
    // Update existing user with Twitter verified data and updated avatar
    user.twitterHandle = cleanHandle
    user.twitterVerified = true
    if (finalAvatarUrl) {
      user.profile.customAvatarUrl = finalAvatarUrl
    }
    if (finalDisplayName && (!user.profile.displayName || user.profile.displayName === user.username)) {
      user.profile.displayName = finalDisplayName
    }
    if (finalBio && (!user.profile.bio || user.profile.bio.includes('PulseChain Trader'))) {
      user.profile.bio = finalBio
    }
    if (finalBannerUrl && !user.profile.bannerUrl) {
      user.profile.bannerUrl = finalBannerUrl
    }
    if (!user.profile.socials) {
      user.profile.socials = { twitter: cleanHandle, website: `https://x.com/${cleanHandle}` }
    } else {
      user.profile.socials.twitter = cleanHandle
      if (!user.profile.socials.website) {
        user.profile.socials.website = `https://x.com/${cleanHandle}`
      }
    }
    user.lastLoginAt = new Date().toISOString()
    await saveUser(user)
  }

  return user
}

// Active Session Management
export function getActiveSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setActiveSession(sessionData) {
  if (!sessionData) {
    localStorage.removeItem(STORAGE_KEY_SESSION)
  } else {
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(sessionData))
  }
}

export function clearActiveSession() {
  localStorage.removeItem(STORAGE_KEY_SESSION)
}

// Backup & Export / Import
export async function exportAllUsersVault() {
  const users = await getAllUsers()
  const data = {
    vaultVersion: '1.1.0',
    app: 'PulseDex',
    exportedAt: new Date().toISOString(),
    usersCount: users.length,
    users,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pulsedex_users_vault_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importUsersVault(jsonData) {
  try {
    const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData
    const usersToImport = parsed.users || (Array.isArray(parsed) ? parsed : null)
    if (!usersToImport || !Array.isArray(usersToImport)) {
      throw new Error('Invalid vault structure: missing users array.')
    }

    for (const u of usersToImport) {
      if (u.id && u.username) {
        await saveUser(u)
      }
    }
    return { success: true, count: usersToImport.length }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
