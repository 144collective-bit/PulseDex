import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSiweAuth } from '../context/SiweAuthContext'
import { readScoped, writeScoped } from '../utils/profileStorage'
import { DEFAULT_FILTERS, normalizeFilters } from '../utils/trenchBoard'
import { DEFAULT_QUALITY, normalizeQuality } from '../utils/trenchQuality'
import { TRENCH_COLUMNS } from '../config/pumptires'

const STORE = 'trench_board_view'

/** Sorts and the feed each column is reading, keyed by column id. */
function defaultOrders() {
  const orders = {}
  for (const col of TRENCH_COLUMNS) {
    orders[col.id] = { sort: 'default', feed: col.filter }
  }
  return orders
}

/**
 * Reject a stored feed that is not one this column offers.
 *
 * Storage is hand-editable and the launchpad returns an empty list for any
 * filter it does not recognise - a bad stored value would present as a column
 * that is permanently empty for one person and fine for everyone else.
 */
function sanitizeOrders(stored) {
  const base = defaultOrders()
  if (!stored || typeof stored !== 'object') return base

  for (const col of TRENCH_COLUMNS) {
    const saved = stored[col.id]
    if (!saved) continue

    const feeds = col.feeds || [col.filter]
    base[col.id] = {
      sort: typeof saved.sort === 'string' ? saved.sort : 'default',
      feed: feeds.includes(saved.feed) ? saved.feed : col.filter,
    }
  }
  return base
}

/**
 * The board's filters, per-column ordering and row counts.
 *
 * Persisted per account, like the rest of the profile: a filtered board is a
 * personal working state, and on a shared machine the next person to sign in
 * should not inherit someone else's view of the launchpad.
 */
export function useTrenchBoardView() {
  const { account } = useSiweAuth()

  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [orders, setOrders] = useState(defaultOrders)

  /*
   * The launch-quality signals, held apart from the bar's filters.
   *
   * They belong to New Launches alone - the column where scripted launches
   * actually arrive - and its heading is where the control lives. Keeping them
   * out of the shared filter object is what stops the bar's badge counting a
   * control that is not in the bar and its Clear button reaching into another
   * column's heading.
   */
  const [quality, setQuality] = useState(DEFAULT_QUALITY)

  // Guards the write-back below. Without it the first render after an account
  // change would persist the previous account's view into the new scope.
  const loadedFor = useRef(null)

  useEffect(() => {
    const stored = readScoped(STORE, account, null)
    setFilters(normalizeFilters(stored?.filters))
    setOrders(sanitizeOrders(stored?.orders))
    setQuality(normalizeQuality(stored?.quality))
    loadedFor.current = account || null
  }, [account])

  /*
   * One writer for the whole view.
   *
   * The three pieces live in separate state, but they share a storage record,
   * so every update has to write the other two as they currently are. A ref
   * mirror keeps that honest without each setter having to reach into the
   * others' updater functions.
   */
  const viewRef = useRef({ filters: DEFAULT_FILTERS, orders: defaultOrders(), quality: DEFAULT_QUALITY })

  useEffect(() => {
    viewRef.current = { filters, orders, quality }
  }, [filters, orders, quality])

  const persist = useCallback(
    (patch) => {
      if (loadedFor.current !== (account || null)) return
      const next = { ...viewRef.current, ...patch }
      viewRef.current = next
      writeScoped(STORE, account, next)
    },
    [account]
  )

  const updateFilters = useCallback(
    (next) => {
      const clean = normalizeFilters(next)
      setFilters(clean)
      persist({ filters: clean })
    },
    [persist]
  )

  const resetFilters = useCallback(() => updateFilters(DEFAULT_FILTERS), [updateFilters])

  const updateQuality = useCallback(
    (next) => {
      const clean = normalizeQuality(next)
      setQuality(clean)
      persist({ quality: clean })
    },
    [persist]
  )

  const setColumnOrder = useCallback(
    (columnId, patch) => {
      setOrders((prev) => {
        const next = { ...prev, [columnId]: { ...prev[columnId], ...patch } }
        persist({ orders: next })
        return next
      })
    },
    [persist]
  )

  /*
   * Row counts reported by each column.
   *
   * Held in a ref and mirrored into state on a change, so a column reporting
   * the same numbers on every 30-second poll does not re-render the board.
   */
  const countsRef = useRef({})
  const [counts, setCounts] = useState({})

  const reportCounts = useCallback((columnId, next) => {
    const prev = countsRef.current[columnId]
    if (prev && prev.shown === next.shown && prev.loaded === next.loaded) return

    countsRef.current = { ...countsRef.current, [columnId]: next }
    setCounts(countsRef.current)
  }, [])

  const totals = useMemo(() => {
    let shown = 0
    let loaded = 0
    for (const id of Object.keys(counts)) {
      shown += counts[id].shown
      loaded += counts[id].loaded
    }
    return { shown, loaded }
  }, [counts])

  return {
    filters,
    updateFilters,
    resetFilters,
    quality,
    updateQuality,
    orders,
    setColumnOrder,
    reportCounts,
    totals,
  }
}
