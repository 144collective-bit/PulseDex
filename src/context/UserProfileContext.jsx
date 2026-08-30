import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useSiweAuth } from './SiweAuthContext'
import { readScoped, writeScoped, storageKey, purgeLegacyKeys } from '../utils/profileStorage'

const UserProfileContext = createContext(null)

// Curated preset avatars with distinct themes and colors
export const PRESET_AVATARS = [
  {
    id: 'cyber-pulse',
    name: 'Cyber Pulse',
    bg: 'linear-gradient(135deg, #00ff9d 0%, #0066ff 100%)',
    icon: '⚡',
    glowColor: '#00ff9d',
  },
  {
    id: 'hexican-og',
    name: 'Hexican OG',
    bg: 'linear-gradient(135deg, #ff007a 0%, #7928ca 100%)',
    icon: '💎',
    glowColor: '#ff007a',
  },
  {
    id: 'neon-bull',
    name: 'Neon Bull',
    bg: 'linear-gradient(135deg, #00e5ff 0%, #8a2be2 100%)',
    icon: '🐂',
    glowColor: '#00e5ff',
  },
  {
    id: 'pulsex-bot',
    name: 'PulseX Bot',
    bg: 'linear-gradient(135deg, #fbbf24 0%, #d946ef 100%)',
    icon: '🤖',
    glowColor: '#fbbf24',
  },
  {
    id: 'diamond-hands',
    name: 'Diamond Hands',
    bg: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
    icon: '✨',
    glowColor: '#38bdf8',
  },
  {
    id: 'trenches-degen',
    name: 'Trenches Degen',
    bg: 'linear-gradient(135deg, #f43f5e 0%, #f97316 100%)',
    icon: '🔥',
    glowColor: '#f43f5e',
  },
  {
    id: 'matrix-hacker',
    name: 'Matrix Hacker',
    bg: 'linear-gradient(135deg, #10b981 0%, #064e3b 100%)',
    icon: '👾',
    glowColor: '#10b981',
  },
  {
    id: 'whale-watcher',
    name: 'Whale Watcher',
    bg: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    icon: '🐋',
    glowColor: '#a855f7',
  },
]

export const THEMES = [
  { id: 'theme-pulse-neon', name: 'Pulse Neon', color: '#00ff9d', desc: 'Emerald & Pulse Magenta' },
  { id: 'theme-cyber-cyan', name: 'Cyber Cyan', color: '#00e5ff', desc: 'Electric Cyan & Deep Blue' },
  { id: 'theme-midnight-void', name: 'Midnight Void', color: '#a855f7', desc: 'OLED Black & Amethyst' },
  { id: 'theme-matrix-green', name: 'Matrix Emerald', color: '#10b981', desc: 'Terminal Green & Neon' },
  { id: 'theme-solar-gold', name: 'Solar Gold', color: '#fbbf24', desc: 'Amber Gold & Rose' },
]

const DEFAULT_PROFILE = {
  displayName: 'Pulse Trader',
  username: 'pulse_degen',
  bio: 'Hunting alpha on PulseChain 🚀',
}

const DEFAULT_PREFERENCES = {
  slippage: '0.5',
  customSlippage: '',
  gasPriority: 'fast',
  defaultCurrency: 'USD',
  chartInterval: '15m',
  autoHideSpam: true,
  soundFxEnabled: true,
  privacyMode: false,
  themeColor: 'theme-pulse-neon',
}

const INITIAL_NOTES = [
  {
    id: 'note-1',
    token: 'PLS / PLSX',
    note: 'Accumulate PLS on dips under $0.000014, target 5x-10x during cycle peak.',
    type: 'Strategy',
    timestamp: new Date().toLocaleDateString(),
  },
  {
    id: 'note-2',
    token: 'HEX',
    note: 'Check staking ladder rewards on PulseChain v2 app.',
    type: 'Reminder',
    timestamp: new Date().toLocaleDateString(),
  },
]

// Client-Side Canvas Image Compression Helper (Output: compact WebP/JPEG Data URL)
export function compressImageFile(file, maxWidth = 320, maxHeight = 320, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'))
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height)
            height = maxHeight
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve(compressedDataUrl)
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = event.target.result
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

