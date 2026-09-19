import { useCallback, useEffect, useRef, useState } from 'react'
import { useSiweAuth } from '../context/SiweAuthContext'
import { useUserProfile } from '../context/UserProfileContext'
import { fetchMyProfile, saveMyProfile } from '../services/profile'
import { hasSupabase } from '../config/supabase'

/**
 * Who this wallet is in the chat, according to the server.
 *
 * There are two profiles in this app and they are not the same thing. The one
 * in UserProfileContext belongs to a browser: theme, sounds, trade notes, and
 * a display name that has always been editable in Profile settings. This one
 * belongs to an account, and is what other people see.
 *
 * They are kept in step in one direction only - local to server, on sign-in
 * and whenever the local name changes. That keeps Profile settings as the
 * single place anybody edits a name, rather than adding a second door to the
 * same room, while the server stays the authority on what is displayed and on
 * who holds which handle.
 *
 * The asymmetry is a deliberate simplification and worth naming: a name
 * claimed on one device does not propagate back to another device's local
 * settings until that device saves something. What it does do is stop the
 * second device silently renaming the account, which is what happened before.
 */
export function useChatIdentity() {
  const { isSignedIn, account } = useSiweAuth()
  const { profile } = useUserProfile()

  const [identity, setIdentity] = useState(null)
  const [error, setError] = useState(null)

  /*
   * What was last pushed, so an unchanged name is not written on every render.
   * Held in a ref rather than state because nothing renders differently for
   * it - it exists only to stop a redundant request.
   */
  const lastPushed = useRef(null)

  const wanted = {
    handle: profile?.displayName || null,
    avatarId: profile?.avatarId || null,
  }
  const wantedKey = `${wanted.handle}:${wanted.avatarId}`

  useEffect(() => {
    if (!isSignedIn || !account || !hasSupabase) {
      setIdentity(null)
      lastPushed.current = null
      return undefined
    }

    let active = true

    fetchMyProfile()
      .then(async (server) => {
        if (!active) return

        /*
         * Push only when the local name differs from what the server holds.
         * A first sign-in with no server profile therefore claims the local
         * name, and an account that already matches costs one GET.
         */
        if (server.handle === wanted.handle && server.avatarId === wanted.avatarId) {
          setIdentity(server)
          lastPushed.current = wantedKey
          return
        }

        if (lastPushed.current === wantedKey) {
          // Already tried this exact pair and the server kept its own - most
          // likely the handle is taken. Show what the server says rather than
          // asking again on every render.
          setIdentity(server)
          return
        }

        try {
          const saved = await saveMyProfile(wanted)
          if (!active) return
          setIdentity(saved)
          setError(null)
        } catch (err) {
          if (!active) return
          // The server's name stands; say why the local one did not take.
          setIdentity(server)
          setError(err.message)
        } finally {
          lastPushed.current = wantedKey
        }
      })
      .catch((err) => {
        if (active) setError(err.message)
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, account, wantedKey])

  const clearError = useCallback(() => setError(null), [])

  return { identity, error, clearError }
}
