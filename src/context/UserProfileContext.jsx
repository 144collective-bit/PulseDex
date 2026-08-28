import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'

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
  const { currentUser, updateCurrentUser } = useAuth()

  // 1. Profile Data
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('pulsedex_user_profile')
      return saved ? { ...DEFAULT_PROFILE, ...JSON.parse(saved) } : DEFAULT_PROFILE
    } catch {
      return DEFAULT_PROFILE
    }
  })

  // 2. Preferences
  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem('pulsedex_user_preferences')
      return saved ? { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) } : DEFAULT_PREFERENCES
    } catch {
      return DEFAULT_PREFERENCES
    }
  })

  // 3. Trade Notes Journal
  const [tradeNotes, setTradeNotes] = useState(() => {
    try {
      const saved = localStorage.getItem('pulsedex_trade_notes')
      return saved ? JSON.parse(saved) : INITIAL_NOTES
    } catch {
      return INITIAL_NOTES
    }
  })

  // 4. Modal Open State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  // Synchronize state when authenticated currentUser changes
  useEffect(() => {
    if (currentUser) {
      if (currentUser.profile) {
        setProfile((prev) => {
          const merged = { ...DEFAULT_PROFILE, ...prev, ...currentUser.profile }
          localStorage.setItem('pulsedex_user_profile', JSON.stringify(merged))
          return merged
        })
      }
      if (currentUser.preferences) {
        setPreferences((prev) => {
          const merged = { ...DEFAULT_PREFERENCES, ...prev, ...currentUser.preferences }
          localStorage.setItem('pulsedex_user_preferences', JSON.stringify(merged))
          return merged
        })
      }
      if (currentUser.tradeNotes && Array.isArray(currentUser.tradeNotes) && currentUser.tradeNotes.length > 0) {
        setTradeNotes(currentUser.tradeNotes)
        localStorage.setItem('pulsedex_trade_notes', JSON.stringify(currentUser.tradeNotes))
      }
    }
  }, [currentUser])

  // Save profile changes
  const updateProfile = useCallback(
    (updates) => {
      setProfile((prev) => {
        const next = { ...prev, ...updates }
        localStorage.setItem('pulsedex_user_profile', JSON.stringify(next))
        if (currentUser) {
          updateCurrentUser({ profile: next })
        }
        return next
      })
    },
    [currentUser, updateCurrentUser]
  )

  // Save preferences changes
  const updatePreferences = useCallback(
    (updates) => {
      setPreferences((prev) => {
        const next = { ...prev, ...updates }
        localStorage.setItem('pulsedex_user_preferences', JSON.stringify(next))
        if (currentUser) {
          updateCurrentUser({ preferences: next })
        }
        return next
      })
    },
    [currentUser, updateCurrentUser]
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
        localStorage.setItem('pulsedex_trade_notes', JSON.stringify(next))
        if (currentUser) {
          updateCurrentUser({ tradeNotes: next })
        }
        return next
      })
    },
    [currentUser, updateCurrentUser]
  )

  const deleteTradeNote = useCallback(
    (id) => {
      setTradeNotes((prev) => {
        const next = prev.filter((n) => n.id !== id)
        localStorage.setItem('pulsedex_trade_notes', JSON.stringify(next))
        if (currentUser) {
          updateCurrentUser({ tradeNotes: next })
        }
        return next
      })
    },
    [currentUser, updateCurrentUser]
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
          localStorage.setItem('pulsedex_user_profile', JSON.stringify(parsed.profile))
        }
        if (parsed.preferences) {
          setPreferences(parsed.preferences)
          localStorage.setItem('pulsedex_user_preferences', JSON.stringify(parsed.preferences))
        }
        if (parsed.tradeNotes && Array.isArray(parsed.tradeNotes)) {
          setTradeNotes(parsed.tradeNotes)
          localStorage.setItem('pulsedex_trade_notes', JSON.stringify(parsed.tradeNotes))
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
    [currentUser, updateCurrentUser, profile, preferences, tradeNotes]
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
  }, [currentUser, updateCurrentUser])

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