// Web Audio API Synth Sound Player
export function playChimeSound(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    
    if (type === 'success' || type === 'swap') {
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()

      osc1.type = 'sine'
      osc2.type = 'triangle'
      
      const now = ctx.currentTime
      osc1.frequency.setValueAtTime(587.33, now) // D5
      osc1.frequency.exponentialRampToValueAtTime(880.00, now + 0.12) // A5
      
      osc2.frequency.setValueAtTime(880.00, now)
      osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.16) // D6

      gain.gain.setValueAtTime(0.08, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)

      osc1.start(now)
      osc2.start(now)
      osc1.stop(now + 0.25)
      osc2.stop(now + 0.25)
    } else if (type === 'click') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const now = ctx.currentTime

      osc.type = 'sine'
      osc.frequency.setValueAtTime(800, now)
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.04)

      gain.gain.setValueAtTime(0.03, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.05)
    } else if (type === 'toggle') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const now = ctx.currentTime

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08)

      gain.gain.setValueAtTime(0.04, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.09)
    }
  } catch {
    // Ignore audio errors if browser blocks autoplay
  }
}

export function UserProfileProvider({ children }) {
  const { account } = useSiweAuth()

  /**
   * The signed-in identity, as far as this context is concerned.
   *
   * The browser-side user vault it used to write through has been retired
   * along with password auth. Profile data still persists to localStorage
   * below, which is device-local and honest for now; the server-backed store
   * lands with the profile page, and `updateCurrentUser` becomes its write
   * path then. Kept as a no-op rather than deleted so the ~10 call sites
   * downstream do not have to be rewritten twice.
   */
  // Memoised on the address. Built inline it was a fresh object every render,
  // which re-ran the sync effect below and rebuilt eight useCallbacks on every
  // pass - defeating the memoisation they exist for.
  const currentUser = useMemo(
    () => (account ? { id: account, username: account } : null),
    [account]
  )
  const updateCurrentUser = useCallback(() => {}, [])

  // 1. Profile Data - scoped to the signed-in account.
  const [profile, setProfile] = useState(() => ({
    ...DEFAULT_PROFILE,
    ...readScoped('user_profile', account, {}),
  }))

  // 2. Preferences
  const [preferences, setPreferences] = useState(() => ({
    ...DEFAULT_PREFERENCES,
    ...readScoped('user_preferences', account, {}),
  }))

  // 3. Trade Notes Journal
  const [tradeNotes, setTradeNotes] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey('trade_notes', account))
      return saved ? JSON.parse(saved) : INITIAL_NOTES
    } catch {
      return INITIAL_NOTES
    }
  })

  // 4. Modal Open State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  /**
   * Load this account's own profile whenever the signed-in address changes.
   *
   * Without this, signing out of one wallet and into another left the previous
   * account's display name, bio and trade notes on screen: the state had been
   * read once at mount and never reloaded. Scoping the storage keys fixes what
   * is written; this is what fixes what is shown.
   */
  useEffect(() => {
    purgeLegacyKeys()
    setProfile({ ...DEFAULT_PROFILE, ...readScoped('user_profile', account, {}) })
    setPreferences({ ...DEFAULT_PREFERENCES, ...readScoped('user_preferences', account, {}) })

    const notes = readScoped('trade_notes', account, null)
    setTradeNotes(Array.isArray(notes) ? notes : INITIAL_NOTES)
  }, [account])

  // Save profile changes
  const updateProfile = useCallback(
    (updates) => {
      setProfile((prev) => {
        const next = { ...prev, ...updates }
        writeScoped('user_profile', account, next)
        if (currentUser) {
          updateCurrentUser({ profile: next })
        }
        return next
      })
    },
    [account, currentUser, updateCurrentUser]
  )

  // Save preferences changes
  const updatePreferences = useCallback(
    (updates) => {
      setPreferences((prev) => {
        const next = { ...prev, ...updates }
        writeScoped('user_preferences', account, next)
        if (currentUser) {
          updateCurrentUser({ preferences: next })
        }
        return next
      })
    },
    [account, currentUser, updateCurrentUser]
  )

  // Manage Trade Notes
  const addTradeNote = useCallback(
    (noteObj) => {
      setTradeNotes((prev) => {
        const newNote = {
          id: `note-${Date.now()}`,
          timestamp: new Date().toLocaleDateString(),
          type: 'Note',
          ...noteObj,
        }
        const next = [newNote, ...prev]
        writeScoped('trade_notes', account, next)
        if (currentUser) {
          updateCurrentUser({ tradeNotes: next })
        }
        return next
      })
    },
    [account, currentUser, updateCurrentUser]
  )

  const deleteTradeNote = useCallback(
    (id) => {
      setTradeNotes((prev) => {
        const next = prev.filter((n) => n.id !== id)
        writeScoped('trade_notes', account, next)
        if (currentUser) {
          updateCurrentUser({ tradeNotes: next })
        }
        return next
      })
    },
    [account, currentUser, updateCurrentUser]
  )

  // Apply Theme & Privacy classes to root
  useEffect(() => {
    const root = document.documentElement
    THEMES.forEach((t) => root.classList.remove(t.id))
    if (preferences.themeColor) {
      root.classList.add(preferences.themeColor)
    }

    if (preferences.privacyMode) {
      root.classList.add('privacy-mode-enabled')
    } else {
      root.classList.remove('privacy-mode-enabled')
    }
  }, [preferences.themeColor, preferences.privacyMode])

  // Export full profile & settings data
  const exportProfileData = useCallback(() => {
    const data = {
      profile,
      preferences,
      tradeNotes,
      user: currentUser ? { username: currentUser.username, id: currentUser.id } : null,
      exportedAt: new Date().toISOString(),
      app: 'PulseDex',
      version: '1.2.0',
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pulsedex_profile_backup_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [profile, preferences, tradeNotes, currentUser])

  // Import profile & settings data
  const importProfileData = useCallback(
    (jsonData) => {
      try {
        const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData
        if (parsed.profile) {
          setProfile(parsed.profile)
          writeScoped('user_profile', account, parsed.profile)
        }
        if (parsed.preferences) {
          setPreferences(parsed.preferences)
          writeScoped('user_preferences', account, parsed.preferences)
        }
        if (parsed.tradeNotes && Array.isArray(parsed.tradeNotes)) {
          setTradeNotes(parsed.tradeNotes)
          writeScoped('trade_notes', account, parsed.tradeNotes)
        }
        if (currentUser) {
          updateCurrentUser({
            profile: parsed.profile || profile,
            preferences: parsed.preferences || preferences,
            tradeNotes: parsed.tradeNotes || tradeNotes,
          })
        }
        return { success: true }
      } catch (err) {
        console.error('Failed to parse imported profile JSON:', err)
        return { success: false, error: err.message }
      }
    },
    [account, currentUser, updateCurrentUser, profile, preferences, tradeNotes]
  )

  // Reset profile to default
  const resetProfile = useCallback(() => {
    setProfile(DEFAULT_PROFILE)
    setPreferences(DEFAULT_PREFERENCES)
    setTradeNotes(INITIAL_NOTES)
    localStorage.removeItem('pulsedex_user_profile')
    localStorage.removeItem('pulsedex_user_preferences')
    localStorage.removeItem('pulsedex_trade_notes')
    if (currentUser) {
      updateCurrentUser({
        profile: DEFAULT_PROFILE,
        preferences: DEFAULT_PREFERENCES,
        tradeNotes: INITIAL_NOTES,
      })
    }
  }, [account, currentUser, updateCurrentUser])

  // Trigger sound effect if enabled
  const triggerSound = useCallback(
    (type = 'click') => {
      if (preferences.soundFxEnabled) {
        playChimeSound(type)
      }
    },
    [preferences.soundFxEnabled]
  )

  // Current active avatar definition
  const activeAvatarDef =
    PRESET_AVATARS.find((a) => a.id === profile.avatarId) || PRESET_AVATARS[0]

  return (
    <UserProfileContext.Provider
      value={{
        profile,
        preferences,
        tradeNotes,
        activeAvatarDef,
        isProfileModalOpen,
        openProfileModal: () => setIsProfileModalOpen(true),
        closeProfileModal: () => setIsProfileModalOpen(false),
        updateProfile,
        updatePreferences,
        addTradeNote,
        deleteTradeNote,
        exportProfileData,
        importProfileData,
        resetProfile,
        triggerSound,
      }}
    >
      {children}
    </UserProfileContext.Provider>
  )
}

export function useUserProfile() {
  const context = useContext(UserProfileContext)
  if (!context) {
    throw new Error('useUserProfile must be used within a UserProfileProvider')
  }
  return context
}
