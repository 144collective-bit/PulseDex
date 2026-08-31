import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** How long a freshly arrived row stays highlighted. */
const FLASH_MS = 45_000

/** How long an alert stays on screen before it fades itself out. */
const ALERT_MS = 9_000

/** Never stack more than this many; the newest win. */
const MAX_ALERTS = 3

/** Prune pass for expired flashes and alerts. */
const TICK_MS = 2_000

let alertSeq = 0

/**
 * What changed on the board since you last looked.
 *
 * Three things are worth interrupting for: a token arriving on New Launches, a
 * token graduating, and the King of the Hill changing hands. All three are
 * derived by diffing successive polls rather than pushed by the launchpad,
 * which has no socket - so the first list to arrive only primes the baseline
 * and never fires, or opening the tab would announce forty graduations at once.
 *
 * In-page only. Nothing here plays a sound.
 */
export function useBoardAlerts({ newTokens, gradTokens, kothTokens, enabled = true }) {
  const [flashes, setFlashes] = useState(() => new Map())
  const [alerts, setAlerts] = useState([])

  const seenNew = useRef(null)
  const seenGrad = useRef(null)
  const kothLeader = useRef(null)

  const push = useCallback((alert) => {
    alertSeq += 1
    setAlerts((prev) => [...prev, { ...alert, id: alertSeq, at: Date.now() }].slice(-MAX_ALERTS))
  }, [])

  const dismiss = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  // New arrivals.
  useEffect(() => {
    if (!enabled || !newTokens?.length) return

    if (!seenNew.current) {
      seenNew.current = new Set(newTokens.map((t) => t.address))
      return
    }

    const arrived = newTokens.filter((t) => !seenNew.current.has(t.address))
    if (!arrived.length) return

    for (const t of arrived) seenNew.current.add(t.address)

    const until = Date.now() + FLASH_MS
    setFlashes((prev) => {
      const next = new Map(prev)
      for (const t of arrived) next.set(t.address, until)
      return next
    })
  }, [newTokens, enabled])

  // Graduations.
  useEffect(() => {
    if (!enabled || !gradTokens?.length) return

    if (!seenGrad.current) {
      seenGrad.current = new Set(gradTokens.map((t) => t.address))
      return
    }

    const graduated = gradTokens.filter((t) => !seenGrad.current.has(t.address))
    for (const t of graduated) {
      seenGrad.current.add(t.address)
      push({ kind: 'grad', token: t })
    }
  }, [gradTokens, enabled, push])

  // A change at the top of King of the Hill.
  useEffect(() => {
    if (!enabled) return
    const leader = kothTokens?.[0]
    if (!leader) return

    if (kothLeader.current === null) {
      kothLeader.current = leader.address
      return
    }

    if (kothLeader.current !== leader.address) {
      kothLeader.current = leader.address
      push({ kind: 'koth', token: leader })
    }
  }, [kothTokens, enabled, push])

  // One timer for both expiries, rather than a timeout per row and per alert.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()

      setFlashes((prev) => {
        if (!prev.size) return prev
        let changed = false
        const next = new Map()
        for (const [address, until] of prev) {
          if (until > now) next.set(address, until)
          else changed = true
        }
        return changed ? next : prev
      })

      setAlerts((prev) => {
        const kept = prev.filter((a) => now - a.at < ALERT_MS)
        return kept.length === prev.length ? prev : kept
      })
    }, TICK_MS)

    return () => window.clearInterval(id)
  }, [])

  /*
   * The addresses currently flashing, as a Set.
   *
   * Memoised on the map itself, which only changes when a row arrives or a
   * flash expires - the prune tick returns the previous map untouched when it
   * removes nothing, so a quiet board does not rebuild this every two seconds.
   */
  const newAddresses = useMemo(() => new Set(flashes.keys()), [flashes])

  return { newAddresses, newCount: flashes.size, alerts, dismiss }
}
