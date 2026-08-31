import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSiweAuth } from '../context/SiweAuthContext'
import { readScoped, writeScoped } from '../utils/profileStorage'

/** Storage name; the scope suffix is added per account by profileStorage. */
const STORE = 'trench_watchlist'

/**
 * Starred launchpad tokens.
 *
 * Scoped to the signed-in account like the rest of the profile: a shared
 * machine must not show one wallet's list to the next person who signs in, and
 * a signed-out visitor writes into the guest scope rather than into whichever
 * account was last used.
 *
 * Stored as a plain array of addresses rather than the token objects. The board
 * re-fetches those every 30 seconds anyway, and a cached token would go stale
 * the moment its price moved.
 */
export function useTrenchWatchlist() {
  const { account } = useSiweAuth()
  const [addresses, setAddresses] = useState([])

  // Reload whenever the account changes, including on sign-out, so the list on
  // screen always belongs to whoever is signed in now.
  useEffect(() => {
    const stored = readScoped(STORE, account, null)
    setAddresses(Array.isArray(stored?.addresses) ? stored.addresses : [])
  }, [account])

  const set = useMemo(
    () => new Set(addresses.map((a) => a.toLowerCase())),
    [addresses]
  )

  const toggle = useCallback(
    (address) => {
      if (!address) return
      const lower = address.toLowerCase()

      setAddresses((prev) => {
        const next = prev.some((a) => a.toLowerCase() === lower)
          ? prev.filter((a) => a.toLowerCase() !== lower)
          : [address, ...prev]

        writeScoped(STORE, account, { addresses: next })
        return next
      })
    },
    [account]
  )

  const isWatched = useCallback((address) => set.has(address?.toLowerCase()), [set])

  return { watchlist: addresses, watchedSet: set, isWatched, toggle, count: addresses.length }
}
