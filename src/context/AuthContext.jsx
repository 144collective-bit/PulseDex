import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  getAllUsers,
  registerUser,
  authenticateUser,
  saveUser,
  getActiveSession,
  setActiveSession,
  clearActiveSession,
  setUserSecurityPin,
} from '../services/userStorage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [isLoadingAuth, setIsLoadingAuth] = useState(true)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState('signin') // 'signin' | 'signup'

  // Restore session on mount
  useEffect(() => {
    async function restoreSession() {
      try {
        const session = getActiveSession()
        if (session && session.userId) {
          const users = await getAllUsers()
          const matched = users.find((u) => u.id === session.userId)
          if (matched) {
            setCurrentUser(matched)
          } else {
            clearActiveSession()
          }
        }
      } catch (err) {
        console.error('Failed to restore auth session:', err)
      } finally {
        setIsLoadingAuth(false)
      }
    }

    restoreSession()
  }, [])

  // Open Auth Modal
  const openAuthModal = useCallback((mode = 'signin') => {
    setAuthMode(mode)
    setIsAuthModalOpen(true)
  }, [])

  // Close Auth Modal
  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false)
  }, [])

  // Sign Up with email/username + password
  const signUp = useCallback(
    async (userData) => {
      const newUser = await registerUser(userData)
      setCurrentUser(newUser)
      setActiveSession({
        userId: newUser.id,
        username: newUser.username,
        signedInAt: new Date().toISOString(),
      })
      setIsAuthModalOpen(false)
      return newUser
    },
    []
  )

  // Sign In with Username/Email + Password
  const signIn = useCallback(
    async ({ identifier, password }) => {
      const user = await authenticateUser(identifier, password)
      setCurrentUser(user)
      setActiveSession({
        userId: user.id,
        username: user.username,
        signedInAt: new Date().toISOString(),
      })
      setIsAuthModalOpen(false)
      return user
    },
    []
  )

  // Set / Update Security PIN for User
  const updateSecurityPin = useCallback(
    async (pin) => {
      if (!currentUser?.id) return null
      const updated = await setUserSecurityPin(currentUser.id, pin)
      setCurrentUser(updated)
      return updated
    },
    [currentUser]
  )

  // Sign Out
  const signOut = useCallback(() => {
    setCurrentUser(null)
    clearActiveSession()
  }, [])

  // Update current user data (profile, preferences, notes)
  const updateCurrentUser = useCallback(
    async (updates) => {
      if (!currentUser) return null
      const updatedUser = {
        ...currentUser,
        ...updates,
        profile: updates.profile ? { ...currentUser.profile, ...updates.profile } : currentUser.profile,
        preferences: updates.preferences
          ? { ...currentUser.preferences, ...updates.preferences }
          : currentUser.preferences,
      }
      setCurrentUser(updatedUser)
      await saveUser(updatedUser)
      return updatedUser
    },
    [currentUser]
  )

  const value = {
    currentUser,
    isAuthenticated: Boolean(currentUser),
    isLoadingAuth,
    isAuthModalOpen,
    authMode,
    setAuthMode,
    openAuthModal,
    closeAuthModal,
    signUp,
    signIn,
    signOut,
    updateCurrentUser,
    updateSecurityPin,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
