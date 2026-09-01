import { useCallback, useEffect, useMemo, useState } from 'react'
import { readScoped, subscribeScoped, writeScoped } from '../../utils/profileStorage'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { useTopPairs } from './marketData'

/**
 * The watchlist, shared with the rest of PulseDEX.
 *
 * Deliberately reads and writes the same `watchlist` key the screener and
 * portfolio page already use, rather than giving the dashboard its own. Two
 * watchlists in one app is two answers to "what am I following", and users
 * would have to maintain both.
 *
 * The stored value is an array of lowercase pair addresses, in the user's own
 * order - so reordering is just moving an element.
 */

const KEY = 'watchlist'

export function useWatchlist() {
  const { account } = useSiweAuth()

  const [addresses, setAddresses] = useState(() => {
    const stored = readScoped(KEY, account, null)
    return Array.isArray(stored) ? stored : []
  })

  /*
   * Reload on an account change, and whenever another surface writes the list.
   *
   * Signing in as someone else must load their list rather than carry the last
   * one across - the same rule the rest of the scoped storage follows. The
   * subscription covers the other direction: the screener's star writes this
   * record too, and a module holding a stale copy would put back a list that
   * had already moved on.
   */
  useEffect(() => {
    const load = () => {
      const stored = readScoped(KEY, account, null)
      setAddresses(Array.isArray(stored) ? stored : [])
    }
    load()
    return subscribeScoped(KEY, load)
  }, [account])

  const commit = useCallback(
    (next) => {
      setAddresses(next)
      writeScoped(KEY, account, next)
    },
    [account],
  )

  const add = useCallback(
    (pairAddress) => {
      if (!pairAddress) return
      const addr = pairAddress.toLowerCase()
      if (addresses.includes(addr)) return
      commit([...addresses, addr])
    },
    [addresses, commit],
  )

  const remove = useCallback(
    (pairAddress) => commit(addresses.filter((a) => a !== pairAddress?.toLowerCase())),
    [addresses, commit],
  )

  const move = useCallback(
    (pairAddress, direction) => {
      const addr = pairAddress?.toLowerCase()
      const index = addresses.indexOf(addr)
      const target = direction === 'up' ? index - 1 : index + 1
      if (index < 0 || target < 0 || target >= addresses.length) return
      const next = [...addresses]
      ;[next[index], next[target]] = [next[target], next[index]]
      commit(next)
    },
    [addresses, commit],
  )

  return { addresses, add, remove, move, has: (a) => addresses.includes(a?.toLowerCase()) }
}

/**
 * The watched pairs, with live figures, in the user's order.
 *
 * Resolved against the shared pair board rather than fetched separately, so a
 * watchlist costs no requests of its own. A watched pair that has dropped off
 * the board is skipped rather than rendered as an empty row.
 */
export function useWatchlistPairs() {
  const watchlist = useWatchlist()
  const { data: pairs, isLoading, isError, refetch } = useTopPairs()

  const rows = useMemo(() => {
    if (!pairs?.length) return []
    const byAddress = new Map(pairs.map((p) => [p.pairAddress?.toLowerCase(), p]))
    return watchlist.addresses.map((a) => byAddress.get(a)).filter(Boolean)
  }, [pairs, watchlist.addresses])

  return { ...watchlist, rows, isLoading, isError, refetch }
}
