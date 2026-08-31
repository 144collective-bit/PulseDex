import { useCallback, useEffect, useRef, useState } from 'react'
import { useSiweAuth } from '../context/SiweAuthContext'
import { readScoped, writeScoped } from '../utils/profileStorage'
import { DEFAULT_CHART_SETTINGS, normalizeChartSettings } from '../config/chartTools'

const STORE = 'chart_settings'

/**
 * The reader's chart setup, remembered between visits.
 *
 * Scoped per account like the watchlist and the board filters: a chart set up
 * with three studies is a working preference, and on a shared machine the next
 * person to sign in should get their own, not inherit it.
 *
 * One setup for every pair rather than one per pair. Someone who works with
 * EMAs wants them on whatever they open next; having to re-enable them per
 * token would make the memory worse than useless.
 */
export function useChartSettings() {
  const { account } = useSiweAuth()
  const [settings, setSettings] = useState(DEFAULT_CHART_SETTINGS)

  // Guards the write-back: without it the first render after an account change
  // would persist the previous account's setup into the new scope.
  const loadedFor = useRef(null)

  useEffect(() => {
    setSettings(normalizeChartSettings(readScoped(STORE, account, null)))
    loadedFor.current = account || null
  }, [account])

  const update = useCallback(
    (patch) => {
      setSettings((prev) => {
        const next = normalizeChartSettings({ ...prev, ...patch })
        if (loadedFor.current === (account || null)) writeScoped(STORE, account, next)
        return next
      })
    },
    [account]
  )

  /** Add or remove one moving-average period. */
  const toggleMa = useCallback(
    (kind, period) => {
      const current = settings[kind] || []
      const next = current.includes(period)
        ? current.filter((p) => p !== period)
        : [...current, period].sort((a, b) => a - b)
      update({ [kind]: next })
    },
    [settings, update]
  )

  const togglePane = useCallback(
    (id) => update({ panes: { ...settings.panes, [id]: !settings.panes[id] } }),
    [settings.panes, update]
  )

  /**
   * Choosing a period also switches RSI on.
   *
   * Picking "21" from a menu is the act of asking for RSI; making that a
   * second click on a separate toggle would be a step that exists only because
   * the state has two fields in it.
   */
  const setRsiPeriod = useCallback(
    (period) => update({ rsiPeriod: period, panes: { ...settings.panes, rsi: true } }),
    [settings.panes, update]
  )

  const reset = useCallback(() => update(DEFAULT_CHART_SETTINGS), [update])

  return { settings, update, toggleMa, togglePane, setRsiPeriod, reset }
}
